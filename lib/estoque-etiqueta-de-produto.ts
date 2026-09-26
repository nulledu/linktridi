// ── Etiqueta de PRODUTO: o mesmo código em todas as peças ───────────────────
//
// Existiam dois jeitos de contar no galpão, e o dono caiu no vão entre eles:
//
//   serializado → cada peça tem UM código (`ALM-000001`, `ALM-000002`…) e o
//                 estoque é a soma das etiquetas. Serve pra caixa lacrada, onde
//                 importa QUAL caixa saiu.
//   comum       → a quantidade é digitada e não existe etiqueta nenhuma.
//
// "Fui etiquetar almofada, e como todas elas são iguais eu achei melhor gerar
// as etiquetas com o mesmo código, só pra identificar o produto." É o terceiro
// caso, e ele não é uma variação do primeiro: a etiqueta aqui não representa
// UMA peça, representa O ITEM. Vinte almofadas com o mesmo código não são vinte
// unidades rastreadas — são vinte peças da mesma coisa, e o código responde
// "que produto é este?", não "qual destes é?".
//
// ── POR QUE ISTO NÃO CRIA UNIDADE ───────────────────────────────────────────
//
// Nenhuma linha de `estoque_unidades` nasce daqui, e é a decisão que mantém o
// resto de pé:
//
//  · `estoque_unidades.codigo` é ÚNICO. Vinte linhas com o mesmo código não
//    entram, e forçar isso derrubaria a bipagem de todo mundo.
//  · a baixa por bipagem casa uma etiqueta e a marca como saída. Com código
//    repetido ela não sabe qual marcar — e "marca qualquer uma" é estoque
//    errado que ninguém descobre.
//  · o gatilho recalcula a quantidade a partir das unidades. Uma unidade
//    inerte aqui só serviria pra desencontrar o número.
//
// Então a etiqueta de produto é PAPEL, não registro. O estoque continua sendo o
// número contado, que é como o galpão já trata a almofada.

import type { CampoEtiqueta } from "./estoque-etiqueta-config";

/** O mínimo que a régua precisa saber do item pra montar o papel. */
export interface ItemParaEtiqueta {
  nome: string;
  sku?: string | null;
  cor?: string | null;
  largura_mm?: number | null;
  altura_mm?: number | null;
  espessura_mm?: number | null;
  dim_unidade?: string | null;
  serializado?: boolean | null;
}

export interface EtiquetaDeProduto {
  codigo: string;
  nome: string;
  corDimensoes?: string;
  /** Sempre 1: a etiqueta é de UMA peça, não de caixa. Ver `SeloDeCaixa`. */
  quantidade: number;
  local: string;
  /**
   * Vazio por padrao, e nao nulo: `DadosEtiqueta` exige a string, e nesta
   * etiqueta a linha some de qualquer jeito (ver OCULTOS_NA_ETIQUETA_DE_PRODUTO)
   * — quem imprimiu um rolo nao e o dono de peca nenhuma.
   */
  responsavel: string;
  data: string;
  /**
   * Quando o PAPEL saiu — o mesmo campo da etiqueta de unidade, e aqui ele
   * some da tira (ver OCULTOS_NA_ETIQUETA_DE_PRODUTO). Continua no dado porque
   * `DadosEtiqueta` o exige, e porque quem imprimir uma leva com a data ligada
   * de propósito vai querer o carimbo certo, não uma string vazia.
   */
  impressoEm: string;
}

export class ErroSemSku extends Error {
  constructor() { super("sem_sku"); }
}
export class ErroItemSerializado extends Error {
  constructor() { super("item_serializado"); }
}

/** Teto de cópias por vez. Ver `problemaDaQuantidade`. */
export const MAX_COPIAS_DE_PRODUTO = 200;

/**
 * O que impede imprimir, em português, ou `null` quando pode.
 *
 * Separado de `etiquetasDeProduto` porque a tela precisa da frase ANTES de a
 * pessoa clicar — descobrir no clique que faltava SKU é descobrir tarde.
 */
export function problemaDaEtiquetaDeProduto(item: ItemParaEtiqueta, copias: number): string | null {
  if (item.serializado) {
    // Não é limitação técnica, é significado: num item serializado o código É a
    // peça, e repetir o mesmo em vinte etiquetas faria vinte peças passarem por
    // uma só na hora de bipar.
    return "Este item é contado por etiqueta, então cada peça já tem o código dela. " +
      "Etiqueta de produto (o mesmo código repetido) é pro item que se conta pelo número.";
  }
  if (!String(item.sku ?? "").trim()) {
    return "Este item ainda não tem SKU, e é ele que vira o código de barras. " +
      "Defina um na ficha do item — o gerador sugere um seguindo a sua convenção.";
  }
  if (!Number.isFinite(copias) || Math.trunc(copias) !== copias || copias < 1) {
    return "Diga quantas etiquetas iguais imprimir — um número inteiro, a partir de 1.";
  }
  if (copias > MAX_COPIAS_DE_PRODUTO) {
    // O teto é de papel, não de banco: 200 tiras já são ~3 metros de bobina
    // saindo de uma vez, e quem pediu 2000 por engano descobre com o rolo no
    // chão. Repetir a impressão é barato; desperdiçar rolo não.
    return `${copias} etiquetas de uma vez é demais (máximo ${MAX_COPIAS_DE_PRODUTO}). ` +
      "Imprima em levas — a etiqueta é a mesma, então dá pra continuar depois.";
  }
  return null;
}

/** "Branco · 40×15" — a mesma linha da etiqueta de unidade. */
export function corDimensoesDoItem(item: ItemParaEtiqueta): string | null {
  const u = item.dim_unidade || "mm";
  const dims = [item.largura_mm, item.altura_mm, item.espessura_mm]
    .filter((n) => typeof n === "number" && Number.isFinite(n) && n > 0) as number[];
  const medida = dims.length ? `${dims.join("×")}${u}` : null;
  const partes = [item.cor?.trim() || null, medida].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

/**
 * N etiquetas IGUAIS do produto — mesmo código em todas.
 *
 * O código é o SKU cru, sem sequencial. É o que faz vinte almofadas lerem
 * "Almofada 22" no leitor em vez de vinte códigos diferentes que ninguém
 * cadastrou.
 */
export function etiquetasDeProduto(
  item: ItemParaEtiqueta,
  copias: number,
  extras: { local?: string; responsavel?: string | null; data?: string } = {},
): EtiquetaDeProduto[] {
  if (item.serializado) throw new ErroItemSerializado();
  const codigo = String(item.sku ?? "").trim();
  if (!codigo) throw new ErroSemSku();
  const quantas = Math.min(MAX_COPIAS_DE_PRODUTO, Math.max(1, Math.trunc(copias) || 0));

  const molde: EtiquetaDeProduto = {
    codigo,
    nome: item.nome,
    corDimensoes: corDimensoesDoItem(item) ?? undefined,
    quantidade: 1,
    local: extras.local ?? "",
    responsavel: extras.responsavel ?? "",
    data: extras.data ?? new Date().toISOString(),
    impressoEm: extras.data ?? new Date().toISOString(),
  };
  // Cópias rasas do MESMO molde: são a mesma etiqueta, e é isso que o pedido
  // significa. Gerar variação por índice aqui seria reinventar o sequencial que
  // este arquivo existe pra não ter.
  return Array.from({ length: quantas }, () => ({ ...molde }));
}

/** Campos que não fazem sentido nesta etiqueta, e por quê. */
export const OCULTOS_NA_ETIQUETA_DE_PRODUTO: CampoEtiqueta[] = [
  // A data de impressão numa etiqueta de produto engana: ela não é a data da
  // peça (todas são iguais e entraram em dias diferentes), é a data em que
  // alguém mandou imprimir o rolo. Numa etiqueta de unidade ela é a única
  // testemunha de quando aquela caixa entrou; aqui não testemunha nada.
  "data_responsavel",
];
