// ── Resolver item pelo NOME, sem o nome virar coringa ────────────────────────
//
// Metade do módulo de Estoque acha o item por `.ilike("nome", nome)` — a
// atividade guarda `produto_nome` (texto), não `item_id`, e a requisição de
// reposição também. Só que `ilike` é LIKE: o valor não é comparado, é
// INTERPRETADO como padrão. Num catálogo com "ADESIVO 100% PP" o padrão vira
// "ADESIVO 100" + qualquer coisa, e `_` casa um caractere qualquer — a
// aprovação da conferência dava entrada no primeiro item que casasse.
//
// Duas defesas, porque uma só não basta:
//
//  1. `padraoDeNomeExato` escapa `\`, `%` e `_` antes de mandar pro banco.
//  2. `mesmoNome` refaz a comparação EM JAVASCRIPT sobre o que voltou. É a
//     rede: o PostgREST troca `*` por `%` no padrão de `like`/`ilike` por conta
//     própria (é a sintaxe documentada dele), então um item com `*` no nome
//     escaparia da defesa 1 mesmo com o backslash. Filtrar de novo aqui fecha
//     esse buraco e qualquer outro que apareça na serialização do filtro.
//
// E o terceiro caso, que nenhuma das duas resolve sozinha: DUAS linhas com o
// mesmo nome (diferindo só por maiúscula — não há UNIQUE em `estoque_itens.nome`).
// Aí a resposta certa não é escolher: é `ErroNomeAmbiguo`, que vira uma frase
// acionável ("há N itens com este nome — corrija o catálogo") em vez de depositar
// peça num item ao acaso, hoje numa linha e amanhã na outra.
//
// Módulo PURO de propósito (sem Supabase): dá pra travar em teste sem banco.

/** Quantas linhas pedir ao resolver por nome. Mais de uma de propósito: é o
 *  que deixa a duplicata ser DETECTADA em vez de sorteada pelo `.limit(1)`. */
export const TETO_NOMES = 20;

export class ErroNomeAmbiguo extends Error {
  constructor(public nome: string, public quantos: number) { super("nome_ambiguo"); }
}

/**
 * O nome pronto pra ir num `.ilike()` como IGUALDADE insensível a caixa.
 *
 * `\` primeiro, senão o backslash que a própria função insere seria escapado
 * de novo na passada seguinte.
 */
export function padraoDeNomeExato(nome: string): string {
  return String(nome ?? "").replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Igualdade de nome do jeito que o galpão entende: sem caixa, sem espaço sobrando. */
export function mesmoNome(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = String(a ?? "").trim().toLowerCase();
  const nb = String(b ?? "").trim().toLowerCase();
  return na.length > 0 && na === nb;
}

/**
 * Filtra o que o banco devolveu, mantendo só quem casa o nome DE VERDADE.
 *
 * Devolve a única linha que casou, `null` quando não casou nenhuma, e LANÇA
 * `ErroNomeAmbiguo` quando casou mais de uma — escolher em silêncio é o que
 * fazia o mesmo produto abastecer um item hoje e outro amanhã.
 */
export function umItemPeloNome<T extends { nome?: string | null }>(
  linhas: T[] | null | undefined,
  nome: string,
): T | null {
  const casam = (linhas ?? []).filter((l) => mesmoNome(l.nome, nome));
  if (casam.length > 1) throw new ErroNomeAmbiguo(nome, casam.length);
  return casam[0] ?? null;
}
