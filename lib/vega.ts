// ── Vendas da Vega Checkout ──────────────────────────────────────────────────
// A Vega é uma das plataformas de venda do ERP (plataformas.id = 8). Tudo aqui
// sai do ERP legado — nada de pixel, nada de estimativa: são os pedidos que
// realmente entraram.
//
// O que a tela responde: quanto faturou, quantos pedidos, e quantas peças de
// cada tipo saíram por lá.
//
// A mecânica (paginação, brinde, fatia checkout/upsell, contagem de peças) mora
// em `lib/plataforma-vendas.ts`, compartilhada com a Yampi — as duas leem os
// mesmos pedidos do mesmo ERP, só mudando a plataforma e o filtro de validade.

import {
  pedidosDaPlataforma, pecasDosPedidos, montarResumo, fatia,
  type ResumoPlataforma, type PecaContada, type PedidoResumido,
} from "@/lib/plataforma-vendas";

/** plataformas.id da Vega Checkout no ERP. */
export const VEGA_PLATAFORMA_ID = 8;

export type VegaPedido = PedidoResumido;
export type VegaPeca = PecaContada;
export type VegaResumo = ResumoPlataforma;

export async function vegaResumo(de: string, ate: string): Promise<VegaResumo> {
  const pedidos = await pedidosDaPlataforma(VEGA_PLATAFORMA_ID, de, ate);
  // Pedido excluído não é venda — some de tudo (faturamento, contagem, peças).
  const validos = pedidos.filter((p) => !p.excluido && p.created_at);
  // O rateio do faturamento por peça precisa do checkout de cada pedido, não
  // só do id: é ele que se reparte entre os itens (ver `contarPecas`).
  const { pecas, outros, itensPorPedido } = await pecasDosPedidos(
    validos.map((p) => ({ id: p.id, checkout: fatia(p).checkout })),
  );
  return montarResumo(de, ate, validos, pecas, itensPorPedido, outros);
}
