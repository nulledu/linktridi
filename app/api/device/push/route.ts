import { NextRequest, NextResponse } from "next/server";
import { autenticarDevice, jaProcessados, marcarProcessado, touchDevice } from "@/lib/device";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { autoAtribuirRequisicao, automacaoLigada } from "@/lib/requisicoes";
import { dispensarAtividade } from "@/lib/producao-dispensa";
import { conferirVale, ehTipoRecusa, type TipoRecusa } from "@/lib/atividades-autorizacao";
import { pecasDaTarefa, type PecaDaTarefa, type PecaConfigRow } from "@/lib/atividades-pecas";
import { TEMPO_PADRAO_MIN } from "@/lib/producao-receita";
import { baixarUnidades, ErroLoteBaixaGrande, ErroMotivoInvalido } from "@/lib/estoque-baixa";
import { ErroSchemaDesatualizado } from "@/lib/estoque-unidades-gerar";
import {
  normalizarCodigos, eventosDoConsumo, eventoDeDispensa, registrarBipes, uuidOuNulo,
  type EventoBipe,
} from "@/lib/atividade-bipes";

export const dynamic = "force-dynamic";

type Tipo = "iniciar" | "pausar" | "concluir" | "bloquear" | "devolver" | "dispensar" | "pedir_insumo" | "consumir" | "intervalo_volta";
interface Item {
  client_id: string;
  tipo: Tipo;
  atividade_id?: string;
  colaborador_id: string;
  colaborador_nome?: string;
  quantidade_feita?: number;
  foto_url?: string | null;
  motivo?: string;            // bloquear: por que não dá pra fazer
  // consumir: as etiquetas bipadas antes de aceitar a atividade, e/ou o motivo
  // de ter começado sem bipar nenhuma.
  codigos?: unknown;
  dispensa_motivo?: string;
  // Quando aconteceu NO TABLET (ISO). A bancada trabalha sem Wi-Fi e a fila
  // sobe junto depois; sem isto a manhã inteira ficaria carimbada no segundo
  // do flush.
  ocorrido_em?: string;
  // devolver: qual PEÇA faltou (rótulo exato de lib/atividades-pecas). Vazio =
  // motivo genérico ("Outro"), que só devolve com cooldown e não despacha nada.
  peca_faltante?: string;
  // devolver/dispensar: o vale do supervisor (lib/atividades-autorizacao).
  // Sem ele a recusa não aplica — o tablet não recusa mais sozinho.
  autorizacao?: string;
  // pedir_insumo:
  produto_nome?: string;
  quantidade?: number;
  observacao?: string;
  // intervalo_volta: o fim oficial da janela (ISO) e o início dela ("09:30").
  intervalo_fim?: string;
  janela?: string;
}

// POST /api/device/push { items: Item[] } — aplica a fila offline (idempotente).
export async function POST(req: NextRequest) {
  const auth = await autenticarDevice(req.headers.get("x-device-token"));
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  const device = auth.device;

  const body = (await req.json().catch(() => null)) as { items?: Item[] } | null;
  const items = body?.items ?? [];
  if (!Array.isArray(items)) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const db = createSupabaseAdminClient();
  const seen = await jaProcessados(items.map((i) => i.client_id).filter(Boolean));
  const results: { client_id: string; status: "ok" | "erro" | "conflito"; detail?: string }[] = [];

  for (const it of items) {
    if (!it.client_id) { results.push({ client_id: "", status: "erro", detail: "sem_client_id" }); continue; }
    if (seen.has(it.client_id)) { results.push({ client_id: it.client_id, status: "ok" }); continue; }
    try {
      if (it.tipo === "intervalo_volta") {
        // Toque de "voltei" do intervalo (TelaIntervalo.kt): guarda quanto a
        // pessoa demorou depois do fim. Sem a tabela, erro — fica na fila do
        // tablet até o SQL rodar, em vez de sumir.
        const fim = Date.parse(String(it.intervalo_fim || ""));
        const voltou = Date.parse(String(it.ocorrido_em || "")) || Date.now();
        if (!Number.isFinite(fim)) throw new Error("sem_intervalo_fim");
        const { error } = await db.from("ponto_intervalo_retornos").insert({
          client_id: it.client_id,
          dia: new Date(fim - 3 * 3600e3).toISOString().slice(0, 10),
          janela: String(it.janela || "").slice(0, 5),
          colaborador_id: it.colaborador_id, colaborador_nome: it.colaborador_nome || null,
          device_id: device.id,
          fim_em: new Date(fim).toISOString(), voltou_em: new Date(voltou).toISOString(),
          atraso_s: Math.max(0, Math.round((voltou - fim) / 1000)),
        });
        if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
      } else if (it.tipo === "pedir_insumo") {
        const produto = String(it.produto_nome || "").trim();
        if (!produto) throw new Error("missing_produto");
        const quantidade = Math.max(1, Math.round(Number(it.quantidade) || 1));
        await db.from("pedidos_insumos").insert({
          colaborador_id: it.colaborador_id,
          produto_nome: produto,
          quantidade,
          observacao: it.observacao || null,
        });
        // Auto-atribuição: requisição → atividade pro especialista (cobre a diferença).
        try { await autoAtribuirRequisicao(produto, quantidade); } catch { /* segue */ }
      } else if (it.tipo === "consumir") {
        const res = await aplicarConsumo(db, it);
        // Começou sem bipar com o código do supervisor: o livro guarda quem liberou.
        if (res === "ok" && it.autorizacao) await registrarAprovacao(db, device.id, it, "bipe");
        if (res === "conflito") { results.push({ client_id: it.client_id, status: "conflito" }); continue; }
      } else if (ehTipoRecusa(it.tipo) && !conferirVale(it.autorizacao, String(it.atividade_id ?? ""), it.tipo)) {
        // Recusa sem código de supervisor (app antigo, ou vale adulterado/vencido):
        // conflito tira da fila do tablet e o pull devolve a atividade pra pessoa.
        results.push({ client_id: it.client_id, status: "conflito", detail: "sem_autorizacao" });
        continue;
      } else {
        const res = await aplicarAtividade(db, it);
        if (res === "ok" && ehTipoRecusa(it.tipo)) await registrarAprovacao(db, device.id, it);
        if (res === "conflito") { results.push({ client_id: it.client_id, status: "conflito" }); continue; }
      }
      await marcarProcessado(it.client_id, device.id);
      results.push({ client_id: it.client_id, status: "ok" });
    } catch (e) {
      results.push({ client_id: it.client_id, status: "erro", detail: String(e).slice(0, 120) });
    }
  }

  await touchDevice(device.id);
  return NextResponse.json({ results });
}

// O livro da recusa aprovada (supabase/atividades_autorizacao.sql). Nunca
// lança: a recusa já foi autorizada na bancada, o registro é auditoria.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function registrarAprovacao(db: any, deviceId: string, it: Item, tipoVale?: TipoRecusa): Promise<void> {
  try {
    const tipo: TipoRecusa | null = tipoVale ?? (ehTipoRecusa(it.tipo) ? it.tipo : null);
    if (!tipo) return;
    const sup = conferirVale(it.autorizacao, String(it.atividade_id ?? ""), tipo);
    const { data: p } = sup ? await db.from("profiles").select("name,username").eq("id", sup).maybeSingle() : { data: null };
    await db.from("atividades_autorizacoes").insert({
      device_id: deviceId, atividade_id: it.atividade_id, tipo, motivo: it.motivo ?? it.dispensa_motivo ?? null,
      pedido_por_id: /^[0-9a-f-]{36}$/i.test(it.colaborador_id ?? "") ? it.colaborador_id : null,
      pedido_por_nome: it.colaborador_nome ?? null,
      supervisor_id: sup, supervisor_nome: p?.name || p?.username || null, decisao: "aprovada",
    });
  } catch { /* auditoria não derruba a operação */ }
}

// A coluna `devolvida_em` existe? Descoberto UMA vez por processo (null = ainda
// não checado). Ver supabase/atividades_devolucao.sql.
let temDevolvidaEm: boolean | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checarDevolvidaEm(db: any): Promise<boolean> {
  try { const { error } = await db.from("atividades").select("devolvida_em").limit(1); return !error; }
  catch { return false; }
}

// Idem pra `liberada_apos` (supabase/atividades_pecas.sql). Sem a coluna, a
// devolução segue funcionando — só perde o cooldown.
let temLiberadaApos: boolean | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checarLiberadaApos(db: any): Promise<boolean> {
  try { const { error } = await db.from("atividades").select("liberada_apos").limit(1); return !error; }
  catch { return false; }
}

// Faltou uma peça: garante que a ordem QUE PRODUZ essa peça exista e seja a
// próxima. Prioriza a pendente que já existe em vez de criar outra — quando
// quatro pessoas esbarram na mesma chapa que acabou, criar uma ordem por
// devolução encheria o pool de quatro pedidos da mesma chapa.
async function despacharPeca(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  peca: PecaDaTarefa,
  origem: { setor: string | null; mesa_alvo: string | null; por_id: string; por_nome: string },
): Promise<"priorizada" | "criada" | "nenhuma"> {
  if (!peca.produz) return "nenhuma";   // vem de compra: nada a produzir aqui
  const agora = new Date().toISOString();

  // Já existe pendente no pool? Sobe pro topo (urgente) em vez de duplicar.
  const { data: existente } = await db.from("atividades").select("id")
    .eq("tarefa", peca.produz).eq("status", "pendente")
    .is("para_id", null).limit(1).maybeSingle();
  if (existente) {
    await db.from("atividades")
      .update({ urgente: true, ordem: 0, liberada_apos: null })
      .eq("id", existente.id);
    return "priorizada";
  }

  // Não existe: cria. `urgente` porque ela está bloqueando outra ordem agora.
  //
  // `para_nome`, `por_id` e `por_nome` são NOT NULL na tabela, e esta linha ia
  // sem os três: TODA criação por peça faltante voltava 23502 e o `catch` mais
  // acima engolia — o despacho automático nunca funcionou uma vez. Quem
  // devolveu é quem "pediu" a peça (por_id é FK de profiles, e o colaborador
  // é um profile); pool não tem dono, então `para_nome` é "" como no POST.
  const nova: Record<string, unknown> = {
    tarefa: peca.produz,
    categoria: peca.categoria ?? null,
    detalhe: `Pedida automaticamente: faltou "${peca.peca}" numa ordem em andamento.`,
    setor: origem.setor,
    mesa_alvo: origem.mesa_alvo,
    status: "pendente",
    pool: true,
    para_nome: "",
    por_id: origem.por_id,
    por_nome: origem.por_nome,
    urgente: true,
    ordem: 0,
    quantidade_alvo: 1,
    quantidade_feita: 0,
    tempo_estimado_min: TEMPO_PADRAO_MIN,
    created_at: agora,
  };
  const { error } = await db.from("atividades").insert(nova);
  if (error) {
    // `ordem`/`mesa_alvo`/`urgente` podem não existir em bases antigas: repete
    // com o mínimo, pra a peça ser pedida de qualquer jeito. O mínimo inclui as
    // colunas obrigatórias — sem elas este segundo insert falhava igual.
    const { error: e2 } = await db.from("atividades").insert({
      tarefa: nova.tarefa, categoria: nova.categoria, detalhe: nova.detalhe,
      setor: nova.setor, status: "pendente", pool: true, quantidade_alvo: 1,
      quantidade_feita: 0, para_nome: "", por_id: origem.por_id, por_nome: origem.por_nome,
    });
    if (e2) return "nenhuma";
  }
  return "criada";
}

// ── O BIPE QUE ABRE A ATIVIDADE ──────────────────────────────────────────────
//
// A pessoa bipou a etiqueta do material antes de aceitar. A caixa sai do
// estoque AGORA — não quando ela termina — e fica amarrada à atividade por
// `estoque_unidades.baixa_atividade_id`. É esse vínculo que responde "fulano
// fez chancela usando a folha que ciclano fez": a mesma linha de
// `estoque_unidades` guarda `criado_por` (quem fez a caixa) de um lado e a
// atividade que a consumiu do outro.
//
// POR QUE A EXIGÊNCIA NÃO É VERIFICADA AQUI: seria inútil e cruel. O tablet
// trabalha OFFLINE — quando esta operação chega, a pessoa já montou a peça há
// três horas. Um servidor recusando `iniciar` por falta de bipe não impediria
// nada: só marcaria a operação como erro, e ela voltaria pra fila do tablet
// pra ser reenviada pra sempre. A porta é NO TABLET (é o único lugar onde ela
// pode ser uma porta); aqui é o livro-caixa.
//
// ACEITA QUALQUER ETIQUETA, de propósito. Não confere contra ficha técnica
// porque `atividades.produto_nome` está preenchido em 1 de 104 linhas: uma
// exigência que depende de um campo vazio em 99% dos casos não recusa material
// errado, recusa TUDO — e a bancada inteira cai na saída de emergência no
// primeiro dia. Aceitar e registrar produz, em duas semanas, exatamente o dado
// que falta pra um dia poder exigir de verdade.
async function aplicarConsumo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  it: Item,
): Promise<"ok" | "conflito"> {
  // Id que não é uuid nunca vai virar uuid: devolver "conflito" (e não erro)
  // tira a operação da fila do tablet em vez de deixá-la reenviando pra
  // sempre. É a mesma saída que a atividade removida já usa.
  const atividadeId = uuidOuNulo(it.atividade_id);
  if (!atividadeId) return "conflito";

  const ocorridoEm = typeof it.ocorrido_em === "string" && it.ocorrido_em ? it.ocorrido_em : null;
  const codigos = normalizarCodigos(it.codigos);
  const dispensa = String(it.dispensa_motivo || "").trim();
  // `null`, nunca `""`. `baixado_por_id` e `colaborador_id` são colunas `uuid`,
  // e string vazia ali é 22P02 — derrubaria a baixa inteira por causa de uma
  // coluna de auditoria. NULL passa e a linha continua sabendo o NOME.
  const colaboradorId = uuidOuNulo(it.colaborador_id);

  const eventos: EventoBipe[] = [];
  if (codigos.length) {
    try {
      const resultado = await baixarUnidades({
        codigos,
        // Bipar no começo do trabalho É consumo na produção — a mesma palavra
        // que o galpão já usa ao dar baixa pela tela. Um motivo próprio ("bipe
        // de atividade") seria um quinto valor de `status` em
        // `estoque_unidades` significando exatamente o que "consumido" já
        // significa, e a soma do relatório passaria a esquecer metade.
        motivo: "consumido",
        obs: null,
        // O nome vai junto porque é o que sobrevive se a pessoa sair da
        // empresa; o id pode ser nulo sem derrubar a baixa (ver acima).
        baixadoPorId: colaboradorId as string,
        baixadoPor: it.colaborador_nome || "Tablet da bancada",
        ocorridoEm,
        atividadeId,
      });
      eventos.push(...eventosDoConsumo(resultado));
    } catch (e) {
      // Permanente: sem as tabelas do estoque, ou motivo/lote que este servidor
      // recusa. Nada disso melhora esperando — sai da fila. Qualquer OUTRO erro
      // (rede, banco fora do ar) sobe e a operação é retentada no próximo sync,
      // que é o comportamento certo e o mesmo do resto deste arquivo.
      if (e instanceof ErroSchemaDesatualizado || e instanceof ErroMotivoInvalido || e instanceof ErroLoteBaixaGrande) {
        return "conflito";
      }
      throw e;
    }
  }

  // A SAÍDA REGISTRADA. Começou sem bipar nada — etiqueta descolada, material
  // que chegou sem etiqueta, leitor morto, ou tarefa que não usa material
  // nenhum. A saída precisa existir (senão gente fica parada na bancada) e
  // precisa deixar rastro (senão vira o caminho normal em duas semanas).
  if (dispensa || !codigos.length) eventos.push(eventoDeDispensa(dispensa));

  // Nunca lança: o livro registra um trabalho que JÁ aconteceu na bancada, e
  // derrubar a operação por causa dele a devolveria pra fila do tablet.
  await registrarBipes(db, {
    atividadeId,
    colaboradorId,
    colaboradorNome: it.colaborador_nome || null,
    ocorridoEm,
    eventos,
  });
  return "ok";
}

// Aplica iniciar/pausar/concluir numa atividade, atribuindo ao colaborador
// selecionado. Replica a lógica do PATCH de /api/atividades (estoque ao concluir).
async function aplicarAtividade(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  it: Item
): Promise<"ok" | "conflito"> {
  const { data: row } = await db.from("atividades")
    .select("para_id, iniciada_at, quantidade_alvo, quantidade_feita, produto_id, produto_nome, tarefa, estoque_lancado, setor, mesa_alvo")
    .eq("id", it.atividade_id).maybeSingle();
  if (!row) return "conflito"; // atividade removida/reatribuída enquanto offline

  const patch: Record<string, unknown> = {};
  let qFeita = Number(row.quantidade_feita) || 0;

  if (it.quantidade_feita !== undefined) {
    qFeita = Math.max(0, Math.round(Number(it.quantidade_feita) || 0));
    patch.quantidade_feita = qFeita;
  }

  if (it.tipo === "iniciar") {
    patch.status = "em_andamento";
    patch.impedida = false; patch.motivo_impedimento = null;
    if (!row.iniciada_at) patch.iniciada_at = new Date().toISOString();
  } else if (it.tipo === "pausar") {
    patch.status = "pendente";
  } else if (it.tipo === "bloquear") {
    patch.status = "pendente";
    patch.impedida = true;
    patch.motivo_impedimento = (it.motivo || "").trim() || "Sem motivo informado";
  } else if (it.tipo === "dispensar") {
    // "Não precisa fazer": o fallback da automação, direto do tablet. O efeito
    // inteiro (cancelar, soltar esperas, gravar a memória de saldo no item)
    // mora em lib/producao-dispensa.ts — a mesma porta da rota web. Recusa
    // (atividade de gente, já concluída) vira conflito: o pull seguinte traz o
    // estado de verdade pro tablet.
    const r = await dispensarAtividade(String(it.atividade_id ?? ""), it.colaborador_nome ?? "tablet", it.motivo ?? null);
    return r.ok ? "ok" : "conflito";
  } else if (it.tipo === "devolver") {
    // DEVOLVER AO POOL: diferente de "bloquear", que mantinha o dono e deixava a
    // ordem encalhada com quem não conseguiu fazer. Aqui ela perde o dono e volta
    // pra fila — outra pessoa (ou a mesma) pega. O motivo fica registrado pra o
    // painel saber por que voltou.
    patch.status = "pendente";
    patch.para_id = null;
    patch.para_nome = "";
    patch.pool = true;              // volta pra fila do setor, mesmo se era dirigida
    patch.iniciada_at = null;       // zera o relógio: o tempo conta de quem for fazer
    patch.claimed_at = null;
    patch.impedida = true;          // sinaliza no painel que voltou por um problema
    patch.motivo_impedimento = (it.motivo || "").trim() || "Devolvida sem motivo informado";
    // Registra QUEM devolveu: sem isso a ordem (que segue sendo a mais antiga do
    // pool) cai de volta na mesma pessoa no segundo seguinte — laço infinito.
    // Tolerante: se a coluna ainda não existe (supabase/atividades_devolucao.sql
    // não rodado), a devolução funciona igual, só sem a proteção.
    // Manda pro FIM DA FILA: a fila ordena por coalesce(devolvida_em, created_at).
    // Sem isto a ordem (ainda a mais antiga) voltaria na hora pra mesma pessoa.
    // O motivo costuma ser do ambiente (falta material, máquina parada) — então
    // ninguém consegue agora, e o certo é deixar todo mundo seguir no que dá.
    if (temDevolvidaEm === null) temDevolvidaEm = await checarDevolvidaEm(db);
    if (temDevolvidaEm) patch.devolvida_em = new Date().toISOString();

    // FILA DE RECUSADAS: `impedida = true` (acima) tira a ordem da fila de
    // TODO tablet — pull e claim filtram por ela — até um supervisor ler o
    // motivo em Atividades › Recusadas e devolvê-la. Sem cooldown: o prazo de
    // 40 min soltava a ordem sozinho de volta pra mesma parede.
    if (temLiberadaApos === null) temLiberadaApos = await checarLiberadaApos(db);
    if (temLiberadaApos) patch.liberada_apos = null;

    // Faltou uma PEÇA (e não um motivo genérico)? Despacha quem a produz.
    const nomePeca = (it.peca_faltante || "").trim();
    if (nomePeca) {
      try {
        const { data: cfg } = await db.from("atividade_pecas")
          .select("setor,tarefa,peca,tarefa_produz,categoria_produz")
          .eq("tarefa", row.tarefa).eq("ativo", true);
        const peca = pecasDaTarefa(String(row.tarefa || ""), (cfg ?? []) as PecaConfigRow[])
          .find((p: PecaDaTarefa) => p.peca === nomePeca);
        // Automação desligada: a devolução acontece igual (impedida=true,
        // motivo_impedimento fica registrado pra o painel), só não sai
        // despachando ordem urgente sozinha pro pool.
        if (peca && (await automacaoLigada(db))) {
          await despacharPeca(db, peca, {
            setor: row.setor ?? null, mesa_alvo: row.mesa_alvo ?? null,
            por_id: it.colaborador_id, por_nome: it.colaborador_nome || "Devolução no tablet",
          });
        }
      } catch { /* sem a tabela atividade_pecas: devolve igual, sem despachar */ }
    }
  } else if (it.tipo === "concluir") {
    patch.status = "concluida";
    patch.concluida_at = new Date().toISOString();
    if (typeof it.foto_url === "string") patch.foto_url = it.foto_url || null;
    // Concluir no tablet também não dá entrada no estoque — mesma regra da
    // tela web: a peça só entra quando alguém confere. `estoque_lancado` fica
    // `false` e a atividade vai para a fila de "a conferir".
  }

  const { error } = await db.from("atividades").update(patch).eq("id", it.atividade_id);
  if (error) throw new Error(error.message);
  return "ok";
}
