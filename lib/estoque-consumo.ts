// ── O que uma ATIVIDADE consumiu ─────────────────────────────────────────────
//
// O ciclo do galpão começa bipando: a pessoa pega a caixa lacrada de folhas
// limpas, BIPA, e a caixa sai do estoque inteira nesse instante — antes de
// romper o lacre, antes de montar. `estoque_unidades.baixa_atividade_id` é o
// que liga "esta caixa de folhas virou aquelas alavancas".
//
// Este módulo é o lado da LEITURA desse vínculo (quem escreve é
// `lib/estoque-baixa.ts`). Três perguntas, três funções:
//
//   • "o que é esta etiqueta que acabei de bipar?"  → lerEtiquetas
//   • "o que entrou nesta atividade?"               → consumoDaAtividade
//   • "quais destas atividades já consumiram algo?" → consumoPorAtividade
//
// As DUAS colunas que ele lê (`quantidade` e `baixa_atividade_id`) são novas e
// dependem de SQL que roda na mão. Nada aqui pode virar 500 enquanto o SQL não
// rodou: sem `quantidade` cada etiqueta vale 1 (como era antes), e sem
// `baixa_atividade_id` a resposta é "não há vínculo pra ler" — `semVinculo` —,
// que é o que a tela usa pra avisar em vez de mentir "esta atividade não
// consumiu nada".
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { pecasDaUnidade } from "@/lib/estoque-unidades";
import { schemaDesatualizado, ErroSchemaDesatualizado } from "@/lib/estoque-unidades-gerar";

/** Teto de etiquetas lidas de uma vez (consulta de código e consumo de UMA atividade). */
export const TETO_ETIQUETAS = 200;
/** Teto de atividades por consulta em lote — o quadro inteiro cabe com folga. */
export const TETO_ATIVIDADES = 300;
/** Teto de linhas varridas na consulta em lote (300 atividades × algumas caixas). */
export const TETO_LINHAS_LOTE = 2000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normaliza o id de atividade que veio de fora (corpo de POST, query string).
 * Devolve `null` — nunca lança — pra qualquer coisa que não seja um uuid.
 *
 * É `null` e não erro de propósito no caminho da BAIXA: a coluna é `uuid`, e um
 * texto qualquer ali derrubaria o `update` inteiro (22P02) por causa do
 * VÍNCULO. Perder o vínculo é uma informação a menos no histórico; perder a
 * baixa é a caixa continuar contando como estoque depois de já ter sido aberta.
 */
export function atividadeIdValido(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return UUID.test(s) ? s : null;
}

/** Lista de ids separada por vírgula (query string), já filtrada e com teto. */
export function idsDaQuery(bruto: string | null, teto = TETO_ATIVIDADES): string[] {
  if (!bruto) return [];
  const vistos = new Set<string>();
  for (const parte of bruto.split(",")) {
    const id = atividadeIdValido(parte);
    if (id) vistos.add(id);
    if (vistos.size >= teto) break;
  }
  return [...vistos];
}

export interface ResumoConsumo {
  /** Quantas ETIQUETAS (caixas) saíram. */
  etiquetas: number;
  /** Quantas PEÇAS saíram — uma caixa de 50 conta 50, não 1. */
  pecas: number;
}

/** Soma pura: etiquetas contam, peças somam. */
export function resumirConsumo(linhas: { quantidade?: number | null }[]): ResumoConsumo {
  let pecas = 0;
  for (const l of linhas) pecas += pecasDaUnidade(l);
  return { etiquetas: linhas.length, pecas };
}

// ── "o que é esta etiqueta?" ─────────────────────────────────────────────────

export interface EtiquetaLida {
  codigo: string;
  item: string | null;
  /** Peças que ESTA etiqueta vale. 1 quando o banco ainda não tem a coluna. */
  pecas: number;
  status: string;
}

/**
 * O que cada código É, sem tirar nada do estoque. Serve pra tela dizer "Caixa ·
 * 50 un" no instante em que a etiqueta entra na fila — sem isso a pessoa bipa
 * uma caixa lacrada de 50 folhas achando que tirou uma folha.
 *
 * Código desconhecido simplesmente não volta na lista (não é erro: etiqueta
 * rasgada e digitação errada são rotina, e quem decide o que fazer com elas é a
 * baixa, não a consulta).
 */
export async function lerEtiquetas(codigos: string[]): Promise<EtiquetaLida[]> {
  if (!codigos.length) return [];
  const db = createSupabaseAdminClient();

  type Linha = { codigo: string; status: string; item_id: string; quantidade?: number | null };
  const COM_CAIXA = "codigo,status,item_id,quantidade";
  const SEM_CAIXA = "codigo,status,item_id";

  const alvo = codigos.slice(0, TETO_ETIQUETAS);
  let linhas: Linha[];
  const busca = await db.from("estoque_unidades").select(COM_CAIXA).in("codigo", alvo).limit(TETO_ETIQUETAS);
  if (busca.error && schemaDesatualizado(busca.error)) {
    const semCaixa = await db.from("estoque_unidades").select(SEM_CAIXA).in("codigo", alvo).limit(TETO_ETIQUETAS);
    if (semCaixa.error) {
      if (schemaDesatualizado(semCaixa.error)) throw new ErroSchemaDesatualizado();
      throw new Error(semCaixa.error.message);
    }
    linhas = (semCaixa.data ?? []) as Linha[];
  } else if (busca.error) {
    throw new Error(busca.error.message);
  } else {
    linhas = (busca.data ?? []) as Linha[];
  }

  return await comNomeDoItem(db, linhas, (l, nome) => ({
    codigo: l.codigo, item: nome, pecas: pecasDaUnidade(l), status: l.status,
  }));
}

// ── "o que entrou nesta atividade?" ──────────────────────────────────────────

export interface ConsumoEtiqueta {
  codigo: string;
  item: string | null;
  pecas: number;
  motivo: string | null;
  baixadoPor: string | null;
  baixadoEm: string | null;
}

export interface ConsumoDaAtividade extends ResumoConsumo {
  lista: ConsumoEtiqueta[];
  /**
   * `true` = o banco ainda não tem `baixa_atividade_id`. Não é "nada foi
   * consumido": é "não dá pra saber". A tela precisa da diferença, senão avisa
   * que a atividade está limpa quando na verdade o vínculo nem é gravado.
   */
  semVinculo: boolean;
}

export async function consumoDaAtividade(atividadeId: string): Promise<ConsumoDaAtividade> {
  const db = createSupabaseAdminClient();

  type Linha = {
    codigo: string; item_id: string; quantidade?: number | null;
    baixa_motivo: string | null; baixado_por: string | null; baixado_em: string | null;
  };
  const COM_CAIXA = "codigo,item_id,quantidade,baixa_motivo,baixado_por,baixado_em";
  const SEM_CAIXA = "codigo,item_id,baixa_motivo,baixado_por,baixado_em";

  const pedir = (colunas: string) => db
    .from("estoque_unidades")
    .select(colunas)
    .eq("baixa_atividade_id", atividadeId)
    .order("baixado_em", { ascending: false })
    .limit(TETO_ETIQUETAS);

  let linhas: Linha[];
  const busca = await pedir(COM_CAIXA);
  if (busca.error && schemaDesatualizado(busca.error)) {
    // Sem `quantidade` ainda pode dar certo. Se falhar DE NOVO, o que falta é
    // `baixa_atividade_id` (ou a tabela): aí não há vínculo pra ler.
    const semCaixa = await pedir(SEM_CAIXA);
    if (semCaixa.error) {
      if (schemaDesatualizado(semCaixa.error)) return { lista: [], etiquetas: 0, pecas: 0, semVinculo: true };
      throw new Error(semCaixa.error.message);
    }
    linhas = (semCaixa.data ?? []) as unknown as Linha[];
  } else if (busca.error) {
    throw new Error(busca.error.message);
  } else {
    linhas = (busca.data ?? []) as unknown as Linha[];
  }

  const lista = await comNomeDoItem(db, linhas, (l, nome) => ({
    codigo: l.codigo, item: nome, pecas: pecasDaUnidade(l),
    motivo: l.baixa_motivo, baixadoPor: l.baixado_por, baixadoEm: l.baixado_em,
  }));
  return { lista, ...resumirConsumo(linhas), semVinculo: false };
}

// ── "quais destas atividades já consumiram algo?" ────────────────────────────

export interface ConsumoEmLote {
  /** Só as atividades que consumiram alguma coisa — o resto nem aparece. */
  porAtividade: Record<string, ResumoConsumo>;
  semVinculo: boolean;
}

/**
 * Um SELECT só pro quadro inteiro. Sem join com `estoque_itens`: aqui a
 * pergunta é "quanto", e o nome do item custa caro (a regra do embed no
 * CLAUDE.md) — quem quiser a lista abre a atividade.
 */
export async function consumoPorAtividade(ids: string[]): Promise<ConsumoEmLote> {
  if (!ids.length) return { porAtividade: {}, semVinculo: false };
  const db = createSupabaseAdminClient();

  type Linha = { baixa_atividade_id: string; quantidade?: number | null };
  const alvo = ids.slice(0, TETO_ATIVIDADES);
  const pedir = (colunas: string) => db
    .from("estoque_unidades")
    .select(colunas)
    .in("baixa_atividade_id", alvo)
    .limit(TETO_LINHAS_LOTE);

  let linhas: Linha[];
  const busca = await pedir("baixa_atividade_id,quantidade");
  if (busca.error && schemaDesatualizado(busca.error)) {
    const semCaixa = await pedir("baixa_atividade_id");
    if (semCaixa.error) {
      if (schemaDesatualizado(semCaixa.error)) return { porAtividade: {}, semVinculo: true };
      throw new Error(semCaixa.error.message);
    }
    linhas = (semCaixa.data ?? []) as unknown as Linha[];
  } else if (busca.error) {
    throw new Error(busca.error.message);
  } else {
    linhas = (busca.data ?? []) as unknown as Linha[];
  }

  const porAtividade: Record<string, ResumoConsumo> = {};
  for (const l of linhas) {
    if (!l.baixa_atividade_id) continue;
    const atual = porAtividade[l.baixa_atividade_id] ?? { etiquetas: 0, pecas: 0 };
    atual.etiquetas += 1;
    atual.pecas += pecasDaUnidade(l);
    porAtividade[l.baixa_atividade_id] = atual;
  }
  return { porAtividade, semVinculo: false };
}

// ── comum ────────────────────────────────────────────────────────────────────

/**
 * Junta o nome do item numa consulta só pro lote inteiro — nunca linha a linha.
 * Sem nome (item apagado, ou consulta que falhou) a tela ainda mostra o código,
 * que é o que a pessoa tem na mão.
 */
async function comNomeDoItem<L extends { item_id: string }, R>(
  db: ReturnType<typeof createSupabaseAdminClient>,
  linhas: L[],
  monta: (linha: L, nome: string | null) => R,
): Promise<R[]> {
  const itemIds = [...new Set(linhas.map((l) => l.item_id).filter(Boolean))];
  const nome = new Map<string, string>();
  if (itemIds.length) {
    const { data } = await db.from("estoque_itens").select("id,nome").in("id", itemIds).limit(TETO_ETIQUETAS);
    for (const it of (data ?? []) as { id: string; nome: string }[]) nome.set(it.id, it.nome);
  }
  return linhas.map((l) => monta(l, nome.get(l.item_id) ?? null));
}
