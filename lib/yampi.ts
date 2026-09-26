// ── Vendas da Yampi ──────────────────────────────────────────────────────────
// A Yampi é a outra plataforma de checkout do ERP (plataformas.id = 6). Mesmo
// espírito do card da Vega: pedidos REAIS do ERP, faturamento = o que o cliente
// fechou no checkout (`preco_yampi`), upsell da vendedora à parte.
//
// Duas diferenças em relação à Vega, e as duas importam:
//
// 1. A Yampi tem MAIS DE UMA LOJA na mesma plataforma (`pedidos.qual_yampi`):
//    hoje a loja de tráfego e a "Carimbos (Organico)". Somar tudo num número só
//    esconderia justamente a comparação que interessa, então o resumo devolve a
//    quebra por loja e aceita um filtro de loja.
// 2. A Yampi tem a trava de `valores_corretos`. Pedido com valor sujo entra em
//    total nenhum — é o mesmo critério do card "Faturamento total da empresa"
//    (lib/trafego-vendas.ts) e da tabela do Analytics. Sem ela, o card daqui
//    mostraria um faturamento que não bate com nenhum outro lugar do app.

import {
  pedidosDaPlataforma, pecasDosPedidos, montarResumo, dinheiro, fatia,
  type ResumoPlataforma, type PecaContada, type PedidoResumido, type PedidoPlataforma,
} from "@/lib/plataforma-vendas";

/** plataformas.id da Yampi no ERP. */
export const YAMPI_PLATAFORMA_ID = 6;

export type YampiPedido = PedidoResumido;
export type YampiPeca = PecaContada;

/** Uma loja da Yampi (pedidos.qual_yampi) e o que ela trouxe no período. */
export interface YampiLoja { loja: string; faturamento: number; pedidos: number }

export interface YampiResumo extends ResumoPlataforma {
  /** Loja filtrada ("" = todas), como veio no pedido. */
  loja: string;
  /** Quebra por loja no período — sempre TODAS as lojas, mesmo com filtro
   *  ativo, senão o seletor de loja nasceria com uma opção só. */
  lojas: YampiLoja[];
}

const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();

// Pedido que conta como venda da Yampi. Mesmo critério do resto do app:
// não excluído, valores conferidos e com valor. `created_at` é exigido porque
// a série diária depende dele.
const valido = (p: PedidoPlataforma) =>
  !p.excluido && !!p.created_at && p.valores_corretos === true && (Number(p.preco_total) || 0) > 0;

export async function yampiResumo(de: string, ate: string, loja = ""): Promise<YampiResumo> {
  const pedidos = (await pedidosDaPlataforma(YAMPI_PLATAFORMA_ID, de, ate)).filter(valido);

  // A quebra por loja usa TODOS os pedidos válidos do período — é ela que
  // alimenta o seletor, então não pode nascer já filtrada.
  const porLoja = new Map<string, YampiLoja>();
  for (const p of pedidos) {
    const nome = (p.qual_yampi || "").trim() || "Sem loja";
    const acc = porLoja.get(nome) ?? { loja: nome, faturamento: 0, pedidos: 0 };
    acc.faturamento += fatia(p).checkout;
    acc.pedidos++;
    porLoja.set(nome, acc);
  }
  const lojas = [...porLoja.values()]
    .map((l) => ({ ...l, faturamento: dinheiro(l.faturamento) }))
    .sort((a, b) => b.faturamento - a.faturamento);

  const alvo = norm(loja);
  const validos = alvo ? pedidos.filter((p) => norm(p.qual_yampi) === alvo) : pedidos;

  const { pecas, outros, itensPorPedido } = await pecasDosPedidos(
    validos.map((p) => ({ id: p.id, checkout: fatia(p).checkout })),
  );
  return { ...montarResumo(de, ate, validos, pecas, itensPorPedido, outros), loja, lojas };
}
