// ── O bipe que abre a atividade ──────────────────────────────────────────────
//
// Com o interruptor LIGADO, a pessoa não começa a trabalhar tocando "Aceitar":
// ela primeiro BIPA a etiqueta do material que vai usar. A caixa sai do estoque
// nesse instante (a baixa é feita por `lib/estoque-baixa.ts`) e fica amarrada à
// atividade por `estoque_unidades.baixa_atividade_id` — é isso que responde
// "fulano fez chancela usando a folha que ciclano fez".
//
// Este módulo é o LIVRO do bipe: a tabela `atividade_bipes`. Ela existe porque
// `estoque_unidades` só sabe contar o que deu certo, e o que interessa saber
// depois é justamente o que NÃO deu:
//
//   · a etiqueta que o leitor leu mas o banco não conhece (`desconhecida`);
//   · a que já tinha sido baixada por outra pessoa (`ja_baixada`);
//   · e a vez em que ninguém bipou nada e a pessoa começou assim mesmo
//     (`dispensado`, com o motivo).
//
// A ÚLTIMA é a razão de tudo isto existir. Exigir o bipe sem uma saída prende
// gente na bancada quando a etiqueta descolou — mas uma saída que não deixa
// rastro vira o caminho normal em duas semanas. Então a saída existe, é um
// toque, e fica escrita com nome e motivo.
//
// TOLERANTE POR PRINCÍPIO: a tabela roda à mão (supabase/atividades_bipe_material.sql).
// Enquanto ninguém rodou, gravar aqui não pode derrubar a baixa nem o início da
// atividade — o registro é o que se perde primeiro, nunca o trabalho.

import { atividadeIdValido } from "@/lib/estoque-consumo";

// O Supabase não tem tipos gerados aqui; fronteira dinâmica isolada nesta
// camada, como em lib/estoque-automacao.ts e lib/estoque-colunas.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Um uuid, ou `null`. É o MESMO crivo de `atividadeIdValido` — só o nome muda,
 * porque aqui a pergunta é sobre a PESSOA que bipou. Duas colunas `uuid`
 * (`atividade_id` e `colaborador_id`) recebem texto vindo da fila offline do
 * tablet, e um texto que não é uuid derruba o INSERT inteiro com 22P02.
 */
export const uuidOuNulo = atividadeIdValido;

// O vocabulário da dispensa (os motivos, os rótulos, as situações) mora em
// `lib/atividades-aberturas.ts`, que é PURO. Ele é rótulo de TELA e vocabulário
// de SERVIDOR ao mesmo tempo, e este arquivo aqui puxa `estoque-consumo` →
// `createSupabaseAdminClient` → `next/headers`: um `"use client"` que
// importasse os motivos daqui quebraria o build inteiro (foi o que aconteceu
// com /atividades/historico). Reexportado pra quem já importava deste caminho —
// o pull do tablet e os testes — continuar igual.
export {
  MOTIVOS_DISPENSA, SITUACOES_BIPE, motivoDispensaValido, rotuloDispensa,
} from "@/lib/atividades-aberturas";
export type { MotivoDispensa, SituacaoBipe } from "@/lib/atividades-aberturas";

import type { SituacaoBipe } from "@/lib/atividades-aberturas";

/**
 * Teto de etiquetas num bipe de abertura. Quarenta é muito mais que o real
 * (o normal é uma caixa, às vezes três), e ainda assim é um teto: leitor preso
 * repetindo a mesma leitura não pode virar uma varredura de milhares de linhas.
 */
export const LOTE_MAXIMO_BIPES = 40;

/**
 * Limpa a lista de códigos que veio do tablet: descarta vazio, tira repetido
 * PRESERVANDO A ORDEM e corta no teto.
 *
 * O de-dup importa de verdade: o leitor HID às vezes emite a mesma leitura duas
 * vezes (dedo segurando o gatilho), e sem isto a segunda cópia voltaria
 * `ja_baixada` — a pessoa veria "etiqueta já usada" no meio de um bipe que deu
 * certo e concluiria que o sistema está errado.
 */
export function normalizarCodigos(bruto: unknown, teto = LOTE_MAXIMO_BIPES): string[] {
  if (!Array.isArray(bruto)) return [];
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const c of bruto) {
    const codigo = String(c ?? "").trim();
    if (!codigo || vistos.has(codigo)) continue;
    vistos.add(codigo);
    saida.push(codigo);
    if (saida.length >= teto) break;
  }
  return saida;
}

// ── O que vira linha no livro ────────────────────────────────────────────────

export interface EventoBipe {
  /** Nulo só na dispensa: não houve etiqueta nenhuma. */
  codigo: string | null;
  situacao: SituacaoBipe;
  /** Nome do item, do jeito que estava HOJE. Snapshot: renomear o item depois
   *  não pode reescrever o histórico. */
  item: string | null;
  /** Peças que saíram do estoque com este bipe. Zero quando nada saiu. */
  pecas: number;
  /** Só na dispensa. */
  motivo: string | null;
}

/** O que `baixarUnidades` devolveu, traduzido em linhas do livro. */
export function eventosDoConsumo(
  resultado: { codigo: string; situacao: "baixada" | "desconhecida" | "ja_baixada"; item: string | null; pecas: number }[],
): EventoBipe[] {
  return resultado.map((r) => ({
    codigo: r.codigo,
    situacao: r.situacao,
    item: r.item,
    // `pecas` já vem 0 de `baixarUnidades` quando nada saiu — mas a guarda fica
    // aqui também porque esta função é a fronteira do que entra no banco, e a
    // coluna tem `check (pecas >= 0)`.
    pecas: r.situacao === "baixada" ? Math.max(0, Math.trunc(r.pecas) || 0) : 0,
    motivo: null,
  }));
}

/** A vez em que ninguém bipou nada. */
export function eventoDeDispensa(motivo: string): EventoBipe {
  return { codigo: null, situacao: "dispensado", item: null, pecas: 0, motivo: motivo || "sem_motivo" };
}

/** Resumo de um bipe pra quem chamou responder ao tablet. */
export interface ResumoBipe {
  /** Etiquetas que de fato saíram do estoque agora. */
  baixadas: number;
  /** Códigos que o banco não conhece — etiqueta de outro sistema, ou digitação. */
  desconhecidas: number;
  /** Já estavam baixadas (outra pessoa chegou antes, ou repetiu o envio). */
  repetidas: number;
  /** Peças (a caixa de 50 conta 50). */
  pecas: number;
  dispensado: boolean;
}

export function resumirBipes(eventos: EventoBipe[]): ResumoBipe {
  const r: ResumoBipe = { baixadas: 0, desconhecidas: 0, repetidas: 0, pecas: 0, dispensado: false };
  for (const e of eventos) {
    if (e.situacao === "baixada") { r.baixadas += 1; r.pecas += e.pecas; }
    else if (e.situacao === "desconhecida") r.desconhecidas += 1;
    else if (e.situacao === "ja_baixada") r.repetidas += 1;
    else if (e.situacao === "dispensado") r.dispensado = true;
  }
  return r;
}

// ── Escrita ──────────────────────────────────────────────────────────────────

const semTabela = (msg?: string) =>
  !!msg && /relation .* does not exist|Could not find the table|schema cache/i.test(msg);

export interface RegistroDeBipes {
  atividadeId: string;
  colaboradorId: string | null;
  colaboradorNome: string | null;
  /** Quando aconteceu NO TABLET. A fila offline reenvia horas depois; gravar
   *  `now()` carimbaria a manhã inteira no segundo do flush — a mesma armadilha
   *  já vivida no ponto (batida sem `batidoEm`). */
  ocorridoEm?: string | null;
  eventos: EventoBipe[];
}

/**
 * Grava as linhas. NUNCA lança: o livro é o registro de um trabalho que já
 * aconteceu na bancada, e derrubar o `push` inteiro por causa dele faria a
 * atividade voltar pra fila offline do tablet e ser reenviada pra sempre.
 *
 * @returns `true` se gravou, `false` se a tabela ainda não existe (ou falhou).
 */
export async function registrarBipes(db: Db, reg: RegistroDeBipes): Promise<boolean> {
  if (!reg.eventos.length) return true;
  const quando = reg.ocorridoEm || new Date().toISOString();
  const linhas = reg.eventos.slice(0, LOTE_MAXIMO_BIPES + 1).map((e) => ({
    atividade_id: reg.atividadeId,
    colaborador_id: reg.colaboradorId || null,
    colaborador_nome: reg.colaboradorNome || null,
    codigo: e.codigo,
    situacao: e.situacao,
    item: e.item,
    pecas: e.pecas,
    motivo: e.motivo,
    ocorrido_em: quando,
  }));
  try {
    const { error } = await db.from("atividade_bipes").insert(linhas);
    if (error) {
      if (semTabela(error.message)) return false;
      // Erro que não é "falta a tabela" também não sobe: ver o comentário do
      // cabeçalho. Fica no log do servidor pra alguém achar.
      console.warn("[atividade-bipes] não gravou:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[atividade-bipes] não gravou:", String(e).slice(0, 160));
    return false;
  }
}

// ── O interruptor ────────────────────────────────────────────────────────────

/**
 * A exigência está ligada? Mora na mesma linha única de `estoque_config` onde
 * já mora o interruptor da automação de reposição — não é uma tabela nova pra
 * guardar um booleano.
 *
 * DESLIGADO é sempre a resposta segura: sem a coluna (SQL não rodado), com a
 * tabela ausente, ou com o banco fora do ar, o tablet segue trabalhando como
 * trabalha hoje. O contrário — um erro de leitura virando "exige bipe" — para
 * a bancada inteira por causa de uma consulta que falhou.
 */
export async function exigeBipeParaIniciar(db: Db): Promise<boolean> {
  try {
    const { data, error } = await db.from("estoque_config")
      .select("bipe_para_iniciar").eq("id", true).maybeSingle();
    if (error) return false;
    return data?.bipe_para_iniciar === true;
  } catch {
    return false;
  }
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export interface LinhaDoLivro extends EventoBipe {
  colaboradorNome: string | null;
  ocorridoEm: string;
}

/** Teto de linhas de UMA atividade. Cabe com muita folga: o normal é 1 a 3. */
export const TETO_LINHAS_ATIVIDADE = 100;

/**
 * O livro de UMA atividade, do mais recente pro mais antigo. Lista vazia
 * quando a tabela ainda não existe — quem mostra tem que saber que "vazio"
 * aqui pode ser "ninguém rodou o SQL", por isso `semLivro` vem junto.
 */
export async function bipesDaAtividade(
  db: Db,
  atividadeId: string,
): Promise<{ lista: LinhaDoLivro[]; semLivro: boolean }> {
  const { data, error } = await db.from("atividade_bipes")
    .select("codigo,situacao,item,pecas,motivo,colaborador_nome,ocorrido_em")
    .eq("atividade_id", atividadeId)
    .order("ocorrido_em", { ascending: false })
    .limit(TETO_LINHAS_ATIVIDADE);
  if (error) {
    if (semTabela(error.message)) return { lista: [], semLivro: true };
    throw new Error(error.message);
  }
  type Row = {
    codigo: string | null; situacao: SituacaoBipe; item: string | null;
    pecas: number | null; motivo: string | null; colaborador_nome: string | null; ocorrido_em: string;
  };
  const lista = ((data ?? []) as Row[]).map((r) => ({
    codigo: r.codigo,
    situacao: r.situacao,
    item: r.item,
    pecas: Math.max(0, Math.trunc(Number(r.pecas)) || 0),
    motivo: r.motivo,
    colaboradorNome: r.colaborador_nome,
    ocorridoEm: r.ocorrido_em,
  }));
  return { lista, semLivro: false };
}
