// ── Entrada por bipagem: a peça que estava fora do sistema ───────────────────
//
// O galpão tinha duas portas de entrada, e as duas exigem um papel antes:
// RECEBIMENTO (contra uma compra que alguém lançou) e CONFERÊNCIA (contra uma
// atividade que alguém concluiu). Faltava a terceira, que é a mais comum no dia
// a dia: a peça está na mão, o sistema não sabe dela, e não há pedido nenhum
// atrás.
//
// ── POR QUE O MOTIVO É PERGUNTADO, E NÃO DECIDIDO AQUI ──────────────────────
//
// "Bipar produto pra entrar no estoque" tem três significados no galpão, e eles
// não são a mesma coisa nem no número nem na contabilidade:
//
//   chegou      → veio de fornecedor sem pedido lançado. É COMPRA: entrou peça
//                 nova no mundo, e o custo existe em algum lugar.
//   produzido   → saiu da bancada. É PRODUÇÃO: o material que virou isto já
//                 saiu do estoque antes, então o custo já foi contado.
//   encontrado  → estava na prateleira e o sistema não sabia. É CORREÇÃO: nada
//                 entrou no mundo, o número é que estava errado.
//
// Escolher um deles no código seria decidir, uma vez e pra sempre, uma coisa
// que muda a cada bipe. Quem sabe é quem está com a peça na mão, e responder
// custa um toque — o mesmo desenho da baixa, onde o motivo também é escolhido
// pela pessoa (`lib/estoque-baixa.ts`).

/** Os três motivos, na ordem em que aparecem na tela. */
export const MOTIVOS_DE_ENTRADA = [
  {
    key: "chegou",
    label: "Chegou de fornecedor",
    ajuda: "Veio de fora e não tem compra lançada. Se tiver pedido, use Recebimento — lá a nota fecha contra o que foi pedido.",
  },
  {
    key: "produzido",
    label: "Produzido aqui",
    ajuda: "Saiu da bancada sem passar por atividade. O material que virou isto já saiu do estoque quando foi bipado.",
  },
  {
    key: "encontrado",
    label: "Achei na prateleira",
    ajuda: "Já estava aqui e o sistema não sabia. Não entrou nada novo — o número é que estava errado.",
  },
] as const;

export type MotivoDeEntrada = (typeof MOTIVOS_DE_ENTRADA)[number]["key"];

const CHAVES = new Set<string>(MOTIVOS_DE_ENTRADA.map((m) => m.key));

export function motivoDeEntradaValido(v: unknown): v is MotivoDeEntrada {
  return typeof v === "string" && CHAVES.has(v);
}

/**
 * Teto por bipe.
 *
 * Não é limite de banco: é o dedo. Digitar "1000" onde se queria "10" num
 * teclado de totem é um zero a mais, e o estoque passa a mandar não comprar o
 * que acabou. Acima disto a entrada é decisão de escritório, com a compra
 * lançada — que é a porta do Recebimento.
 */
export const MAX_POR_ENTRADA = 500;

export class ErroItemNaoAchado extends Error {
  constructor() { super("item_nao_achado"); }
}
export class ErroItemSerializadoNaEntrada extends Error {
  constructor() { super("item_serializado"); }
}
export class ErroQuantidadeDeEntrada extends Error {
  constructor() { super("quantidade_invalida"); }
}
export class ErroMotivoDeEntrada extends Error {
  constructor() { super("motivo_invalido"); }
}

export interface ItemDaEntrada {
  id: string;
  nome: string;
  quantidade: number | null;
  unidade: string | null;
  serializado: boolean | null;
}

/**
 * O que impede a entrada, em português, ou `null` quando pode.
 *
 * A frase é a resposta na tela do totem, então ela diz O QUE FAZER — quem está
 * de luva não traduz código de erro.
 */
export function problemaDaEntrada(item: ItemDaEntrada | null, quantidade: number, motivo: unknown): string | null {
  if (!item) {
    return "Não achei nenhum item com este código. Se a etiqueta é de produto, confira o SKU na ficha do item; " +
      "se é de caixa, ela entra por Receber ou pela conferência.";
  }
  if (item.serializado) {
    // Aqui o estoque é a SOMA das etiquetas, mantida por gatilho. Somar na mão
    // criaria um número que a próxima recontagem apaga, sem avisar ninguém.
    return `"${item.nome}" é contado por etiqueta: cada peça tem o código dela, e o estoque vem da soma delas. ` +
      "Pra entrar peça nova, gere as etiquetas na ficha do item.";
  }
  if (!Number.isFinite(quantidade) || Math.trunc(quantidade) !== quantidade || quantidade < 1) {
    return "Diga quantas peças entraram — um número inteiro, a partir de 1.";
  }
  if (quantidade > MAX_POR_ENTRADA) {
    return `${quantidade} de uma vez é demais (máximo ${MAX_POR_ENTRADA}). ` +
      "Entrada grande costuma ser compra — e compra entra por Receber, contra o pedido.";
  }
  if (!motivoDeEntradaValido(motivo)) {
    return "Escolha de onde esta peça veio: chegou de fornecedor, foi produzida aqui, ou já estava na prateleira.";
  }
  return null;
}

/**
 * O novo saldo do item depois da entrada.
 *
 * Soma, nunca substitui — mesmo em "achei na prateleira". A tentação é tratar o
 * encontrado como contagem ("o estoque passa a ser N"), e é errado: duas pessoas
 * conferindo prateleiras diferentes do mesmo item, no mesmo dia, sobrescreveriam
 * uma à outra e o galpão perderia metade do que achou. Somar é associativo; a
 * contagem que zera e redefine mora no ajuste do catálogo, onde uma pessoa só
 * olha o número inteiro de uma vez.
 */
export function saldoDepoisDaEntrada(item: ItemDaEntrada, quantidade: number): number {
  const antes = Math.max(0, Number(item.quantidade) || 0);
  return antes + Math.max(0, Math.trunc(quantidade) || 0);
}

/** A frase que o totem mostra depois de gravar. Diz o que mudou, não "ok". */
export function fraseDaEntrada(item: ItemDaEntrada, quantidade: number, saldo: number): string {
  const un = item.unidade?.trim() || "un";
  return `+${quantidade} ${item.nome} · agora ${saldo} ${un}`;
}
