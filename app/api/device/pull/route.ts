import { NextRequest, NextResponse } from "next/server";
import { autenticarDevice, touchDevice, deviceAceitaCategoria, setorCasa, idadeNaFila, liberadaAgora, type FilaRow } from "@/lib/device";
import { mapaDePecas, type PecaConfigRow } from "@/lib/atividades-pecas";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { setorDoDepartamento } from "@/lib/colaboradores-taxonomia";
import { presencaAgora } from "@/lib/ponto";
import { exigeBipeParaIniciar, MOTIVOS_DISPENSA } from "@/lib/atividade-bipes";
import { cached } from "@/lib/cache";
import { varrerSeNecessario } from "@/lib/estoque-automacao";
import { intervalosDoTablet, lancarIntervalos, hojeSp } from "@/lib/ponto-intervalos";
import { explodirNecessidades, type ComponenteDaFicha } from "@/lib/producao-em-cadeia";

export const dynamic = "force-dynamic";

const norm = (s: string | null | undefined) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

type Emp = { setor: string | null; departamento: string | null; pin: string | null; tablet: boolean | null; mesa: string | null; mesas: string[] | null; photo_url: string | null };
interface ColabRow {
  id: string; name: string; username: string; active: boolean; role: string;
  employees: Emp[] | Emp | null;
}

// GET /api/device/pull?since=<iso> — colaboradores, atividades e métricas.
// Incremental por `since` nas atividades.
export async function GET(req: NextRequest) {
  const auth = await autenticarDevice(req.headers.get("x-device-token"));
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  const device = auth.device;

  const since = req.nextUrl.searchParams.get("since");
  const db = createSupabaseAdminClient();

  // Colaboradores (pessoas que aparecem no seletor). Filtra pelo setor do
  // dispositivo quando definido; senão, todos os colaboradores ativos.
  const selProfs = (empCols: string) => db
    .from("profiles")
    .select(`id,name,username,active,role,employees(${empCols})`)
    .eq("active", true)
    .order("name", { ascending: true });
  // Resiliente: se `mesas` (multi-tablet) ainda não existe, cai pro select sem ela.
  let { data: profs, error: profsErr } = await selProfs("setor,departamento,pin,tablet,mesa,mesas,photo_url");
  if (profsErr && /mesas/.test(profsErr.message)) ({ data: profs } = await selProfs("setor,departamento,pin,tablet,mesa,photo_url"));
  const setorAlvo = norm(device.setor);
  const mesaAlvo = norm(device.nome_mesa);
  // SÓ quem o admin marcou "Aparece no tablet". Se a pessoa tem uma MESA definida,
  // aparece SÓ naquela mesa; senão, em todas as mesas do seu setor.
  // O setor pode não estar gravado (legado) — resolve pelo DEPARTAMENTO como fallback
  // (Produção/Design/Logística → "Produção"); e quem ficar sem setor NÃO é escondido.
  const colaboradores = ((profs ?? []) as ColabRow[])
    .map((r) => {
      const emp = Array.isArray(r.employees) ? r.employees[0] : r.employees;
      const setor = emp?.setor ?? setorDoDepartamento(emp?.departamento) ?? null;
      // Multi-tablet: lista de mesas onde a pessoa aparece; cai pra `mesa` (legado).
      const mesas = (emp?.mesas && emp.mesas.length ? emp.mesas : (emp?.mesa ? [emp.mesa] : [])).filter(Boolean) as string[];
      return { id: r.id, nome: r.name || r.username, setor, tem_pin: !!emp?.pin, tablet: !!emp?.tablet, mesas, foto_url: emp?.photo_url ?? null };
    })
    .filter((c) => c.tablet && (
      c.mesas.length ? c.mesas.some((m) => norm(m) === mesaAlvo) : (!setorAlvo || !c.setor || norm(c.setor).includes(setorAlvo))
    ))
    .map(({ id, nome, setor, tem_pin, foto_url }) => ({ id, nome, setor, tem_pin, foto_url }));

  // Presença via PONTO: "só aparece quem está no ponto". Presente (bateu entrada e
  // não saiu) = ativo; cadastrado mas fora = card cinza "Fora" (não recebe ordem).
  // Se NINGUÉM da mesa está no ponto (ainda não configurado), não bloqueia: mostra
  // todos como presentes (evita brickar o tablet antes do ponto estar em uso).
  const presenca = await presencaAgora(colaboradores.map((c) => c.id)).catch(() => ({ registrados: new Set<string>(), presentes: new Set<string>() }));
  const usaPonto = presenca.registrados.size > 0;
  const colaboradoresPresenca = colaboradores
    .filter((c) => !usaPonto || presenca.registrados.has(c.id))
    .map((c) => ({ ...c, presente: usaPonto ? presenca.presentes.has(c.id) : true }));

  // Início do dia (SP) — pro filtro de concluídas de hoje.
  const hojeIso = new Date(Date.UTC(
    new Date(Date.now() - 3 * 3600 * 1000).getUTCFullYear(),
    new Date(Date.now() - 3 * 3600 * 1000).getUTCMonth(),
    new Date(Date.now() - 3 * 3600 * 1000).getUTCDate(), 3, 0, 0,
  )).toISOString();
  const M = device.nome_mesa;

  // Modelo de entrega por tablet-alvo: a coluna mesa_alvo existe? Schema não
  // muda no ritmo do poll — a sonda vai pro cache de 5 min em vez de custar
  // uma consulta por tablet por ciclo só pra perguntar a mesma coisa.
  const temMesaAlvo = await cached("device:tem-mesa-alvo", 300_000, async () => {
    try { const { error } = await db.from("atividades").select("mesa_alvo").limit(1); return !error; } catch { return false; }
  }).catch(() => false);

  // AD-HOC: pessoas que NÃO são fixas deste tablet mas têm uma ordem DIRIGIDA com
  // mesa_alvo = este tablet. Aparecem aqui (present=true) pra receber/aceitar essa
  // ordem — é o que permite mandar qualquer um de Produção/Logística p/ qualquer tablet.
  let colaboradoresFinal = colaboradoresPresenca as { id: string; nome: string; setor: string | null; tem_pin: boolean; foto_url: string | null; presente: boolean }[];
  if (temMesaAlvo && M) {
    try {
      const { data: adhocActs } = await db.from("atividades").select("para_id")
        .eq("pool", false).eq("mesa_alvo", M).not("para_id", "is", null)
        .or(`status.neq.concluida,concluida_at.gte.${hojeIso}`);
      const regIds = new Set(colaboradoresPresenca.map((c) => c.id));
      const adhocIds = [...new Set(((adhocActs ?? []) as { para_id: string }[]).map((a) => a.para_id).filter(Boolean))].filter((id) => !regIds.has(id));
      if (adhocIds.length) {
        const { data: ap } = await db.from("profiles").select("id,name,username,employees(setor,photo_url,pin)").in("id", adhocIds);
        const adhoc = ((ap ?? []) as ColabRow[]).map((r) => {
          const emp = Array.isArray(r.employees) ? r.employees[0] : r.employees;
          return { id: r.id, nome: r.name || r.username, setor: emp?.setor ?? null, tem_pin: !!emp?.pin, foto_url: emp?.photo_url ?? null, presente: true };
        });
        colaboradoresFinal = [...colaboradoresPresenca, ...adhoc];
      }
    } catch { /* sem ad-hoc neste pull */ }
  }

  const ids = colaboradoresFinal.map((c) => c.id);

  // Atividades das pessoas do tablet (pendentes/em andamento, ou concluídas hoje).
  let aq = db.from("atividades").select("*")
    .or(`status.neq.concluida,concluida_at.gte.${hojeIso}`)
    .order("created_at", { ascending: false }).limit(1000);
  if (ids.length) aq = aq.in("para_id", ids);
  if (since) aq = aq.gt("created_at", since);
  const { data: atribuidasRaw } = await aq;

  // Entrega por tablet: pool (qualquer tablet do setor OU o alvo) + dirigidas cujo
  // mesa_alvo = ESTE tablet. Dirigida "só no sistema" (mesa_alvo null) NÃO cai no tablet.
  const atribuidas = (temMesaAlvo
    ? ((atribuidasRaw ?? []) as Record<string, unknown>[]).filter((a) => (a.pool === true && (a.mesa_alvo == null || a.mesa_alvo === M)) || (a.pool !== true && a.mesa_alvo === M))
    : (atribuidasRaw ?? [])) as Record<string, unknown>[];

  // POOL do setor: atividades pendentes SEM dono (modelo Uber) — entram na fila do tablet.
  let pool: Record<string, unknown>[] = [];
  try {
    const { data } = await db.from("atividades").select("*")
      .eq("status", "pendente").eq("pool", true).is("para_id", null)
      .order("created_at", { ascending: true }).limit(200);
    pool = ((data ?? []) as { setor: string | null; mesa_alvo?: string | null; categoria?: string | null }[]).filter((a) =>
      // 1) Pool com tablet-alvo → SÓ naquele tablet.
      // 2) Senão: a CATEGORIA tem que bater com a bancada (chancela × carimbo/clichê)
      //    — antes só olhava `setor`, e ordem sem setor caía em TODO tablet.
      ((temMesaAlvo && a.mesa_alvo != null)
        ? a.mesa_alvo === M
        : setorCasa(device.setor, a.setor))
      && deviceAceitaCategoria(device, a.categoria)
      // Não recusada (fila de recusadas). MESMO filtro do /device/claim: se só
      // o claim filtrasse, o tablet mostraria a ordem e receberia "pool vazio".
      && liberadaAgora(a as { liberada_apos?: string | null; impedida?: boolean | null })
    ) as Record<string, unknown>[];
    // URGENTE fura a fila; depois por FASE (ordem asc), depois o mais antigo.
    // Mesma regra do /device/claim: ordem DEVOLVIDA reentra pelo fim (vale
    // devolvida_em, não created_at) — senão ela reaparece na hora pra quem
    // acabou de devolver.
    pool.sort((a, b) => {
      const ua = a.urgente ? 0 : 1, ub = b.urgente ? 0 : 1;
      if (ua !== ub) return ua - ub;
      const oa = a.ordem == null ? Infinity : Number(a.ordem);
      const ob = b.ordem == null ? Infinity : Number(b.ordem);
      return oa !== ob ? oa - ob : idadeNaFila(a as unknown as FilaRow).localeCompare(idadeNaFila(b as unknown as FilaRow));
    });
    // Fila SEQUENCIAL: só a PRÓXIMA ordem cai no tablet. Quando alguém aceita
    // (claim → para_id), ela sai do pool e a próxima aparece no pull seguinte.
    pool = pool.slice(0, 1);
  } catch { /* coluna pool ainda não criada → sem fila */ }
  // Junta (sem duplicar) — atribuídas + pool. Os status da CADEIA ficam de
  // fora: `aguardando_material` ainda não pode ser feita (falta material) e
  // `cancelada` foi dispensada — pra bancada, nenhuma das duas existe. O filtro
  // de cima (`status.neq.concluida`) deixaria as duas passarem.
  const vistos = new Set(atribuidas.map((a) => a.id as string));
  let atividades = [...atribuidas, ...pool.filter((a) => !vistos.has(a.id as string))]
    .filter((a) => a.status !== "aguardando_material" && a.status !== "cancelada") as Record<string, unknown>[];

  // Foto do produto/peça (mostrada no ping do tablet), por DUAS portas:
  //  1. o produto vinculado à ordem (produto_nome) — quase nenhuma tem;
  //  2. o que a TAREFA produz, deduzido de `atividade_pecas` lida ao contrário:
  //     a linha "a peça X é produzida pela tarefa T" (tarefa_produz) responde
  //     "o que sai de T?" — é X. Era por faltar esta porta que o ping vivia sem
  //     foto: "Montar alavancas" tem imagem de Alavanca no catálogo, mas a
  //     ordem nasce só com a tarefa em texto.
  try {
    const tarefasImg = [...new Set(atividades.map((a) => String(a.tarefa || "").trim()).filter(Boolean))];
    const produzPorTarefa = new Map<string, string>();
    if (tarefasImg.length) {
      try {
        const { data: cfgProduz } = await db.from("atividade_pecas")
          .select("peca,tarefa_produz").in("tarefa_produz", tarefasImg).eq("ativo", true).limit(300);
        for (const c of (cfgProduz ?? []) as { peca: string; tarefa_produz: string | null }[]) {
          if (c.tarefa_produz && !produzPorTarefa.has(c.tarefa_produz)) produzPorTarefa.set(c.tarefa_produz, c.peca);
        }
      } catch { /* sem a tabela de peças: fica só a 1ª porta */ }
    }
    const nomes = [...new Set([
      ...(atividades.map((a) => a.produto_nome).filter(Boolean) as string[]),
      ...produzPorTarefa.values(),
    ])];
    if (nomes.length) {
      const { data: imgs } = await db.from("estoque_itens").select("nome,imagem_url").in("nome", nomes).limit(400);
      const imgMap = new Map((imgs ?? []).map((i: { nome: string; imagem_url: string | null }) => [i.nome, i.imagem_url]));
      atividades = atividades.map((a) => {
        const nome = (a.produto_nome as string | null)
          ?? produzPorTarefa.get(String(a.tarefa || "").trim()) ?? null;
        return { ...a, produto_imagem: nome ? (imgMap.get(nome) ?? null) : null };
      });
    }
  } catch { /* sem imagens neste pull */ }

  // PEÇAS de cada atividade, embutidas na própria ordem. Vão juntas (e não numa
  // rota separada) porque o tablet devolve OFFLINE: se a lista dependesse de uma
  // chamada na hora de devolver, sem rede a pessoa cairia no genérico "Outro" —
  // justo quando o motivo importa. Aqui já desce com a ordem e fica no cache.
  try {
    const tarefas = atividades.map((a) => String(a.tarefa || "")).filter(Boolean);
    if (tarefas.length) {
      const { data: cfg } = await db.from("atividade_pecas")
        .select("setor,tarefa,peca,tarefa_produz,categoria_produz")
        .in("tarefa", [...new Set(tarefas)]).eq("ativo", true);
      const mapa = mapaDePecas((cfg ?? []) as PecaConfigRow[], tarefas);
      atividades = atividades.map((a) => ({ ...a, pecas: mapa[String(a.tarefa || "")] ?? [] }));
    }
  } catch {
    // Sem a tabela (supabase/atividades_pecas.sql não rodado): manda a semente
    // do código, que já cobre a maior parte das tarefas de produção.
    try {
      const tarefas = atividades.map((a) => String(a.tarefa || "")).filter(Boolean);
      const mapa = mapaDePecas([], tarefas);
      atividades = atividades.map((a) => ({ ...a, pecas: mapa[String(a.tarefa || "")] ?? [] }));
    } catch { /* sem peças neste pull */ }
  }

  // A CADEIA da atividade automática: materiais da ficha técnica com a
  // quantidade PRA ESTE LOTE, a frase de origem e o selo `automatica`. Descem
  // com a ordem (offline-first, como as peças da devolução). Tolerante: sem
  // ficha/colunas novas, os campos não vão e o app usa os defaults.
  try {
    const ehAutomatica = (a: Record<string, unknown>) =>
      a.criada_por_automacao === true || a.por_nome === "Sistema (requisição)";
    const nomesAuto = [...new Set(atividades.filter(ehAutomatica)
      .map((a) => a.produto_nome).filter(Boolean) as string[])];
    const idPorNome = new Map<string, string>();
    const fichaPorItem = new Map<string, ComponenteDaFicha[]>();
    if (nomesAuto.length) {
      const { data: itensAuto } = await db.from("estoque_itens")
        .select("id,nome").in("nome", nomesAuto).limit(200);
      for (const i of (itensAuto ?? []) as { id: string; nome: string }[]) idPorNome.set(i.nome, i.id);
      const ids = [...idPorNome.values()];
      if (ids.length) {
        const { data: fichas } = await db.from("ficha_tecnica")
          .select("item_id,componente_id,quantidade").in("item_id", ids).limit(500);
        const compIds = [...new Set(((fichas ?? []) as { componente_id: string }[]).map((f) => f.componente_id))];
        const nomePorId = new Map<string, string>();
        if (compIds.length) {
          const { data: comps } = await db.from("estoque_itens").select("id,nome").in("id", compIds).limit(500);
          for (const c of (comps ?? []) as { id: string; nome: string }[]) nomePorId.set(c.id, c.nome);
        }
        for (const f of (fichas ?? []) as { item_id: string; componente_id: string; quantidade: number }[]) {
          const arr = fichaPorItem.get(f.item_id) ?? [];
          arr.push({ componenteId: f.componente_id, nome: nomePorId.get(f.componente_id) ?? "material", quantidade: Number(f.quantidade) || 0 });
          fichaPorItem.set(f.item_id, arr);
        }
      }
    }
    atividades = atividades.map((a) => {
      if (!ehAutomatica(a)) return a;
      const itemId = a.produto_nome ? idPorNome.get(a.produto_nome as string) : undefined;
      const alvo = Math.max(0, Number(a.quantidade_alvo) || 0);
      // A MESMA conta do motor (arredonda o total, nunca por unidade).
      const materiais = itemId
        ? explodirNecessidades(alvo, fichaPorItem.get(itemId) ?? [], new Map())
            .map((n) => ({ nome: n.nome, quantidade: n.necessario }))
        : [];
      return { ...a, automatica: true, materiais, origem_frase: a.origem_frase ?? null };
    });
  } catch { /* sem a cadeia neste pull */ }

  // Catálogo p/ o seletor "pedir" no app: só os itens marcados como requisitáveis
  // E cujo SETOR de requisição bate com o setor do dispositivo (Logística/Produção/Máquinas).
  let produtos: unknown[] = [];
  try {
    // Cadastro de item muda algumas vezes por dia; o pull roda a cada 12s por
    // mesa. O catálogo inteiro descia do Supabase em todo ciclo de todo tablet
    // — agora desce uma vez por minuto pra frota toda, e o filtro por setor
    // (que é por tablet) continua em JS, sobre o cache.
    const catalogo = await cached("device:catalogo-requisitaveis", 60_000, async () => {
      const { data, error } = await db.from("estoque_itens")
        .select("id,nome,categoria,imagem_url,tipo,setor_requisicao").eq("ativo", true).eq("requisitavel", true)
        .order("nome", { ascending: true });
      // supabase-js NÃO lança: sem isto uma falha transitória viraria um
      // catálogo vazio guardado por 60s (a lição do cache-guarda-a-falha).
      if (error) throw error;
      return data ?? [];
    });
    produtos = catalogo.filter((p: { setor_requisicao: string | null }) => !setorAlvo || norm(p.setor_requisicao).includes(setorAlvo) || setorAlvo.includes(norm(p.setor_requisicao)));
  } catch { /* sem catálogo neste pull */ }

  // Métricas (snapshot leve; tolerante a falha — fica null offline).
  let metricas: unknown = null;
  try {
    // O snapshot é o MESMO pra todos os tablets e é a parte mais cara do pull.
    // 30s de cache = no pior caso uma leitura a cada 30s pra frota inteira,
    // em vez de uma por tablet a cada 12s. Métrica de painel aguenta 30s.
    metricas = await cached("device:metricas-snapshot", 30_000, async () => {
      const { buildProductionSnapshot } = await import("@/lib/producao");
      return buildProductionSnapshot();
    });
  } catch {
    /* sem métricas neste pull */
  }

  // Exigir o bipe do material antes de aceitar? Um booleano numa linha única,
  // mas o pull roda a cada 12s POR TABLET e são várias mesas — sem cache seria
  // uma consulta ao Supabase por tablet por ciclo pra ler um campo que muda uma
  // vez por mês (é a lição de `/api/sales` e `/api/config` no CLAUDE.md: o que
  // não muda no ritmo do poll não se consulta no ritmo do poll).
  //
  // A janela de 60s é o atraso máximo entre alguém virar a chave no escritório
  // e a bancada obedecer — folgado pra uma exigência que ninguém liga e desliga
  // no meio do expediente.
  //
  // Os MOTIVOS da dispensa descem junto de propósito, e não numa rota separada:
  // a bancada trabalha sem Wi-Fi, e se a lista dependesse de uma chamada na
  // hora de dizer "não deu pra bipar", justo aí a pessoa ficaria sem opção.
  // Descem com o pull e ficam no cache do tablet, igual às peças da devolução.
  const exigeBipe = await cached("device:exige-bipe", 60_000, () => exigeBipeParaIniciar(db))
    .catch(() => false);

  // A varredura de reposição do dia, disparada TAMBÉM pelo tablet. Antes ela só
  // rodava dentro do GET de /api/estoque/producao-dia — quer dizer: a automação
  // do estoque só era automática se alguém do escritório abrisse aquela tela.
  // Num dia em que ninguém abre, a bancada não recebe nada (era o caso: a
  // `estoque_config.ultima_varredura` estava NULL com a automação ligada desde
  // 12/08). O tablet está de pé o expediente inteiro, então é ele quem garante.
  //
  // Barato pelos dois lados: `cached` segura a leitura da config por 5 min (o
  // pull roda a cada 12s por mesa) e a varredura de verdade só acontece uma vez
  // por dia — quem reivindica é um UPDATE condicional na linha da config, então
  // várias mesas chegando juntas não viram várias varreduras.
  await cached("device:varredura-reposicao", 300_000, () => varrerSeNecessario(db))
    .catch(() => undefined);

  // Intervalos da produção: a lista desce com o pull (cache de 5 min — muda
  // uma vez na vida) e o tablet decide sozinho, pelo relógio dele, quando
  // pausar e tocar. Vale offline. Ver lib/ponto-intervalos.ts.
  const intervalos = await cached("device:intervalos", 300_000, () => intervalosDoTablet(db))
    .catch(() => []);
  // Na hora seguinte ao fim de cada intervalo, o pull (que já está rodando o
  // expediente inteiro) lança as batidas no ponto. Uma vez por 10 min por
  // instância; fora dessa janela não custa consulta nenhuma. O cron da
  // madrugada (/api/ponto/limpeza) garante o que escapar daqui.
  const agoraSp = new Date(Date.now() - 3 * 3600e3).toISOString().slice(11, 16);
  if (intervalos.some((j) => agoraSp >= j.fim && agoraSp < somaHora(j.fim))) {
    const hoje = hojeSp();
    await cached(`device:lancar-intervalos:${hoje}:${agoraSp.slice(0, 4)}`, 600_000, () => lancarIntervalos({ de: hoje, ate: hoje }))
      .catch(() => undefined);
  }

  await touchDevice(device.id);

  return NextResponse.json({
    server_time: new Date().toISOString(),
    device: { nome_mesa: device.nome_mesa, setor: device.setor },
    colaboradores: colaboradoresFinal,
    atividades: atividades ?? [],
    produtos,
    metricas,
    config: {
      exige_bipe: exigeBipe,
      intervalos,
      motivos_dispensa: MOTIVOS_DISPENSA.map((m) => ({ key: m.key, label: m.label })),
    },
  });
}

function somaHora(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
