// ── Que item é este código? ──────────────────────────────────────────────────
//
// O galpão tem DOIS tipos de código colado em peça, e eles significam coisas
// diferentes:
//
//   SKU cru      "PRD-0001"          → a etiqueta de PRODUTO. Todas as almofadas
//                                      têm o mesmo. Responde "que produto é
//                                      este?", nunca "qual destes é?".
//   SKU + série  "PRD-0001-000042"   → a etiqueta de UNIDADE. Uma peça (ou uma
//                                      caixa lacrada) e só ela.
//
// Quem lê o código não sabe qual dos dois veio — a pistola e a câmera entregam
// texto. Este arquivo decide, e a ordem importa: SKU primeiro, porque é o caso
// que a entrada por bipagem existe pra atender.
//
// Morava dentro de app/api/estoque/device/entrada/route.ts. Saiu de lá quando a
// entrada passou a existir também na web (câmera do celular, pistola no
// computador): duas cópias desta função seriam duas regras divergindo no dia em
// que alguém ajustasse uma.

/** O Supabase não tem tipos gerados aqui; fronteira dinâmica isolada. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

import { partirCodigo } from "./estoque-unidades";

export interface ItemPorCodigo {
  id: string;
  nome: string;
  quantidade: number | null;
  unidade: string | null;
  serializado: boolean | null;
}

/** Como o código foi entendido — a tela usa pra explicar o que vai acontecer. */
export type LeituraDoCodigo =
  | { achou: true; item: ItemPorCodigo; via: "produto" | "unidade" }
  | { achou: false; motivo: "nao_existe" | "sku_duplicado" };

const COLUNAS = "id,nome,quantidade,unidade,serializado";

/**
 * Resolve o código lido, na ordem que o galpão usa.
 *
 * SKU DUPLICADO É RECUSA, não escolha. Dois itens com o mesmo SKU é cadastro
 * torto, e pegar um ao acaso põe peça no item errado — o pior desfecho, porque
 * o número fecha e ninguém procura. Recusar manda arrumar o cadastro.
 */
export async function itemPorCodigo(db: Db, codigo: string): Promise<LeituraDoCodigo> {
  const cru = String(codigo ?? "").trim();
  if (!cru) return { achou: false, motivo: "nao_existe" };

  // 1. Etiqueta de produto: o código É o SKU.
  const { data: porSku } = await db.from("estoque_itens").select(COLUNAS).ilike("sku", cru).limit(2);
  if (porSku?.length === 1) return { achou: true, item: porSku[0] as ItemPorCodigo, via: "produto" };
  if ((porSku?.length ?? 0) > 1) return { achou: false, motivo: "sku_duplicado" };

  // 2. Etiqueta de unidade: o item dela também serve pra IDENTIFICAR. Quem
  //    decide se a operação é permitida é a régua de cada caso — a entrada
  //    recusa item serializado com a frase que ensina o caminho certo.
  const partes = partirCodigo(cru);
  if (partes?.sku) {
    const { data } = await db.from("estoque_itens").select(COLUNAS).ilike("sku", partes.sku).limit(1);
    if (data?.length) return { achou: true, item: data[0] as ItemPorCodigo, via: "unidade" };
  }
  return { achou: false, motivo: "nao_existe" };
}

/** A frase de quando não achou. Diz o que fazer, não o que houve. */
export function fraseDaLeituraFalha(motivo: "nao_existe" | "sku_duplicado"): string {
  if (motivo === "sku_duplicado") {
    return "Dois itens do catálogo têm este mesmo SKU, então não dá pra saber em qual a peça entra. " +
      "Arrume o cadastro (Estoque › Catálogo) antes de bipar este código.";
  }
  return "Não achei nenhum item com este código. Se a etiqueta é de produto, confira o SKU na ficha do item; " +
    "se é de caixa lacrada, ela entra por Receber ou pela conferência.";
}
