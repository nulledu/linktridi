// Edição de itens de uma venda já registrada (popup da pessoa).
//
// A armadilha que este arquivo existe pra fechar: `venda_itens` guarda UMA
// LINHA POR PRODUTO, com coluna `quantidade`. A primeira versão do `setQty`
// tratava as linhas como uma-por-unidade e comparava a quantidade desejada com
// `rowIds.length` — então em "Pringles ×2" (que é 1 linha) o botão de menos
// caía em `alvo === linhas.length`, não entrava em nenhum ramo e respondia
// `ok: true` sem mudar nada. Clicar não fazia absolutamente nada.

export interface LinhaDeItem { id: number; quantidade: number; precoUnit: number }

export interface PlanoDeQuantidade {
  /** Linha que sobrevive e recebe a quantidade nova (null = apagar tudo). */
  manter: number | null;
  novaQuantidade: number;
  /** Linhas duplicadas do mesmo produto, ou todas quando a quantidade é zero. */
  remover: number[];
}

/**
 * Como levar as linhas de um produto até a quantidade desejada.
 *
 * Consolida em UMA linha de propósito: dados antigos podem ter o mesmo produto
 * repartido em várias (foi assim que a venda do tablet nasceu por um tempo), e
 * deixar as sobras vivas faria a tela mostrar a quantidade certa e cobrar duas.
 */
export function planoDeQuantidade(linhas: LinhaDeItem[], alvo: number): PlanoDeQuantidade {
  const quantidade = Math.max(0, Math.round(Number(alvo) || 0));
  const ordenadas = [...linhas].sort((a, b) => a.id - b.id);
  if (quantidade === 0 || !ordenadas.length) {
    return { manter: null, novaQuantidade: 0, remover: ordenadas.map((l) => l.id) };
  }
  const [primeira, ...resto] = ordenadas;
  return { manter: primeira.id, novaQuantidade: quantidade, remover: resto.map((l) => l.id) };
}

/** Total de uma venda a partir das linhas — a mesma conta que a listagem faz. */
export function totalDosItens(linhas: Array<{ quantidade: number; precoUnit: number }>): number {
  const bruto = linhas.reduce((s, l) => s + (Number(l.quantidade) || 0) * (Number(l.precoUnit) || 0), 0);
  return Math.round((bruto + Number.EPSILON) * 100) / 100;
}
