// ── Geral do Comercial: os números são os da Tridify ─────────────────────────
// Comercial › Geral somava `preco_total` dos pedidos de quem tem "Lançar pedido"
// na grade — e admin passa nessa pergunta sozinho (`podeLancarPedido`), então
// Samuel e Gabriel Suzuki apareciam como vendedores e o faturamento deles
// entrava no do Comercial. Pior: era uma TERCEIRA conta do mesmo canal, que não
// batia com a Tridify nem com o Analytics (medido em set/26: ~R$ 100 mil de
// `preco_total` contra ~R$ 61 mil do livro).
//
// Agora a tela lê o que a Tridify lê (pedido do dono em 12/09/2026):
//   - faturamento, vendas e série diária → `snapshotVendas()`, o mesmo bloco do
//     card "Comercial" da Tridify, da TV e do Analytics;
//   - "Por vendedor" e produtos → o livro do comercial (`buildVendedorasSnapshot`),
//     a mesma base do ranking do Analytics, já sem X1 e sem `foraDoComercial`.

import type { Range } from "@/lib/period";
import { snapshotVendas } from "@/lib/trafego-vendas";
import { buildVendedorasSnapshot, foraDoComercial } from "@/lib/vendedoras";
import type { PedidoComercial, Responsavel, VendaPorVendedor, TopProduto } from "@/lib/comercial-pedidos";

export interface GeralComercial {
  periodLabel: string; faturamento: number; pedidos: number; ticket: number;
  perVendedor: VendaPorVendedor[]; topProdutos: TopProduto[]; serie: { day: string; value: number }[];
}

export async function geralDoComercial(r: Range): Promise<GeralComercial> {
  const [tri, vend] = await Promise.all([snapshotVendas(r.fromDate, r.toDate), buildVendedorasSnapshot(r)]);
  const doDia = new Map(tri.serieDia.map((x) => [x.d, x.comercial]));
  const faturamento = tri.comercialValor;
  const pedidos = tri.comercialPedidos;
  return {
    periodLabel: r.label,
    faturamento, pedidos, ticket: pedidos ? faturamento / pedidos : 0,
    perVendedor: vend.vendedoras.map((v) => ({ user_id: v.id, nome: v.nome, faturamento: v.liquido, pedidos: v.vendas, ticket: v.ticket })),
    topProdutos: vend.produtos.map((p) => ({ nome: p.nome, qtd: p.count, valor: p.valor })),
    // Dia sem venda vira zero, senão o gráfico "pula" o dia.
    serie: r.days.map((day) => ({ day, value: Math.round((doDia.get(day) ?? 0) * 100) / 100 })),
  };
}

/**
 * Tira de uma lista de pedidos do Comercial quem não é vendedor
 * (`foraDoComercial`): some da lista de responsáveis E os pedidos dele saem
 * junto. O responsável é a pessoa do app (quem tem "Lançar pedido" — todo
 * admin), então é pelo NOME dela que se pergunta.
 */
export function semForaDoComercial<T extends { pedidos: PedidoComercial[]; responsaveis: Responsavel[] }>(d: T): T {
  const fora = new Set(d.responsaveis.filter((r) => foraDoComercial(r.nome)).map((r) => r.user_id));
  if (!fora.size) return d;
  return {
    ...d,
    responsaveis: d.responsaveis.filter((r) => !fora.has(r.user_id)),
    pedidos: d.pedidos.filter((p) => !fora.has(p.responsavel_id)),
  };
}
