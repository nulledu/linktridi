// ── Marketing · Stories — o que já foi usado ─────────────────────────────────
// Evitar repetição era metade do motivo do quadro do Miro: rolar os meses
// anteriores pra ver se "aquele do kit com 20%" já tinha saído. Aqui a pergunta
// é respondida sozinha, por dois caminhos independentes:
//
//  1. MESMA ARTE — a miniatura vira um dHash de 64 bits (a imagem reduzida a
//     9×8 em cinza, cada bit dizendo se o pixel é mais claro que o vizinho).
//     Reenviar o mesmo print, ou a mesma peça recortada/recomprimida, dá
//     hashes a poucos bits de distância. Pega a repetição que ninguém
//     descreveria diferente, porque é literalmente a mesma imagem.
//  2. MESMO CONTEÚDO — produto, tipo, tema, CTA e campanha, pesados. Pega a
//     ideia repetida numa arte nova ("Carimbo · Oferta · Desconto 20%" de
//     novo, com outra foto).
//
// É aviso, nunca trava: a tela mostra os parecidos e a pessoa decide.
//
// Puro e testado em `lib/__tests__/stories-semelhanca.test.ts`.

// ── Texto ────────────────────────────────────────────────────────────────────

const PARADAS = new Set(
  ("a o e as os um uma uns umas de da do das dos em no na nos nas por para pra pro com sem que se ao aos " +
    "ou mais menos muito seu sua seus suas nosso nossa voce vc ja so ate").split(" "),
);

// Marcas de acento combinantes (U+0300–U+036F), que o NFD separa da letra.
// Montado por código de caractere de propósito: escrito literal no fonte, o
// intervalo vira dois acentos soltos que nenhum editor mostra direito.
const ACENTOS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

/** Minúsculas, sem acento, só letras e números separados por espaço. */
export function normalizar(t: string | null | undefined): string {
  return (t ?? "")
    .normalize("NFD")
    .replace(ACENTOS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * As palavras que carregam sentido: sem artigo/preposição, e com o plural
 * simples desfeito — "carimbos" e "carimbo" são o mesmo assunto.
 */
export function palavras(t: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (let w of normalizar(t).split(" ")) {
    if (!w || PARADAS.has(w)) continue;
    if (w.length > 4 && w.endsWith("s") && !/\d/.test(w)) w = w.slice(0, -1);
    if (w.length >= 2 || /\d/.test(w)) out.add(w);
  }
  return out;
}

// O quadro do mês compara cada story com o histórico INTEIRO (~100 × ~1.200
// por carga). Os mesmos temas se repetem o tempo todo, então as palavras e o
// texto normalizado de cada um são guardados — sem isso, 240 mil normalizações
// por requisição. Os conjuntos devolvidos são compartilhados: não mexa neles.
const MEMO_MAX = 4000;
const memoPalavras = new Map<string, Set<string>>();
const memoNorm = new Map<string, string>();

function palavrasDe(t: string | null | undefined): Set<string> {
  const k = t ?? "";
  let s = memoPalavras.get(k);
  if (!s) {
    if (memoPalavras.size >= MEMO_MAX) memoPalavras.clear();
    s = palavras(k);
    memoPalavras.set(k, s);
  }
  return s;
}
function normDe(t: string | null | undefined): string {
  const k = t ?? "";
  let s = memoNorm.get(k);
  if (s === undefined) {
    if (memoNorm.size >= MEMO_MAX) memoNorm.clear();
    s = normalizar(k);
    memoNorm.set(k, s);
  }
  return s;
}

/** Interseção ÷ união. Dois vazios = 0 (sem texto não há evidência de nada). */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size || !b.size) return 0;
  let comum = 0;
  for (const x of a) if (b.has(x)) comum++;
  return comum / (a.size + b.size - comum);
}

/**
 * A busca do histórico: TODAS as palavras digitadas aparecem no texto (em
 * qualquer ordem, sem acento, como começo de palavra). "kit carimbo" acha
 * "Carimbo — kit com 20%"; "promocao" acha "Promoção".
 */
export function casaBusca(texto: string, termo: string): boolean {
  const alvo = ` ${normalizar(texto)}`;
  const partes = normalizar(termo).split(" ").filter(Boolean);
  return partes.every((p) => alvo.includes(` ${p}`));
}

// ── Imagem ───────────────────────────────────────────────────────────────────

/**
 * dHash a partir de 9×8 tons de cinza (72 valores, linha a linha): em cada
 * linha, 8 bits "este pixel é mais claro que o da direita". Devolve 16 hex.
 * A parte que precisa de canvas (reduzir a imagem) fica na tela; esta é pura.
 */
export function dhashDePixels(cinza: ArrayLike<number>): string {
  if (cinza.length < 72) throw new Error("dhash: esperados 72 valores (9×8)");
  let hex = "";
  let nibble = 0;
  let bits = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      nibble = (nibble << 1) | (cinza[y * 9 + x] > cinza[y * 9 + x + 1] ? 1 : 0);
      if (++bits === 4) {
        hex += nibble.toString(16);
        nibble = 0;
        bits = 0;
      }
    }
  }
  return hex;
}

const HASH = /^[0-9a-f]{16}$/;
const UNS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** Quantos dos 64 bits diferem. Hash ausente ou torto = 64 (nada em comum). */
export function hamming(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b || !HASH.test(a) || !HASH.test(b)) return 64;
  let d = 0;
  for (let i = 0; i < 16; i++) d += UNS[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d;
}

// ── Comparação ───────────────────────────────────────────────────────────────

/** Até 6 de 64 bits = mesma imagem (recompressão e recorte leve ficam abaixo disso). */
export const LIMIAR_MESMA_ARTE = 6;
/**
 * Nota a partir da qual o conteúdo conta como "parecido". Mesmo produto +
 * mesmo tipo + tema com dois terços das palavras em comum passa; mesmo
 * produto + mesmo tipo com tema diferente (0,55) não — é o dia a dia de uma
 * campanha, não repetição.
 */
export const LIMIAR_SEMELHANCA = 0.75;

const PESO = { produto: 0.35, tipo: 0.2, tema: 0.3, cta: 0.05, campanha: 0.1 };
// Sem tema dos dois lados a nota não passa de 0,7 — abaixo do limiar. É isso
// que deixa `parecidos` pular a conta inteira nesses casos (a maioria).
const SEM_TEMA_NAO_ALCANCA = PESO.produto + PESO.tipo + PESO.cta + PESO.campanha < LIMIAR_SEMELHANCA;

export interface ConteudoStory {
  produtoId?: string | null;
  tipo?: string | null;
  tema?: string | null;
  cta?: string | null;
  campanha?: string | null;
  hashVisual?: string | null;
}

export interface Comparacao {
  nota: number;
  mesmaArte: boolean;
}

export function compararConteudo(a: ConteudoStory, b: ConteudoStory): Comparacao {
  const mesmaArte = hamming(a.hashVisual, b.hashVisual) <= LIMIAR_MESMA_ARTE;
  if (mesmaArte) return { nota: 1, mesmaArte };
  let nota = 0;
  if (a.produtoId && a.produtoId === b.produtoId) nota += PESO.produto;
  if (a.tipo && a.tipo === b.tipo) nota += PESO.tipo;
  nota += PESO.tema * jaccard(palavrasDe(a.tema), palavrasDe(b.tema));
  const ctaA = normDe(a.cta);
  if (ctaA && ctaA === normDe(b.cta)) nota += PESO.cta;
  const campA = normDe(a.campanha);
  if (campA && campA === normDe(b.campanha)) nota += PESO.campanha;
  return { nota: Math.round(nota * 100) / 100, mesmaArte };
}

export function ehParecido(c: Comparacao): boolean {
  return c.mesmaArte || c.nota >= LIMIAR_SEMELHANCA;
}

type NoHistorico = ConteudoStory & { id: string; publicadoEm: string };

export interface Parecido<T> extends Comparacao {
  item: T;
}

const temTema = (c: ConteudoStory) => palavrasDe(c.tema).size > 0;

/**
 * Os stories do histórico parecidos com o alvo, do mais parecido pro menos
 * (mesma arte primeiro). `antes`: só os publicados ANTES do alvo — é o que
 * responde "este repetiu alguém?", sem acusar o original de copiar a cópia.
 */
export function parecidos<T extends NoHistorico>(
  alvo: ConteudoStory & { id?: string; publicadoEm?: string },
  historico: readonly T[],
  opts: { antes?: boolean; limite?: number } = {},
): Parecido<T>[] {
  const out: Parecido<T>[] = [];
  const alvoTemTema = temTema(alvo);
  for (const item of historico) {
    if (alvo.id && item.id === alvo.id) continue;
    if (opts.antes && alvo.publicadoEm && !(item.publicadoEm < alvo.publicadoEm)) continue;
    if (SEM_TEMA_NAO_ALCANCA && (!alvoTemTema || !temTema(item))
      && hamming(alvo.hashVisual, item.hashVisual) > LIMIAR_MESMA_ARTE) continue;
    const c = compararConteudo(alvo, item);
    if (ehParecido(c)) out.push({ item, ...c });
  }
  out.sort((a, b) =>
    Number(b.mesmaArte) - Number(a.mesmaArte) || b.nota - a.nota || (a.item.publicadoEm < b.item.publicadoEm ? 1 : -1));
  return out.slice(0, opts.limite ?? 5);
}

/**
 * Quantas vezes este mesmo produto já saiu neste mesmo tipo, e quando foi a
 * última. Não é repetição (é o dia a dia), mas é o que ajuda a espaçar: "o
 * último Carimbo · Oferta foi anteontem".
 */
export function mesmoFormato<T extends NoHistorico>(
  alvo: ConteudoStory & { id?: string },
  historico: readonly T[],
): { total: number; ultimo: string | null } {
  if (!alvo.produtoId || !alvo.tipo) return { total: 0, ultimo: null };
  let total = 0;
  let ultimo: string | null = null;
  for (const s of historico) {
    if (s.id === alvo.id || s.produtoId !== alvo.produtoId || s.tipo !== alvo.tipo) continue;
    total++;
    if (!ultimo || s.publicadoEm > ultimo) ultimo = s.publicadoEm;
  }
  return { total, ultimo };
}
