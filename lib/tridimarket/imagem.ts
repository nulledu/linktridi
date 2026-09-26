// Foto de produto: SEMPRE quadrada, 1000×1000, e a embalagem inteira dentro.
//
// Antes cada foto chegava com a proporção que o fornecedor mandou (2:3 de
// vitrine, 16:9 de banner) e a tela cortava pra caber no quadrado — o que
// comia justamente o topo e o rodapé da embalagem, onde ficam marca e sabor.
// Numa lista de dez lasanhas iguais, era a única coisa que as distinguia.
//
// A regra é uma só: a imagem é ENCAIXADA (contain) num quadrado, nunca
// preenchida (cover). Sobra vira margem, não corte.

/** Lado do quadrado padrão do catálogo. */
export const LADO_PADRAO = 1000;

export type Encaixe = { largura: number; altura: number; x: number; y: number };

/**
 * Onde desenhar uma imagem `largura`×`altura` dentro de um quadrado de `lado`,
 * inteira e centralizada.
 *
 * Imagem menor que o quadrado NÃO é esticada: ampliar 300px pra 1000 só entrega
 * borrão. Ela fica no tamanho original, centralizada.
 */
export function encaixarNoQuadrado(largura: number, altura: number, lado = LADO_PADRAO): Encaixe {
  if (!(largura > 0) || !(altura > 0) || !(lado > 0)) return { largura: 0, altura: 0, x: 0, y: 0 };
  // `min(..., 1)` é o que impede a ampliação.
  const escala = Math.min(lado / largura, lado / altura, 1);
  const l = Math.round(largura * escala);
  const a = Math.round(altura * escala);
  return { largura: l, altura: a, x: Math.round((lado - l) / 2), y: Math.round((lado - a) / 2) };
}
