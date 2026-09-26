// ── Os dois tipos de etiqueta ────────────────────────────────────────────────
//
// Uma chapa é uma peça. Uma caixa de chancelas é um lacre com N peças dentro, e
// quem a pega na prateleira não tem como contar sem romper o lacre — se o
// número não estiver impresso, ele não existe.
//
// Isso JÁ acontecia, mas POR ACIDENTE: o selo era desenhado quando
// `quantidade > 1` e só por isso. Duas consequências erradas caíam daí:
//
//  · uma caixa de chancelas com UMA chancela dentro saía sem selo — e ela
//    continua sendo uma caixa. Quem vê a etiqueta pelada assume peça avulsa,
//    abre o lacre pra conferir, e o lacre existia justamente pra não ser
//    aberto;
//  · ninguém conseguia DIZER que uma chapa nunca é caixa. Se um dia uma
//    geração errada criasse uma etiqueta de chapa valendo 4, o selo apareceria
//    como se aquilo fosse normal.
//
// Aqui o tipo deixa de ser consequência de um número e vira ESCOLHA, gravada
// no ITEM (`estoque_itens.etiqueta_tipo`).
//
// POR QUE NO ITEM, e não na etiqueta. "Isto é vendido/manuseado em caixa" é uma
// verdade do produto, não da tira de papel: a chancela vem em caixa hoje, veio
// no mês passado e virá no ano que vem. Gravar na unidade obrigaria quem gera
// etiqueta a responder a mesma pergunta toda vez — e ela seria respondida
// errado no dia de pressa, que é o dia em que mais se etiqueta. No item ela é
// respondida UMA vez, por quem cadastra.
//
// O PADRÃO É "unica", e isso é o que dispensa preencher os 192 itens à mão:
// `unica` reproduz exatamente o comportamento de hoje (selo só quando passa de
// 1), então item nenhum muda de aparência enquanto ninguém tocar em nada. O
// trabalho manual fica limitado ao punhado de itens que de fato vêm em caixa.

import { pecasDaUnidade, type UnidadeComQuantidade } from "./estoque-unidades";

/**
 * `unica` — a peça avulsa (chapa, folha, perfil). Não escreve "1 un".
 * `caixa`  — o lacre/conjunto (caixa de chancelas, pacote de parafusos).
 *            Escreve quantas peças tem dentro, SEMPRE, inclusive quando é 1.
 */
export type TipoEtiqueta = "unica" | "caixa";

export const TIPO_ETIQUETA_PADRAO: TipoEtiqueta = "unica";

export interface DefTipoEtiqueta {
  key: TipoEtiqueta;
  label: string;
  /** Como a etiqueta se comporta — é o que a tela mostra embaixo da opção. */
  efeito: string;
  exemplo: string;
  /** Ícone Tabler; precisa existir no mapa de app/(plataforma)/Icon.tsx. */
  icone: string;
}

export const TIPOS_ETIQUETA: DefTipoEtiqueta[] = [
  {
    key: "unica",
    label: "Peça única",
    efeito: "Não escreve quantidade. Uma etiqueta, uma peça.",
    exemplo: "Chapa, folha, perfil",
    icone: "square",
  },
  {
    key: "caixa",
    // "Caixa" e não "Caixa ou conjunto": os dois rótulos precisam caber lado a
    // lado numa tela de 320px sem virar rolagem lateral, e um rótulo que a
    // pessoa tem de arrastar pra ler não é um rótulo. Que vale pra pacote e
    // conjunto também está no `efeito`, logo abaixo.
    label: "Caixa",
    efeito: "Escreve quantas peças tem dentro — mesmo quando tem só uma. Vale pra caixa, pacote ou conjunto.",
    exemplo: "Caixa de chancelas, pacote de parafusos",
    icone: "box",
  },
];

/**
 * Lê o tipo de onde quer que ele venha (coluna do banco, corpo de requisição,
 * prop de componente) e devolve sempre um dos dois. Nulo, ausente, lixo e
 * valor de uma versão futura caem no padrão — nunca em `undefined`.
 *
 * Cair no padrão é seguro por construção: `unica` é o comportamento de hoje, e
 * `mostraContagem` abaixo garante que ele NUNCA esconde uma quantidade real.
 */
export function tipoDeEtiqueta(valor: unknown): TipoEtiqueta {
  return valor === "caixa" ? "caixa" : TIPO_ETIQUETA_PADRAO;
}

/** O tipo gravado no item do catálogo. */
export function tipoDoItem(item: { etiqueta_tipo?: string | null } | null | undefined): TipoEtiqueta {
  return tipoDeEtiqueta(item?.etiqueta_tipo);
}

export function defDoTipo(tipo: TipoEtiqueta): DefTipoEtiqueta {
  return TIPOS_ETIQUETA.find((t) => t.key === tipo) ?? TIPOS_ETIQUETA[0];
}

export interface EtiquetaComTipo extends UnidadeComQuantidade {
  tipo?: TipoEtiqueta | null;
}

/**
 * A etiqueta escreve quantas peças vale?
 *
 * `caixa` escreve sempre. `unica` escreve QUANDO HÁ MAIS DE UMA — e essa
 * segunda metade não é descuido, é trava:
 *
 * "peça única" quer dizer "não invente um '1 un' que ninguém precisa ler", e
 * NÃO "esconda o número". Se uma etiqueta de chapa vier valendo 4, quem está
 * de frente pra prateleira precisa saber disso; suprimir o número deixaria a
 * pilha com 4 peças e o papel dizendo nada, e alguém contaria estoque em cima
 * do papel. Informação que existe na prateleira e não existe no papel é como
 * inventário fecha errado.
 *
 * Ou seja: o tipo decide o que acontece no caso `quantidade === 1`. Nos outros
 * ele não tem voto.
 */
export function mostraContagem(etiqueta: EtiquetaComTipo): boolean {
  if (tipoDeEtiqueta(etiqueta?.tipo) === "caixa") return true;
  return pecasDaUnidade(etiqueta) > 1;
}
