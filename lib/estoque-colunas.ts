import type { Hierarquia } from "./estoque-hierarquia";

// ── Estoque · colunas do catálogo (leitura tolerante ao SQL não rodado) ─────
//
// supabase/estoque_hierarquia_unidades.sql cria hierarquia, produzido,
// serializado, fornecedor_id, local_id, largura_mm, altura_mm, espessura_mm,
// dim_unidade, cor e custo_em. Esse arquivo é rodado NA MÃO pelo usuário —
// este projeto nunca aplica migração sozinho. Enquanto ninguém rodou,
// `select()` pedindo essas colunas devolve 42703 (coluna inexistente) pra
// QUERY INTEIRA, e a tela de catálogo do Estoque renderiza vazia pra todo
// mundo até alguém notar e rodar o SQL.
//
// A resposta é assimétrica de propósito: LEITURA degrada (cai pro trio antigo
// e deriva a hierarquia em memória, a tela continua de pé); ESCRITA pode
// falhar alto (afeta uma pessoa, numa ação só, com mensagem explicando o quê
// rodar) — ver isColunaAusente() e o uso dela em app/api/estoque-itens/route.ts.

/** Colunas depois do SQL rodado — é a lista que a rota já pedia. */
export const COLUNAS_NOVAS = [
  "id", "nome", "hierarquia", "produzido", "serializado", "categoria",
  "imagem_url", "unidade", "quantidade", "qtd_minima", "estoque_ideal",
  "ativo", "ordem", "custo", "custo_em", "sku", "requisitavel",
  "setor_requisicao", "fornecedor_id", "local_id",
  "largura_mm", "altura_mm", "espessura_mm", "dim_unidade", "cor",
] as const;

/**
 * A RECEITA da atividade (supabase/estoque_producao_receita.sql) é uma segunda
 * migração de mão, independente da primeira. Por isso ela NÃO entra em
 * `COLUNAS_NOVAS`: se entrasse, um banco que já tem a hierarquia mas ainda não
 * tem a receita cairia direto pro esquema LEGADO — perdendo as 8 abas por
 * causa de três colunas que nem são delas. A queda tem três degraus:
 * completa → nova sem receita → legado.
 */
export const COLUNAS_RECEITA = [
  "producao_instrucao", "producao_tempo_min", "producao_lote_de",
  // O DESTINO da atividade (manual/máquina) mora no mesmo SQL da receita —
  // um banco tem as cinco ou nenhuma, então elas caem no mesmo degrau.
  "producao_tipo", "producao_maquina_id",
] as const;
/**
 * QUEM FAZ e SE REPÕE SOZINHO — o quarto degrau, e pelo mesmo motivo dos
 * outros: são de SQLs diferentes (bom_ficha_tecnica.sql e
 * producao_em_cadeia.sql), rodados à mão em datas diferentes.
 *
 * Elas precisam vir na leitura porque o editor de item agora as EDITA: sem
 * elas no `select`, o modal abriria com "repor sozinho" desmarcado pra um
 * item que repõe, e o primeiro Salvar desligaria a automação sem ninguém
 * pedir.
 */
export const COLUNAS_CADEIA = ["setor_responsavel", "producao_automatica"] as const;
const COLUNAS_COMPLETAS = [...COLUNAS_NOVAS, ...COLUNAS_RECEITA, ...COLUNAS_CADEIA] as const;
const COLUNAS_SEM_CADEIA = [...COLUNAS_NOVAS, ...COLUNAS_RECEITA] as const;

// Exatamente as colunas que a seção 3 do SQL cria (`alter table ... add
// column if not exists`). Servem só pra tirar da lista nova e chegar na
// legada — não é a lista de colunas em si.
const COLUNAS_DA_MIGRACAO = new Set<string>([
  "hierarquia", "produzido", "serializado", "fornecedor_id", "local_id",
  "largura_mm", "altura_mm", "espessura_mm", "dim_unidade", "cor", "custo_em",
]);

/**
 * Colunas de HOJE, antes do SQL rodar: tira as que a migração cria e bota de
 * volta os três eixos antigos que ela substitui (`tipo`, `classe`,
 * `tipo_item`) — são os que a seção 4 do SQL lê pra derivar `hierarquia`.
 */
export const COLUNAS_LEGADO = [
  ...COLUNAS_NOVAS.filter((c) => !COLUNAS_DA_MIGRACAO.has(c)),
  "tipo", "classe", "tipo_item",
] as const;

// O Supabase não tem tipos gerados aqui; fronteira dinâmica isolada nesta
// camada, como em lib/tridimarket/repository.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface ItemEstoqueRow extends Record<string, unknown> {
  hierarquia?: string | null;
}

export interface OpcoesLerItens {
  /** Teto da listagem — 2000 é o mesmo teto que a rota já usava. */
  limite?: number;
}

interface ErroPostgrest {
  code?: string;
  message?: string;
}

/**
 * PostgREST devolve `code === "42703"` pra coluna inexistente. A checagem por
 * regex no `message` é rede de segurança: a superfície exata do erro já
 * variou entre versões, e um 42703 não detectado faria a query "falhar" sem
 * cair no caminho de fallback — a tela voltaria a ficar vazia, exatamente o
 * problema que este arquivo existe pra evitar.
 */
export function isColunaAusente(error: ErroPostgrest | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return /column .* does not exist/i.test(error.message ?? "");
}

// Esquema "novo" (colunas da migração) já confirmado nesta vida do processo?
//
// Escolha de memoização — travar em `true` PRA SEMPRE assim que visto, mas
// tentar `COLUNAS_NOVAS` de novo em toda chamada enquanto ainda for `false`:
//
// - Coluna criada não some sozinha: uma vez confirmado o esquema novo, não há
//   por que voltar a checar. Travar em `true` é seguro e elimina de vez a
//   query extra do fallback pro resto da vida do processo — é aí que o custo
//   vira "uma vez por processo" e não "uma vez por requisição".
// - O oposto (travar em `false` na primeira falha) seria mais rápido no curto
//   prazo, mas processo de servidor (Vercel Fluid, worker) pode viver dias, e
//   o SQL é rodado NA MÃO com o processo de pé. Travar "ainda não" pra sempre
//   prenderia o catálogo no modo legado até o próximo deploy, mesmo depois da
//   pessoa rodar a migração — voltar a exigir um redeploy pra uma tela que já
//   deveria estar boa é pior que pagar a query extra por mais algumas chamadas.
//
// Resultado: enquanto ninguém rodou o SQL, cada chamada paga uma query extra
// (tenta novo, cai pro legado) — é o preço de continuar checando. Assim que
// alguém roda o SQL, a leitura seguinte já vê as colunas, trava de vez, e
// nenhuma chamada depois disso volta a pagar esse preço.
let esquemaNovo = false;
/** A receita confirmada trava igual — coluna criada não some sozinha. */
let temReceita = false;
/** Idem pras colunas da cadeia (quem faz / repõe sozinho). */
let temCadeia = false;

function montarConsulta(db: Db, colunas: readonly string[], limite: number) {
  return db.from("estoque_itens").select(colunas.join(","))
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true })
    .limit(limite);
}

/**
 * Lê o catálogo de estoque_itens. Tenta as colunas novas primeiro; se o banco
 * ainda não rodou o SQL (42703), cai pro trio antigo e deriva `hierarquia`
 * em memória — a tela continua mostrando as 8 abas preenchidas mesmo sem a
 * migração. Erro que NÃO é "coluna ausente" (auth, timeout, RLS…) sobe cru:
 * não é este arquivo que decide esconder isso do usuário.
 */
export async function lerItensEstoque(db: Db, opcoes: OpcoesLerItens = {}): Promise<ItemEstoqueRow[]> {
  const limite = opcoes.limite ?? 2000;

  if (esquemaNovo) {
    const colunas = temCadeia ? COLUNAS_COMPLETAS : (temReceita ? COLUNAS_SEM_CADEIA : COLUNAS_NOVAS);
    const { data, error } = await montarConsulta(db, colunas, limite);
    if (error) throw error;
    return (data ?? []) as ItemEstoqueRow[];
  }

  // Degrau 1: tudo — receita e cadeia inclusas.
  const completa = await montarConsulta(db, COLUNAS_COMPLETAS, limite);
  if (!completa.error) {
    esquemaNovo = true; temReceita = true; temCadeia = true;
    return (completa.data ?? []) as ItemEstoqueRow[];
  }
  if (!isColunaAusente(completa.error)) throw completa.error;

  // Degrau 1b: receita sim, cadeia não.
  const semCadeia = await montarConsulta(db, COLUNAS_SEM_CADEIA, limite);
  if (!semCadeia.error) {
    esquemaNovo = true; temReceita = true;
    return (semCadeia.data ?? []) as ItemEstoqueRow[];
  }
  if (!isColunaAusente(semCadeia.error)) throw semCadeia.error;

  // Degrau 2: esquema novo SEM a receita — o estado real deste banco enquanto
  // supabase/estoque_producao_receita.sql não roda. O catálogo continua com as
  // 8 abas; só a receita fica ausente (e a tela mostra os campos vazios).
  const primeira = await montarConsulta(db, COLUNAS_NOVAS, limite);
  if (!primeira.error) {
    esquemaNovo = true; // confirmado: nunca mais tenta o legado neste processo
    return (primeira.data ?? []) as ItemEstoqueRow[];
  }
  if (!isColunaAusente(primeira.error)) throw primeira.error; // erro de verdade: sobe

  const { data, error } = await montarConsulta(db, COLUNAS_LEGADO, limite);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((item) => ({
    ...item,
    hierarquia: derivarHierarquia(item),
  }));
}

export interface ItemClasseTipo {
  classe?: string | null;
  tipo?: string | null;
}

/**
 * Mesma migração da seção 4 do SQL, em memória: `classe` primeiro (é a mais
 * fina), `tipo` como rede, senão "componente". Mantida IGUAL ao `case` do
 * `update` — qualquer divergência faria a tela (calculada aqui) discordar do
 * banco (calculado lá) assim que o SQL rodasse.
 */
export function derivarHierarquia(item: ItemClasseTipo): Hierarquia {
  switch (item.classe) {
    case "materia_prima": return "materia_prima";
    case "semiacabado": return "mp_processada";
    case "peca_montada": return "peca";
    case "componente": return "componente";
    case "acabado": return "produto";
    case "insumo":
    case "manutencao":
    case "consumo":
      return "insumo_indireto";
    case "emb_producao":
    case "emb_expedicao":
    case "emb_montada":
    case "emb_sem_montar":
    case "plastico_bolha":
      return "embalagem";
    default:
      break;
  }
  switch (item.tipo) {
    case "embalagem": return "embalagem";
    case "peca": return "peca";
    case "produto": return "produto";
    case "componente": return "componente";
    default: return "componente";
  }
}
