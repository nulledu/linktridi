// ── Marketing · a que LINHA de produto o anúncio pertence ────────────────────
// Carimbo e chancela são vendidos pela mesma equipe, nas mesmas contas, e o
// ranking de criativos misturava os dois. Quem separa, na operação, é a TAG da
// campanha — `{CRB}` (carimbo) e `{CH}` (chancela) — e, mais grosso, a conta de
// anúncios (a "BM").
//
// Por que a tag manda e o NOME DA CONTA não: a conta 914110580682113 se chama
// "VSL - Carimbos Ma1" e roda campanha `{CH}` o tempo todo. Classificar pelo
// nome da conta erraria a conta inteira. Então:
//
//   1) tag na campanha  →  decide
//   2) `CH` no nome do anúncio  →  decide (FV 09 CH V3 - L, JL - 06 CH REEL)
//   3) nada disso  →  fica SEM MARCA, e quem herda é a conta, se ela tiver uma
//      linha dominante (ver `linhaDominante`). Nunca chuta.
//
// `TYPE` é carimbo: as campanhas escrevem "{TYPE} {CRB}" juntas, e as contas
// "Type - Carimbos …" são de carimbo mesmo.

export type LinhaProduto = "carimbo" | "chancela" | "outro";

export const LINHAS: { key: LinhaProduto; label: string }[] = [
  { key: "carimbo", label: "Carimbo" },
  { key: "chancela", label: "Chancela" },
  { key: "outro", label: "Outros" },
];

export function linhaLabel(k: LinhaProduto | null): string {
  return LINHAS.find((l) => l.key === k)?.label ?? "Sem marca";
}

// `\bCH\b` pega "VEGA CH TST", "Teste CR CH" e "{CH}" de uma vez; CHANCEL cobre
// "CHANCELE"/"CHANCELA" escritos por extenso.
const RE_CHANCELA = /\bCH\b|CHANCEL/i;
const RE_CARIMBO = /\bCRB\b|CARIMBO|\bTYPE\b/i;
// {MKT} e as campanhas de WhatsApp não vendem produto: são captação.
const RE_OUTRO = /\bMKT\b|\bWPP\b|WHATS/i;

/**
 * Linha de UMA linha do armazém (anúncio × dia). `null` = sem marca nenhuma —
 * o chamador decide se herda da conta ou deixa sem classificar.
 */
export function linhaDoAnuncio(campanha: string | null | undefined, anuncio?: string | null): LinhaProduto | null {
  const c = campanha || "";
  const a = anuncio || "";
  // Chancela primeiro: campanha de chancela costuma trazer as duas tags
  // ("VEGA CH … {CRB}"), e a específica é a que vale.
  if (RE_CHANCELA.test(c) || RE_CHANCELA.test(a)) return "chancela";
  if (RE_CARIMBO.test(c) || RE_CARIMBO.test(a)) return "carimbo";
  if (RE_OUTRO.test(c)) return "outro";
  return null;
}

/**
 * Dado o gasto por linha (de um criativo ou de uma conta), qual delas manda.
 * Exige `piso` de participação pra herança de conta não carimbar uma conta
 * misturada — 0 desliga o piso (é o caso do próprio criativo, onde a maior
 * fatia já é a resposta).
 */
export function linhaDominante(pesos: Map<LinhaProduto, number>, piso = 0): LinhaProduto | null {
  let total = 0, melhor: LinhaProduto | null = null, maior = 0;
  for (const [k, v] of pesos) {
    if (v <= 0) continue;
    total += v;
    if (v > maior) { maior = v; melhor = k; }
  }
  if (!melhor || total <= 0) return null;
  return maior / total >= piso ? melhor : null;
}
