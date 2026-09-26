// Auto-atribuição de produção: requisições do app + reabastecimento automático.
// Núcleo `atribuirProducao` cria a atividade pro especialista, "cobrindo a
// diferença" (desconta o que já está em andamento). Reusado por:
//  - autoAtribuirRequisicao: pedido manual pelo app (só componente/peça requisitável).
//  - verificarReabastecimento: regra de estoque (mínimo) → repõe até o ideal.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { tempoEstimadoMin, type ReceitaDeProducao } from "@/lib/estoque-receita-de-producao";
import { notificar, type NovaNotif } from "@/lib/notificacoes";
import { padraoDeNomeExato, mesmoNome, umItemPeloNome, TETO_NOMES } from "@/lib/estoque-nome";
import { maquinaMenosCarregada, proximaPosicao } from "@/lib/maquina-fila";
import { decidirCadeia, dispensaVale, fraseDeOrigem, PROFUNDIDADE_MAX, type ComponenteDaFicha, type ContextoDaCadeia, type DecisaoDoNo } from "@/lib/producao-em-cadeia";
import { faixaDaAtividade } from "@/lib/atividade-faixa";

export const ESPECIALIDADES = ["Chancela", "Carimbo", "Ambos"] as const;

export function especialidadeDoItem(categoria: string | null | undefined): string | null {
  const c = (categoria || "").toLowerCase();
  if (c.includes("chancela")) return "Chancela";
  if (c.includes("carimbo")) return "Carimbo";
  return null;
}

interface Emp { id: string; nome: string; especialidade: string | null }
export interface ResultadoReq {
  atribuido: boolean; motivo: string; para_nome?: string; quantidade?: number;
  /** Quem recebeu — é por ele que quem chama avisa a pessoa. */
  para_id?: string;
  /** Texto da notificação, montado onde a atividade nasce. */
  tarefa?: string;
  /** Ids da ordem criada — é neles que as ESPERAS da cadeia se penduram. */
  atividadeId?: string;
  programacaoId?: string;
}

/**
 * Avisa quem recebeu trabalho da automação.
 *
 * Atividade criada por gente notifica (POST /api/atividades faz isso desde
 * sempre); a criada pela varredura de reposição não notificava ninguém. E ela
 * também não cai em tablet nenhum — nasce dirigida a uma pessoa e sem
 * `mesa_alvo`, que é exatamente a combinação que /api/device/pull chama de
 * "só no sistema". Ou seja: o interruptor "criar atividades de reposição
 * sozinho" gerava trabalho que só aparecia pra quem abrisse /minhas-atividades
 * no navegador por conta própria.
 *
 * Um `insert` só pro lote inteiro — a varredura passa por todo item abaixo do
 * mínimo, e uma notificação por item seria uma escrita por item.
 */
async function avisarQuemRecebeu(feitos: ResultadoReq[]): Promise<void> {
  const avisos: NovaNotif[] = feitos
    .filter((r) => r.atribuido && r.para_id)
    .map((r) => ({
      user_id: r.para_id as string,
      tipo: "tarefa",
      titulo: "Nova atividade (reposição)",
      corpo: r.tarefa ?? "Produção de reposição",
      link: "/minhas-atividades",
      de_nome: "Sistema (requisição)",
    }));
  if (avisos.length) await notificar(avisos);
}

// O Supabase não tem tipos gerados aqui; fronteira dinâmica isolada nesta
// camada, como em lib/estoque-colunas.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * O interruptor global (`estoque_config.automacao_ativa`) — mesma leitura
 * tolerante de `lerConfig` em lib/estoque-automacao.ts, duplicada aqui em vez
 * de importada: aquele módulo importa `verificarReabastecimento` DESTE
 * arquivo, e o caminho inverso criaria import circular. Qualquer erro (tabela
 * ausente, coluna ausente, sessão) cai pro lado seguro — desligado — igual ao
 * padrão (`PADRAO.automacao_ativa = false`) do outro módulo.
 *
 * Cobre TODA criação automática, não só a varredura: os botões manuais
 * ("Repor estoque", "Gerar atividades") chamam `verificarReabastecimento`
 * direto, sem passar pelo `varrerSeNecessario` que já checava isto — e pedido
 * de insumo (`autoAtribuirRequisicao`) e peça faltante (`despacharPeca`, em
 * app/api/device/push) nunca tiveram checagem nenhuma. Ligar/desligar aqui
 * fecha os quatro de uma vez.
 */
export async function automacaoLigada(db: Db): Promise<boolean> {
  const { data, error } = await db.from("estoque_config")
    .select("automacao_ativa").eq("id", true).maybeSingle();
  if (error || !data) return false;
  return data.automacao_ativa === true;
}

/**
 * O que já está COBERTO de `nome`, nas duas formas em que cobertura existe:
 *
 *  · `emAndamento` — atividade `pendente`/`em_andamento`: o que falta (alvo −
 *    feito) de cada uma. É trabalho que ainda vai acontecer.
 *  · `aguardando`  — era a caixa CONCLUÍDA esperando o gerente conferir. A
 *    conferência de atividade saiu em 11/09/2026 (lib/conferencia-de-atividade.ts):
 *    peça pronta entra pelo Estoque, à mão, e não existe mais "esperando". Fica
 *    sempre 0 — contar concluída como cobertura prenderia a reposição do item
 *    pra sempre, porque nenhuma delas vai virar estoque sozinha.
 *
 * Uma função só, chamada pelo motor E pela tela "Produção do dia": se cada
 * lado calculasse por conta própria, um dia a tela prometeria uma atividade que
 * o motor decidiria não criar (ou vice-versa).
 */
export interface CoberturaDeProducao {
  emAndamento: number;
  aguardando: number;
  /** A soma — é este o número que decide se ainda falta criar atividade. */
  total: number;
}

export async function coberturaDeProducao(db: Db, nome: string): Promise<CoberturaDeProducao> {
  const n = (nome || "").trim();
  if (!n) return { emAndamento: 0, aguardando: 0, total: 0 };
  const { data } = await db.from("atividades")
    .select("produto_nome,quantidade_alvo,quantidade_feita")
    .ilike("produto_nome", padraoDeNomeExato(n))
    // `aguardando_material` também é cobertura: a ordem existe e vai andar
    // quando o material entrar — sem contá-la o motor criaria em dobro.
    .in("status", ["pendente", "em_andamento", "aguardando_material"])
    .limit(500);   // toda listagem tem teto; 500 ordens abertas do MESMO item já é anomalia
  const emAndamento = ((data ?? []) as { produto_nome: string | null; quantidade_alvo: number; quantidade_feita: number }[])
    // O `ilike` já filtrou no banco; o filtro aqui é a rede contra nome com
    // coringa (`%`, `_`, `*`) — ver lib/estoque-nome.ts.
    .filter((a) => mesmoNome(a.produto_nome, n))
    .reduce((s: number, a) => s + Math.max(0, (Number(a.quantidade_alvo) || 0) - (Number(a.quantidade_feita) || 0)), 0);
  // O destino MÁQUINA também é cobertura: a programação aberta na fila do
  // painel é trabalho encaminhado, igual à atividade do tablet. Sem esta soma,
  // "Produção do dia" mostraria o item sem ninguém produzindo enquanto o motor
  // (com razão) se recusa a criar outra. Tolerante: tabela/coluna ausente
  // (SQLs de máquina não rodados) conta zero, que era o comportamento antigo.
  let naMaquina = 0;
  try {
    const { data: progs, error } = await db.from("maquina_programacoes")
      .select("produto_nome,quantidade_alvo")
      .ilike("produto_nome", padraoDeNomeExato(n))
      .in("status", ["fila", "executando", "aguardando_material"])
      .limit(100);
    if (!error) {
      naMaquina = ((progs ?? []) as { produto_nome: string | null; quantidade_alvo: number | null }[])
        .filter((p) => mesmoNome(p.produto_nome, n))
        .reduce((s: number, p) => s + Math.max(0, Number(p.quantidade_alvo) || 0), 0);
    }
  } catch { /* sem as tabelas de máquina, cobertura segue só das atividades */ }
  return { emAndamento: emAndamento + naMaquina, aguardando: 0, total: emAndamento + naMaquina };
}

/** Só o total — é o que `atribuirProducao` precisa saber pra decidir se cria. */
export async function producaoEmAndamento(db: Db, nome: string): Promise<number> {
  return (await coberturaDeProducao(db, nome)).total;
}

// ── O destino MÁQUINA: a reposição vira programação no painel ───────────────
//
// Dois tipos de atividade, ditados pelo dono: "quando é manual cai no tablet,
// e se for maquinas cai pras maquinas, no painel". O manual é o caminho de
// sempre (atividade pro especialista); este aqui põe o trabalho na fila de
// `maquina_programacoes` — a mesma que a TV mostra e a aba Máquinas controla.
//
// Devolve `null` quando o banco ainda não tem as peças (maquinas.sql ou
// maquinas_produto_nome.sql não rodados, nenhuma máquina ativa): aí o
// chamador CAI NO MANUAL. Reposição no tablet vale mais que reposição nenhuma
// — o mesmo princípio do retry sem `tempo_estimado_min` logo abaixo.
async function programarNaMaquina(
  db: Db,
  nome: string,
  falta: number,
  receita: ReceitaDeProducao,
  // Cadeia: com material em falta a programação nasce invisível pra parede
  // ("aguardando_material") e vira "fila" quando o estoque entra.
  status: "fila" | "aguardando_material" = "fila",
): Promise<ResultadoReq | null> {
  try {
    // Já existe programação ABERTA deste item? Uma por item basta: a varredura
    // roda todo dia, e sem esta pergunta cada dia empilharia outra igual.
    const { data: abertas, error: eDedup } = await db.from("maquina_programacoes")
      .select("id,produto_nome")
      .ilike("produto_nome", padraoDeNomeExato(nome))
      .in("status", ["fila", "executando", "aguardando_material"])
      .limit(50);
    if (eDedup) return null; // coluna/tabela ausente → manual
    const aberta = ((abertas ?? []) as { produto_nome: string | null }[])
      .some((a) => mesmoNome(a.produto_nome, nome));
    if (aberta) return { atribuido: false, motivo: "coberto" };

    // A máquina: a preferida do item, ou a ativa com menos minutos na fila.
    const { data: maqs, error: eMaq } = await db.from("maquinas")
      .select("id,nome,ativa").eq("ativa", true).order("ordem").limit(60);
    if (eMaq || !maqs?.length) return null;
    type Maq = { id: string; nome: string };
    const lista = maqs as Maq[];
    let escolhida = receita.maquinaId ? lista.find((m) => m.id === receita.maquinaId) ?? null : null;
    if (!escolhida) {
      const { data: cargas } = await db.from("maquina_programacoes")
        .select("maquina_id,minutos_estimados")
        .in("maquina_id", lista.map((m) => m.id))
        .in("status", ["fila", "executando"])
        .limit(1000);
      const pendentes = new Map<string, number>();
      for (const c of (cargas ?? []) as { maquina_id: string; minutos_estimados: number | null }[]) {
        pendentes.set(c.maquina_id, (pendentes.get(c.maquina_id) || 0) + Math.max(0, Number(c.minutos_estimados) || 0));
      }
      const id = maquinaMenosCarregada(lista.map((m) => ({ id: m.id, minutosPendentes: pendentes.get(m.id) || 0 })));
      escolhida = lista.find((m) => m.id === id) ?? null;
    }
    if (!escolhida) return null;

    // Fim da fila DELA (max+1 das vivas — ver lib/maquina-fila.ts).
    const { data: fila } = await db.from("maquina_programacoes")
      .select("posicao").eq("maquina_id", escolhida.id).in("status", ["fila", "executando"]).limit(200);
    const posicao = proximaPosicao(((fila ?? []) as { posicao: number | null }[]).map((f) => f.posicao));

    const tempo = tempoEstimadoMin(falta, receita.tempoMin, receita.loteDe);
    const { data: criada, error } = await db.from("maquina_programacoes").insert({
      maquina_id: escolhida.id,
      // A quantidade vai NA referência: a fila da parede não tem coluna de
      // quantidade, e é este texto que o operador lê.
      referencia: `Produzir ${falta}× ${nome}`.slice(0, 120),
      material: null,
      minutos_estimados: tempo ?? 60,   // 60 é o default da tabela
      posicao,
      status,
      produto_nome: nome,
      quantidade_alvo: falta,
    }).select("id").maybeSingle();
    if (error) return null; // produto_nome ausente etc. → manual

    // Sem `para_id` de propósito: máquina não recebe notificação — quem vê é
    // a parede e a aba Máquinas (avisarQuemRecebeu filtra por para_id).
    return {
      atribuido: true, motivo: "maquina",
      para_nome: escolhida.nome, tarefa: `Produzir ${nome}`, quantidade: falta,
      programacaoId: (criada as { id?: string } | null)?.id,
    };
  } catch {
    return null;
  }
}

// Núcleo: garante que `desejado` unidades de `nome` estejam sendo produzidas.
// Desconta o que já está em andamento; se faltar, cria atividade pro especialista.
async function atribuirProducao(
  nome: string,
  categoria: string | null,
  desejado: number,
  // A RECEITA do item (instrução + tempo por lote), quando ele tem uma. Vem de
  // quem já leu o item — repetir a leitura aqui seria uma ida ao banco por
  // atividade criada. Ausente = atividade como sempre foi.
  receita?: ReceitaDeProducao,
  // Cadeia (lib/producao-em-cadeia.ts): com material em falta a ordem nasce
  // `aguardando_material` — invisível pra bancada até o estoque entrar — e a
  // frase de origem explica a conta pra quem for fazer.
  opts?: {
    status?: "pendente" | "aguardando_material";
    origemFrase?: string | null;
    /** true = nasce no POOL do setor Produção e cai no TABLET pela chamada de
     *  aceite. Sem isto a ordem nasce dirigida a um especialista SEM mesa_alvo
     *  — a combinação que o pull chama de "só no sistema", e o motivo de
     *  "não caiu nada no tablet" (medido no ensaio ao vivo de 2026-09-04). */
    pool?: boolean;
    /** `setor_responsavel` do item — classifica a FAIXA da ordem
     *  (maquinas/producao/preparo, ver lib/atividade-faixa.ts). Ausente: a
     *  faixa cai no nome da tarefa ("Produzir Tinta…"→preparo, etc.). */
    setorResponsavel?: string | null;
  },
): Promise<ResultadoReq> {
  const n = (nome || "").trim();
  const alvo = Math.max(0, Math.round(desejado || 0));
  if (!n || alvo <= 0) return { atribuido: false, motivo: "nada_a_fazer" };
  const db = createSupabaseAdminClient();
  // A faixa da ordem, pra o pool rotear quem pode pegar. Item manda; nome cobre.
  const faixa = faixaDaAtividade(opts?.setorResponsavel, `Produzir ${n}`, categoria);

  // Produção já em andamento (pendente/em_andamento/aguardando) desse item.
  const emAndamento = await producaoEmAndamento(db, n);
  if (emAndamento >= alvo) return { atribuido: false, motivo: "coberto", quantidade: emAndamento };
  const falta = alvo - emAndamento;

  // Tipo MÁQUINA: cai na fila do painel, não no tablet. Se o banco ainda não
  // tem as peças (SQL pendente, nenhuma máquina), devolve null e o fluxo segue
  // pro manual logo abaixo — reposição no tablet vale mais que nenhuma.
  if (receita?.tipo === "maquina") {
    const r = await programarNaMaquina(db, n, falta, receita,
      opts?.status === "aguardando_material" ? "aguardando_material" : "fila");
    if (r) return r;
  }

  // ── Destino POOL: a ordem cai no tablet pela chamada de aceite ─────────────
  // O tablet distribui sozinho pra quem está livre (modelo Uber) — melhor que
  // apontar um especialista que talvez nem esteja na bancada. `para_nome: ""`
  // e não null (a coluna é NOT NULL — a lição do pool que sumia, gotcha #2 do
  // tablet). Se o banco não tiver `pool`/`setor` (SQL antigo), cai no caminho
  // do especialista logo abaixo — ordem dirigida vale mais que nenhuma.
  if (opts?.pool) {
    const tempoPool = tempoEstimadoMin(falta, receita?.tempoMin, receita?.loteDe);
    const linhaPool: Record<string, unknown> = {
      categoria: categoria || "Produção",
      tarefa: `Produzir ${n}`,
      detalhe: receita?.instrucao ?? null,
      para_id: null, para_nome: "",
      por_id: null, por_nome: "Sistema (requisição)",
      status: opts?.status ?? "pendente",
      quantidade_alvo: falta, quantidade_feita: 0, produto_nome: n,
      pool: true, setor: "Produção",
      ...(tempoPool != null ? { tempo_estimado_min: tempoPool } : {}),
      criada_por_automacao: true,
      origem_frase: opts?.origemFrase ?? null,
      faixa,
    };
    const inserirPool = (l: Record<string, unknown>) =>
      db.from("atividades").insert(l).select("id").maybeSingle();
    let { data: criadaPool, error: ePool } = await inserirPool(linhaPool);
    if (ePool && /criada_por_automacao|origem_frase|faixa/i.test(ePool.message ?? "")) {
      ({ data: criadaPool, error: ePool } = await inserirPool({ ...linhaPool, criada_por_automacao: undefined, origem_frase: undefined, faixa: undefined }));
    }
    if (ePool && /tempo_estimado_min/i.test(ePool.message ?? "")) {
      ({ data: criadaPool, error: ePool } = await inserirPool({ ...linhaPool, tempo_estimado_min: undefined, criada_por_automacao: undefined, origem_frase: undefined, faixa: undefined }));
    }
    // `por_id NOT NULL` (banco anterior ao producao_em_cadeia.sql): assina com
    // um admin ativo — a autoria de verdade segue em `por_nome`.
    if (ePool && /por_id/i.test(ePool.message ?? "")) {
      const { data: adm } = await db.from("profiles").select("id").eq("active", true)
        .in("role", ["admin", "estoquista", "gerente_producao"]).limit(1);
      const adminId = (adm as { id: string }[] | null)?.[0]?.id;
      if (adminId) ({ data: criadaPool, error: ePool } = await inserirPool({ ...linhaPool, por_id: adminId, faixa: undefined }));
    }
    if (!ePool) {
      return {
        atribuido: true, motivo: "pool",
        para_nome: "Pool Produção", tarefa: `Produzir ${n}`, quantidade: falta,
        atividadeId: (criadaPool as { id?: string } | null)?.id,
      };
    }
    // pool/setor ausentes ou outro erro → segue pro caminho do especialista.
  }

  // Especialistas compatíveis.
  const espExigida = especialidadeDoItem(categoria);
  const { data: profs } = await db.from("profiles").select("id,name,username,active,employees(especialidade)")
    .eq("active", true).limit(500);   // mesmo teto de colaboradoresAtribuiveis
  type Row = { id: string; name: string | null; username: string; employees: { especialidade: string | null }[] | { especialidade: string | null } | null };
  const candidatos: Emp[] = (profs ?? []).map((r: Row) => {
    const e = Array.isArray(r.employees) ? r.employees[0] : r.employees;
    return { id: r.id, nome: r.name || r.username, especialidade: e?.especialidade ?? null };
  }).filter((c: Emp) => {
    if (!c.especialidade) return false;
    if (!espExigida) return true;
    return c.especialidade === espExigida || c.especialidade === "Ambos";
  });
  if (!candidatos.length) return { atribuido: false, motivo: "sem_especialista" };

  // Carga atual: livres primeiro; senão quem está mais perto de terminar.
  const ids = candidatos.map((c) => c.id);
  const { data: cargas } = await db.from("atividades").select("para_id,quantidade_alvo,quantidade_feita").in("para_id", ids).in("status", ["pendente", "em_andamento"]).limit(1000);
  const restante = new Map<string, number>();
  const ativsPorPessoa = new Map<string, number>();
  for (const a of (cargas ?? []) as { para_id: string; quantidade_alvo: number; quantidade_feita: number }[]) {
    restante.set(a.para_id, (restante.get(a.para_id) || 0) + Math.max(0, (Number(a.quantidade_alvo) || 0) - (Number(a.quantidade_feita) || 0)));
    ativsPorPessoa.set(a.para_id, (ativsPorPessoa.get(a.para_id) || 0) + 1);
  }
  const livres = candidatos.filter((c) => !(ativsPorPessoa.get(c.id) || 0));
  const escolhido = livres.length ? livres[0] : [...candidatos].sort((a, b) => (restante.get(a.id) || 0) - (restante.get(b.id) || 0))[0];

  const tarefa = `Produzir ${n}`;
  // `detalhe` NÃO leva "Requisição automática".
  //
  // Em /minhas-atividades esse campo é renderizado como a INSTRUÇÃO — bloco
  // citado, com barra na lateral e entrelinha de leitura, feito pro parágrafo
  // que a pessoa vai ler e seguir. Um rótulo interno ali ocupava o lugar do
  // "o que fazer" e não dizia nada a quem está na bancada. A procedência já
  // está em `por_nome` ("Sistema (requisição)"), que é de onde as duas telas
  // tiram o selo de reposição (nascidaDaAutomacao, lib/atividades-estagio.ts).
  // A instrução do item vira o `detalhe` — o bloco que /minhas-atividades e o
  // tablet já renderizam como "o que fazer". O tempo vem da receita, por lotes
  // inteiros (ver tempoEstimadoMin): 340 puxadores com lote de 200 em 120min
  // são DOIS lotes, 240min.
  const tempo = tempoEstimadoMin(falta, receita?.tempoMin, receita?.loteDe);
  const linha: Record<string, unknown> = {
    categoria: categoria || "Produção",
    tarefa,
    detalhe: receita?.instrucao ?? null,
    para_id: escolhido.id, para_nome: escolhido.nome,
    por_id: null, por_nome: "Sistema (requisição)",
    status: opts?.status ?? "pendente",
    quantidade_alvo: falta, quantidade_feita: 0, produto_nome: n,
    ...(tempo != null ? { tempo_estimado_min: tempo } : {}),
    // O selo e a frase da cadeia (supabase/producao_em_cadeia.sql). Colunas
    // podem não existir — o degrau abaixo repete sem elas.
    criada_por_automacao: true,
    origem_frase: opts?.origemFrase ?? null,
    faixa,
  };
  // Degraus de tolerância: a atividade vale mais que qualquer coluna nova.
  const inserir = (l: Record<string, unknown>) =>
    db.from("atividades").insert(l).select("id").maybeSingle();
  let { data: criadaRow, error } = await inserir(linha);
  if (error && /criada_por_automacao|origem_frase|faixa/i.test(error.message ?? "")) {
    ({ data: criadaRow, error } = await inserir({ ...linha, criada_por_automacao: undefined, origem_frase: undefined, faixa: undefined }));
  }
  // `tempo_estimado_min` chegou por SQL avulso e pode não existir neste banco.
  // A atividade SEM tempo vale mais que atividade nenhuma: repete sem o campo.
  if (error && tempo != null && /tempo_estimado_min|42703|schema cache/i.test(error.message ?? "")) {
    ({ data: criadaRow, error } = await inserir({
      ...linha, tempo_estimado_min: undefined, criada_por_automacao: undefined, origem_frase: undefined, faixa: undefined,
    }));
  }
  // `por_id NOT NULL` (banco anterior ao producao_em_cadeia.sql): a automação
  // não tem autor com perfil, e o insert com null falhava CALADO — medido no
  // ensaio ao vivo de 2026-09-04: TODA reposição automática voltava
  // `falha_atividade` neste banco. O degrau assina com quem RECEBEU (por_nome
  // continua "Sistema (requisição)", que é de onde o selo de automação sai).
  if (error && /por_id/i.test(error.message ?? "")) {
    ({ data: criadaRow, error } = await inserir({ ...linha, por_id: escolhido.id }));
  }
  if (error) return { atribuido: false, motivo: "falha_atividade" };
  return {
    atribuido: true, motivo: livres.length ? "livre" : "menor_carga",
    para_nome: escolhido.nome, para_id: escolhido.id, tarefa, quantidade: falta,
    atividadeId: (criadaRow as { id?: string } | null)?.id,
  };
}

// Pedido manual pelo app: só componente/peça requisitável.
export async function autoAtribuirRequisicao(produtoNome: string, quantidade: number): Promise<ResultadoReq> {
  const n = (produtoNome || "").trim();
  if (!n) return { atribuido: false, motivo: "sem_produto" };
  const db = createSupabaseAdminClient();
  // Automação desligada: o PEDIDO continua sendo gravado por quem chamou
  // (`pedidos_insumos`, em app/api/insumos e app/api/device/push) — é ele que
  // vira o aviso pro gestor criar a atividade na mão. Só a atribuição
  // automática pára aqui.
  if (!(await automacaoLigada(db))) return { atribuido: false, motivo: "automacao_desligada" };
  // Antes filtrava por `tipo in (componente, peca)`. A hierarquia é mais fina:
  // o que se repõe é o que se fabrica ou monta, não matéria-prima nem insumo
  // (esses entram por compra, não por ordem de reposição).
  const COLS = "nome,categoria";
  let { data: itens } = await db.from("estoque_itens").select(`${COLS},setor_responsavel`)
    .ilike("nome", padraoDeNomeExato(n))
    .in("hierarquia", ["componente", "peca", "mp_processada"]).limit(TETO_NOMES);
  if (!itens) ({ data: itens } = await db.from("estoque_itens").select(COLS)
    .ilike("nome", padraoDeNomeExato(n))
    .in("hierarquia", ["componente", "peca", "mp_processada"]).limit(TETO_NOMES));
  // `nome` volta junto pra o casamento ser refeito em JavaScript: sem isso, um
  // item chamado "ADESIVO 100% PP" viraria o padrão "ADESIVO 100" + qualquer
  // coisa e a requisição sairia pro item errado (ver lib/estoque-nome.ts).
  const casam = ((itens ?? []) as { nome: string; categoria: string | null; setor_responsavel?: string | null }[]).filter((i) => mesmoNome(i.nome, n));
  if (!casam.length) return { atribuido: false, motivo: "item_nao_requisitavel" };
  const categoria = (casam.find((i) => i.categoria)?.categoria) ?? null;
  const setorResp = casam.find((i) => i.setor_responsavel)?.setor_responsavel ?? null;
  const r = await atribuirProducao(n, categoria, quantidade, undefined, { setorResponsavel: setorResp });
  await avisarQuemRecebeu([r]);
  return r;
}

// ── "Produção do dia" — mesma regra de reposição, sem escrever nada ─────────
export interface ItemParaLinha {
  id?: unknown; nome?: unknown; categoria?: unknown; hierarquia?: unknown;
  quantidade?: unknown; qtd_minima?: unknown; estoque_ideal?: unknown; ativo?: unknown;
}
export interface LinhaProducaoDia {
  itemId: unknown; nome: string; hierarquia: unknown; categoria: string | null;
  quantidade: number; minima: number; ideal: number; falta: number; emAndamento: number;
  /**
   * Peças PRONTAS esperando conferência. Separada de `emAndamento` porque a
   * ação do gerente é outra: "em andamento" é esperar alguém terminar,
   * "aguardando" é ir até a aba Conferir e liberar. Sem esta coluna, o item
   * ficava abaixo do mínimo sem ninguém produzindo e sem explicação na tela.
   */
  aguardando: number;
  aProduzir: number;
}

/**
 * Linhas da tela "Produção do dia": a MESMA regra de `verificarReabastecimento`
 * abaixo — ativo, item com regra (`qtd_minima > 0`) e quantidade JÁ NO OU
 * ABAIXO DO MÍNIMO (`quantidade <= qtd_minima`) — mas sem criar nenhuma
 * atividade, só relatando o que falta e o que já está em andamento.
 *
 * O terceiro filtro (`quantidade <= qtd_minima`) existe pra não divergir do
 * botão "Gerar atividades": um item ACIMA do mínimo mas abaixo do `ideal`
 * teria `falta > 0` só olhando `ideal - quantidade`, e apareceria na tela
 * prometendo uma atividade que `verificarReabastecimento` — que só acorda em
 * ou abaixo do mínimo — nunca criaria ao apertar o botão. `ideal` é o maior
 * entre `estoque_ideal` e o mínimo, igual ao motor. `emAndamento`/`aProduzir`
 * vêm de `producaoEmAndamento`, a mesma conta que o motor usa.
 *
 * Recebe os itens já lidos (`lerItensEstoque`, tolerante ao schema) em vez de
 * ler de novo — quem chama já pagou essa consulta.
 */
export async function linhasProducaoDia(db: Db, itens: ItemParaLinha[]): Promise<{ linhas: LinhaProducaoDia[]; totalAProduzir: number; totalAguardando: number }> {
  const linhas: LinhaProducaoDia[] = [];
  let totalAProduzir = 0;
  let totalAguardando = 0;
  for (const it of itens) {
    if (it.ativo === false) continue; // inativo: fora da regra, mesmo se baixo
    const minima = Number(it.qtd_minima) || 0;
    if (minima <= 0) continue; // sem regra de reposição — não entra na lista
    const quantidade = Number(it.quantidade) || 0;
    if (quantidade > minima) continue; // acima do mínimo: o motor ainda não acordaria pra este item
    const ideal = Math.max(Number(it.estoque_ideal) || 0, minima);
    const falta = Math.max(0, ideal - quantidade);
    if (falta <= 0) continue; // só o que realmente falta
    const nome = String(it.nome ?? "");
    const cobertura = await coberturaDeProducao(db, nome);
    const aProduzir = Math.max(0, falta - cobertura.total);
    totalAProduzir += aProduzir;
    totalAguardando += cobertura.aguardando;
    linhas.push({
      itemId: it.id, nome, hierarquia: it.hierarquia ?? null, categoria: (it.categoria as string | null) ?? null,
      quantidade, minima, ideal, falta,
      emAndamento: cobertura.emAndamento, aguardando: cobertura.aguardando, aProduzir,
    });
  }
  return { linhas, totalAProduzir, totalAguardando };
}

// ── A cadeia: o que o motor precisa saber além do item ──────────────────────

interface InfoDoItem {
  id: string; nome: string; categoria?: string | null; quantidade: number;
  producao_instrucao?: string | null; producao_tempo_min?: number | null;
  producao_lote_de?: number | null; producao_tipo?: string | null;
  producao_maquina_id?: string | null; producao_automatica?: boolean | null;
  /** Classifica a FAIXA da ordem (Máquinas/Montagem/Preparo/…). */
  setor_responsavel?: string | null;
  /** "É produzido aqui dentro" — conta como produzível mesmo sem receita. */
  produzido?: boolean | null;
}

/**
 * Carrega fichas técnicas e itens da cadeia INTEIRA dos candidatos, nível por
 * nível (até PROFUNDIDADE_MAX), em poucas idas com `in(...)` — nunca uma
 * consulta por item. `null` quando o banco não tem as peças (ficha_tecnica ou
 * colunas novas ausentes): o chamador cai no comportamento sem cadeia.
 */
async function carregarCadeia(
  db: Db, sementes: InfoDoItem[],
): Promise<{ ctx: ContextoDaCadeia; info: Map<string, InfoDoItem> } | null> {
  try {
    const info = new Map<string, InfoDoItem>(sementes.map((s) => [s.id, s]));
    const fichas = new Map<string, ComponenteDaFicha[]>();
    let fronteira = sementes.map((s) => s.id);
    for (let nivel = 0; nivel < PROFUNDIDADE_MAX && fronteira.length; nivel++) {
      const { data: linhas, error } = await db.from("ficha_tecnica")
        .select("item_id,componente_id,quantidade").in("item_id", fronteira).limit(1000);
      if (error) return null;
      const novos: string[] = [];
      for (const l of (linhas ?? []) as { item_id: string; componente_id: string; quantidade: number }[]) {
        const arr = fichas.get(l.item_id) ?? [];
        arr.push({ componenteId: l.componente_id, nome: l.componente_id, quantidade: Number(l.quantidade) || 0 });
        fichas.set(l.item_id, arr);
        if (!info.has(l.componente_id) && !novos.includes(l.componente_id)) novos.push(l.componente_id);
      }
      if (novos.length) {
        // `setor_responsavel` (de bom_ficha_tecnica.sql) pode não existir: tenta
        // com, e no erro de coluna repete sem — a cadeia não pode ser desligada
        // por causa da faixa.
        const COMP_COLS = "id,nome,categoria,quantidade,producao_instrucao,producao_tempo_min,producao_lote_de,producao_tipo,producao_maquina_id,producao_automatica";
        let { data: comps, error: eComp } = await db.from("estoque_itens")
          .select(`${COMP_COLS},setor_responsavel,produzido`).in("id", novos).limit(1000);
        if (eComp && /setor_responsavel|produzido/i.test(eComp.message ?? "")) {
          ({ data: comps, error: eComp } = await db.from("estoque_itens").select(COMP_COLS).in("id", novos).limit(1000));
        }
        if (eComp) return null;
        for (const c of (comps ?? []) as InfoDoItem[]) info.set(c.id, c);
      }
      fronteira = novos;
    }
    // A linha da ficha só tem o id do componente; o nome de verdade vem do item.
    for (const [, comps] of fichas) {
      for (const c of comps) c.nome = info.get(c.componenteId)?.nome ?? c.nome;
    }
    const saldos = new Map<string, number>();
    const produziveis = new Set<string>();
    for (const [id, i] of info) {
      saldos.set(id, Math.max(0, Number(i.quantidade) || 0));
      // Produzível = o galpão sabe fazer: tem instrução de produção, ficha
      // técnica própria, ou está marcado "É produzido aqui dentro" (a "Trava
      // Clichê" não tem receita nem ficha, e ainda assim é cortada aqui). O
      // resto é material de COMPRA.
      if ((i.producao_instrucao ?? null) !== null || fichas.has(id) || i.produzido === true) produziveis.add(id);
    }
    return { ctx: { fichas, saldos, produziveis }, info };
  } catch { return null; }
}

/** Pendura o que falta na ordem criada. Tolerante: a tabela pode não existir,
 *  e uma espera perdida só custa a liberação automática (a varredura diária
 *  re-decide). */
async function gravarEsperas(
  db: Db,
  dono: { atividadeId?: string; programacaoId?: string },
  esperas: { itemId: string; nome: string; falta: number }[],
): Promise<void> {
  if (!esperas.length || (!dono.atividadeId && !dono.programacaoId)) return;
  await db.from("producao_esperas").insert(esperas.map((e) => ({
    atividade_id: dono.atividadeId ?? null,
    programacao_id: dono.programacaoId ?? null,
    item_id: e.itemId, item_nome: e.nome, falta: e.falta,
  }))).then(() => undefined, () => undefined);
}

/** Cria a ordem de UM nó e desce pros filhos que a decisão mandou criar. */
async function criarOrdemDaCadeia(
  db: Db,
  no: { id: string; nome: string; categoria: string | null; quantidade: number },
  decisao: DecisaoDoNo,
  info: Map<string, InfoDoItem>,
  origemFrase: string,
  criadas: ResultadoReq[],
  comprar: { nome: string; falta: number; trava: string }[],
): Promise<ResultadoReq> {
  const i = info.get(no.id);
  const receita: ReceitaDeProducao = {
    instrucao: i?.producao_instrucao ?? null,
    tempoMin: i?.producao_tempo_min ?? null,
    loteDe: i?.producao_lote_de ?? null,
    tipo: i?.producao_tipo === "maquina" ? "maquina" : "manual",
    maquinaId: i?.producao_maquina_id ?? null,
  };
  const r = await atribuirProducao(no.nome, no.categoria, no.quantidade, receita, {
    status: decisao.estado, origemFrase, pool: true, setorResponsavel: i?.setor_responsavel ?? null,
  });
  if (r.atribuido) {
    criadas.push(r);
    await gravarEsperas(db, r, decisao.esperas);
  }
  for (const c of decisao.comprar) comprar.push({ nome: c.nome, falta: c.falta, trava: no.nome });
  for (const filho of decisao.filhos) {
    const dFilho = decisao.decisoesFilhos.get(filho.itemId);
    if (!dFilho) continue;
    await criarOrdemDaCadeia(db, {
      id: filho.itemId, nome: filho.nome,
      categoria: info.get(filho.itemId)?.categoria ?? null,
      quantidade: filho.quantidade,
    }, dFilho, info, `Material pra produzir ${no.nome} — precisa de ${filho.quantidade}.`, criadas, comprar);
  }
  return r;
}

/** Materiais COMPRADOS em falta segurando a cadeia → um aviso pra quem compra,
 *  num insert só. Cortesia: falhar aqui não derruba a varredura. */
async function avisarCompras(
  db: Db, comprar: { nome: string; falta: number; trava: string }[],
): Promise<void> {
  if (!comprar.length) return;
  try {
    const { data: gestores } = await db.from("profiles").select("id,role")
      .in("role", ["admin", "estoquista", "gerente_producao"]).eq("active", true).limit(50);
    const linhas = [...new Map(comprar.map((c) => [c.nome, c])).values()]
      .slice(0, 10)
      .map((c) => `${c.falta}× ${c.nome} (trava ${c.trava})`).join("; ");
    const avisos: NovaNotif[] = ((gestores ?? []) as { id: string }[]).map((g) => ({
      user_id: g.id, tipo: "tarefa",
      titulo: "Compra necessária pra produção",
      corpo: `Material em falta segurando a cadeia: ${linhas}`.slice(0, 400),
      link: "/estoque", de_nome: "Sistema (requisição)",
    }));
    if (avisos.length) await notificar(avisos);
  } catch { /* aviso é cortesia */ }
}

// Reabastecimento automático: varre o catálogo e, p/ todo item ATIVADO com
// REGRA (qtd_minima > 0) e quantidade <= mínimo, cria a CADEIA de ordens pra
// repor até o ideal — verificando os materiais da ficha técnica, recursivo.
export interface ResumoReabastece { verificados: number; abaixo: number; criadas: number; itens: { nome: string; quantidade: number; minimo: number; alvo: number; resultado: string; para?: string }[] }
export async function verificarReabastecimento(): Promise<ResumoReabastece> {
  const db = createSupabaseAdminClient();
  // As colunas podem não existir ainda neste banco: tenta com, e no erro de
  // coluna repete sem — a varredura não pode parar por causa de um SQL
  // pendente. Quatro degraus, do mais novo pro mais velho.
  const COM_TIPO = "nome,categoria,quantidade,qtd_minima,estoque_ideal,ativo,producao_instrucao,producao_tempo_min,producao_lote_de,producao_tipo,producao_maquina_id";
  const COM_CADEIA = `id,${COM_TIPO},producao_automatica,reposicao_dispensada_saldo`;
  const COM_RECEITA = "nome,categoria,quantidade,qtd_minima,estoque_ideal,ativo,producao_instrucao,producao_tempo_min,producao_lote_de";
  const SEM_RECEITA = "nome,categoria,quantidade,qtd_minima,estoque_ideal,ativo";
  const buscar = (colunas: string) => db.from("estoque_itens")
    .select(colunas)
    .eq("ativo", true).gt("qtd_minima", 0)
    .limit(1000);   // catálogo inteiro numa varredura só
  let temCadeia = true;
  // `setor_responsavel` (faixa) é best-effort: se faltar, cai pro COM_CADEIA sem
  // ela — sem desligar a cadeia (a faixa vira keyword do nome da tarefa).
  let { data, error } = await buscar(`${COM_CADEIA},setor_responsavel`);
  if (error) ({ data, error } = await buscar(COM_CADEIA));
  if (error) { temCadeia = false; ({ data, error } = await buscar(COM_TIPO)); }
  if (error) ({ data, error } = await buscar(COM_RECEITA));
  if (error) ({ data } = await buscar(SEM_RECEITA));
  type ItemVarrido = {
    id?: string; nome: string; categoria: string | null; quantidade: number;
    qtd_minima: number; estoque_ideal: number | null;
    producao_instrucao?: string | null; producao_tempo_min?: number | null;
    producao_lote_de?: number | null; producao_tipo?: string | null;
    producao_maquina_id?: string | null; producao_automatica?: boolean | null;
    reposicao_dispensada_saldo?: number | null; setor_responsavel?: string | null;
  };
  const itens = (data ?? []) as unknown as ItemVarrido[];

  const out: ResumoReabastece = { verificados: itens.length, abaixo: 0, criadas: 0, itens: [] };

  // Interruptor GERAL primeiro — antes de qualquer coisa por item. Desligado,
  // nem os botões manuais ("Repor estoque", "Gerar atividades") criam nada:
  // eles chamam esta função direto, sem passar pelo `varrerSeNecessario` que
  // já checava isto só pra varredura automática. Ainda relata o que está
  // abaixo do mínimo (a tela "Produção do dia" continua útil), só não cria.
  if (!(await automacaoLigada(db))) {
    for (const it of itens) {
      const q = Number(it.quantidade) || 0;
      const min = Number(it.qtd_minima) || 0;
      if (q > min) continue;
      out.abaixo++;
      const alvo = Math.max(Number(it.estoque_ideal) || 0, min);
      out.itens.push({ nome: it.nome, quantidade: q, minimo: min, alvo, resultado: "automacao_desligada" });
    }
    return out;
  }

  const criadas: ResultadoReq[] = [];
  const comprarTudo: { nome: string; falta: number; trava: string }[] = [];

  // 1º passo: separar quem realmente vai virar ordem — e explicar quem não vai.
  const candidatos: { it: ItemVarrido; q: number; min: number; alvo: number; desejado: number }[] = [];
  for (const it of itens) {
    const q = Number(it.quantidade) || 0;
    const min = Number(it.qtd_minima) || 0;
    if (q > min) continue; // acima do mínimo → ok, atividade nenhuma
    out.abaixo++;
    const alvo = Math.max(Number(it.estoque_ideal) || 0, min); // o TETO: repõe até o ideal
    // Só os ATIVADOS ("só os que eu ativar"). Sem a coluna (SQL não rodado),
    // todo item com mínimo participa — o comportamento de sempre.
    if (temCadeia && it.producao_automatica !== true) {
      out.itens.push({ nome: it.nome, quantidade: q, minimo: min, alvo, resultado: "automacao_desligada" });
      continue;
    }
    // A dispensa segura enquanto o saldo não cair abaixo do saldo dela.
    if (temCadeia && dispensaVale(q, it.reposicao_dispensada_saldo)) {
      out.itens.push({ nome: it.nome, quantidade: q, minimo: min, alvo, resultado: "dispensado" });
      continue;
    }
    // Caiu abaixo do saldo da dispensa: a falta é NOVA — limpa a memória.
    if (temCadeia && it.reposicao_dispensada_saldo != null && it.id) {
      await db.from("estoque_itens").update({
        reposicao_dispensada_saldo: null, reposicao_dispensada_em: null,
        reposicao_dispensada_por: null, reposicao_dispensada_motivo: null,
      }).eq("id", it.id).then(() => undefined, () => undefined);
    }
    candidatos.push({ it, q, min, alvo, desejado: alvo - q });
  }

  // 2º passo: a cadeia inteira dos candidatos numa carga só.
  const carga = temCadeia && candidatos.length
    ? await carregarCadeia(db, candidatos
        .filter((c) => c.it.id)
        .map((c) => ({ ...c.it, id: c.it.id as string, quantidade: c.q })))
    : null;

  // 3º passo: criar — com cadeia quando dá, do jeito antigo quando não.
  for (const { it, q, min, alvo, desejado } of candidatos) {
    if (carga && it.id) {
      const decisao = decidirCadeia(it.id, desejado, carga.ctx);
      // SEM FICHA a ordem RAIZ não nasce — nem `pendente` (cairia na bancada
      // sem ninguém saber se há material) nem `aguardando_material` (ficaria
      // presa pra sempre: ordem parada JÁ conta como cobertura na varredura
      // seguinte, então nem depois de a ficha ser cadastrada ela andaria).
      // O item volta a produzir sozinho no dia em que a ficha existir.
      //
      // FILHO sem ficha é o caso OPOSTO, e por isso continua sendo criado lá
      // em `criarOrdemDaCadeia`: ele não é uma ordem que ninguém pediu — é o
      // insumo que a ficha do PAI nomeou, com a quantidade que falta pro lote.
      // "Puxador" precisa de 176 Macho e 176 Femea; cortar esses dois é
      // exatamente o trabalho que a cadeia existe pra despachar sozinha. Travar
      // o filho por falta de ficha PRÓPRIA pararia a cadeia inteira no degrau
      // de baixo — e foi o que essa regra quase fez.
      if (decisao.semFicha) {
        out.itens.push({ nome: it.nome, quantidade: q, minimo: min, alvo, resultado: "sem_ficha" });
        continue;
      }
      const r = await criarOrdemDaCadeia(db,
        { id: it.id, nome: it.nome, categoria: it.categoria, quantidade: desejado },
        decisao, carga.info, fraseDeOrigem(q, min, alvo), criadas, comprarTudo);
      out.itens.push({
        nome: it.nome, quantidade: q, minimo: min, alvo,
        resultado: r.atribuido && decisao.estado === "aguardando_material"
          ? (decisao.semFicha ? "sem_ficha" : "aguardando_material")
          : r.motivo,
        para: r.para_nome,
      });
    } else {
      const r = await atribuirProducao(it.nome, it.categoria, desejado, {
        instrucao: it.producao_instrucao ?? null,
        tempoMin: it.producao_tempo_min ?? null,
        loteDe: it.producao_lote_de ?? null,
        tipo: it.producao_tipo === "maquina" ? "maquina" : "manual",
        maquinaId: it.producao_maquina_id ?? null,
      }, { pool: true, setorResponsavel: it.setor_responsavel ?? null });
      if (r.atribuido) criadas.push(r);
      out.itens.push({ nome: it.nome, quantidade: q, minimo: min, alvo, resultado: r.motivo, para: r.para_nome });
    }
  }
  out.criadas = criadas.length;
  // Um aviso por pessoa, num insert só, DEPOIS da varredura — dentro do laço
  // seria uma escrita por item abaixo do mínimo.
  await avisarQuemRecebeu(criadas);
  await avisarCompras(db, comprarTudo);
  return out;
}
