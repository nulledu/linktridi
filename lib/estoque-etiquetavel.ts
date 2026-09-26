// ── Este item pode virar etiqueta? ───────────────────────────────────────────
//
// O ciclo do galpão é: a pessoa bipa a caixa lacrada (sai do estoque), produz,
// conclui a atividade; o gerente confere e marca "certo"; nesse instante nasce
// UMA etiqueta nova — a caixa lacrada valendo as N peças que ela fez — e a
// caixa volta pra prateleira já com papel colado.
//
// Só que a conferência só cunha essa caixa quando o item tem `serializado`
// ligado. Nenhum item de produção tinha a flag, então todo "certo" caía no ramo
// que apenas soma peças em `estoque_itens.quantidade`: 3 conferências gravadas,
// nenhuma unidade, nenhuma impressão, `unidade_id` nulo.
//
// Ligar a flag em tudo, porém, quebra coisas que hoje funcionam:
//
//   (A) `estoque_itens.quantidade` é `numeric` — item a granel tem 1,5 kg.
//       `estoque_unidades.quantidade` é `int` com `check (> 0)`. Converter um
//       item fracionário TRUNCA e o saldo some em silêncio, pra sempre.
//   (B) transformar uma PILHA solta que já existe (191 peças) numa caixa única
//       de 191 cria um fantasma: a baixa é tudo-ou-nada ("a caixa sai inteira,
//       nunca uma fatia dela"), a guarda do banco passa a recusar digitar a
//       quantidade e não existe papel colado em nada pra bipar. Ninguém mais
//       mexe naquele saldo.
//
// Este módulo é a decisão — e SÓ a decisão. Puro: sem banco, sem permissão, sem
// efeito. Recebe as três colunas que importam e devolve o estado mais a frase
// que a pessoa vai ler na tela. Quem escreve (conferência, rota do tablet, tela
// de Conferir) consulta aqui antes de mexer em qualquer linha.

import {
  UNIDADES_COMPRA,
  normalizarUnidade,
  rotuloUnidade,
} from "@/lib/estoque-unidade-compra";

export type EstadoEtiqueta =
  /** Já tem papel colado: a conferência cunha a caixa e devolve a etiqueta. */
  | "ja_etiquetado"
  /** Sem saldo pra perder e unidade contável: dá pra ligar na hora (exige poder). */
  | "converter_agora"
  /** Pilha antiga com saldo: aprova como hoje, mas alguém precisa preparar o item. */
  | "precisa_preparo"
  /** Granel, fração ou unidade que ninguém conhece: nunca vira etiqueta. */
  | "nao_etiquetavel";

export interface ItemDianteDaEtiqueta {
  serializado: boolean;
  quantidade: number | null;
  unidade: string | null;
}

export interface DecisaoEtiqueta {
  estado: EstadoEtiqueta;
  /** Frase pronta pra tela: diz o que fazer, não o que houve. */
  motivo: string;
}

/**
 * Unidade que mede PESO, VOLUME ou COMPRIMENTO. Nenhuma delas cabe numa caixa
 * de `int > 0`: meio quilo é meio quilo, e 0,5 nunca vira etiqueta.
 *
 * O galão entra aqui porque o que se consome dele é o conteúdo (tinta, solvente),
 * não o vasilhame — a Tridi conta "quanto sobrou no galão", não "quantos galões
 * lacrados". Etiquetar galão exigiria decidir o que fazer com o meio galão
 * aberto, e essa decisão não é do código.
 */
const CODIGOS_GRANEL = new Set(["kg", "g", "L", "ml", "m", "m2", "galao"]);

/**
 * As duas listas saem do vocabulário REAL (`UNIDADES_COMPRA`), nunca de uma
 * cópia escrita à mão: unidade nova cadastrada lá aparece aqui no mesmo dia.
 * Só o que é granel está fixo — o resto é contável por eliminação.
 */
export const UNIDADES_GRANEL: string[] = UNIDADES_COMPRA
  .map((u) => u.codigo)
  .filter((c) => CODIGOS_GRANEL.has(c));

export const UNIDADES_CONTAVEIS: string[] = UNIDADES_COMPRA
  .map((u) => u.codigo)
  .filter((c) => !CODIGOS_GRANEL.has(c));

/**
 * Unidade que se conta em peças inteiras.
 *
 * - vazia/nula → `true`: `un` é o default da coluna no Postgres, e item sem
 *   unidade escolhida é peça avulsa;
 * - fora do vocabulário → `false`: "bombona" pode ser volume, "barra" pode ser
 *   comprimento. Na dúvida não se converte — o caminho é arrumar a unidade
 *   primeiro, e isso é decisão de gente.
 */
export function unidadeEhContavel(unidade: string | null | undefined): boolean {
  const codigo = normalizarUnidade(unidade);
  if (!codigo) return true;
  return UNIDADES_CONTAVEIS.includes(codigo);
}

/** Existe no vocabulário (ou é o vazio, que vira `un`)? */
function unidadeConhecidaOuPadrao(unidade: string | null | undefined): boolean {
  const codigo = normalizarUnidade(unidade);
  if (!codigo) return true;
  return UNIDADES_COMPRA.some((u) => u.codigo === codigo);
}

/** Número pra frase em português: 191 → "191", 2.5 → "2,5". */
function numero(n: number): string {
  const s = Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
  return s.replace(".", ",");
}

/** Nome por extenso da unidade, com plural: "quilos", "unidades". */
function nomeUnidade(unidade: string | null | undefined, qtd: number): string {
  const codigo = normalizarUnidade(unidade);
  if (!codigo) return rotuloUnidade("un", qtd).toLowerCase();
  return rotuloUnidade(codigo, qtd).toLowerCase();
}

/**
 * Em que pé este item está diante da etiqueta.
 *
 * A ordem das perguntas é a regra, e ela não é arbitrária:
 *
 *  1. `serializado` primeiro. Item que JÁ tem papel colado não converte nada —
 *     a caixa nasce da quantidade CONFERIDA, não do saldo da linha (que ali é
 *     mantido por gatilho, somando as etiquetas). Rebaixá-lo por causa de uma
 *     anomalia no saldo pararia a produção que funciona hoje.
 *  2. Depois a quantidade: fração, negativo e "não é número" são todos motivo
 *     pra não converter NUNCA, mesmo com unidade contável. É a armadilha (A):
 *     o truncamento não dá erro em lugar nenhum, ele só apaga saldo.
 *  3. Depois a unidade: granel e desconhecida também nunca convertem.
 *  4. Só então o saldo decide entre converter na hora (zero: não há o que
 *     perder) e pedir preparo (pilha antiga: armadilha (B)).
 *
 * `precisa_preparo` e `nao_etiquetavel` NÃO reprovam a conferência: a aprovação
 * segue somando em `quantidade`, como sempre fez. O que muda é que a resposta
 * passa a carregar a frase que diz o próximo passo, em vez de o item sumir do
 * mundo das etiquetas sem ninguém entender por quê.
 */
export function estadoDeEtiqueta(item: ItemDianteDaEtiqueta): DecisaoEtiqueta {
  const qtdBruta = item.quantidade == null ? 0 : Number(item.quantidade);
  const unidadeLegivel = nomeUnidade(item.unidade, 2);

  // 1) Já etiquetado — o caso normal do galpão.
  if (item.serializado) {
    return {
      estado: "ja_etiquetado",
      motivo: "Item etiquetado. Ao aprovar, o sistema gera a etiqueta da caixa lacrada com a quantidade conferida — é só colar e guardar na prateleira.",
    };
  }

  // 2) A quantidade impede a conversão?
  if (!Number.isFinite(qtdBruta)) {
    return {
      estado: "nao_etiquetavel",
      motivo: "A contagem deste item está ilegível no cadastro. Acerte o saldo em Estoque antes de tentar etiquetá-lo; por enquanto a aprovação só soma na contagem.",
    };
  }

  if (qtdBruta < 0) {
    return {
      estado: "nao_etiquetavel",
      motivo: `Este item está com saldo negativo (${numero(qtdBruta)}). Faça o acerto de contagem em Estoque primeiro — etiqueta só nasce de saldo que existe na prateleira.`,
    };
  }

  if (!Number.isInteger(qtdBruta)) {
    return {
      estado: "nao_etiquetavel",
      motivo: `Este item tem ${numero(qtdBruta)} ${unidadeLegivel} na contagem — quantidade quebrada não cabe numa etiqueta, que vale um número inteiro de peças. A aprovação soma na contagem, sem gerar papel.`,
    };
  }

  // 3) A unidade impede a conversão?
  if (!unidadeConhecidaOuPadrao(item.unidade)) {
    const escrita = normalizarUnidade(item.unidade);
    return {
      estado: "nao_etiquetavel",
      motivo: `A unidade "${escrita}" não está na lista do sistema, então não dá pra saber se este item se conta em peças ou se mede em peso/volume. Escolha a unidade certa na ficha do item pra ele poder ser etiquetado.`,
    };
  }

  if (!unidadeEhContavel(item.unidade)) {
    return {
      estado: "nao_etiquetavel",
      motivo: `Este item é medido em ${unidadeLegivel}, e isso não se conta em caixas fechadas. A aprovação soma na contagem do estoque, como sempre — etiqueta é só pra item que se conta em peças.`,
    };
  }

  // 4) Sobrou o saldo: zero converte na hora, pilha antiga pede preparo.
  if (qtdBruta === 0) {
    return {
      estado: "converter_agora",
      motivo: "Este item ainda não é etiquetado, mas está zerado no estoque — dá pra passar a etiquetá-lo agora mesmo, sem perder saldo nenhum. Ao aprovar, sai a etiqueta da caixa lacrada.",
    };
  }

  return {
    estado: "precisa_preparo",
    motivo: `Este item ainda tem ${numero(qtdBruta)} na contagem antiga. Prepare-o pra etiqueta antes, pra pilha da prateleira virar papel colado: escolha se a pilha inteira é uma caixa só ou se cada peça leva a sua etiqueta. Enquanto isso, a aprovação continua somando na contagem.`,
  };
}
