import type { ArvoreLocal } from "@/lib/meta-warehouse";

/**
 * A árvore local só serve se o gasto de CADA conta bate com o insight ao vivo
 * dela (mesmo período). O armazém tem buraco — dia que o sync não trouxe, o
 * "hoje" ainda não gravado — e somar o que existe dá anúncio com metade do
 * investido e das compras. Folga de 1% (ou R$ 1) pra arredondamento da Meta.
 *
 * COMPRAS também precisam bater, exatas: a Meta atribui compra ao dia do
 * clique até 7 dias depois, então o gasto de um dia já gravado continua certo
 * e as compras dele ficam velhas. Medido 12/09/2026 em 7 dias: armazém com 73
 * compras, Meta com 225.
 */
export function arvoreBateComContas(arvore: ArvoreLocal, contas: Array<{ accountId: string; spend: number; purchases: number }>): boolean {
  const local = new Map<string, { spend: number; purchases: number }>();
  for (const c of arvore.campanhas) {
    const id = c.accountId.replace(/^act_/, "");
    const e = local.get(id) ?? { spend: 0, purchases: 0 };
    e.spend += c.spend; e.purchases += c.purchases;
    local.set(id, e);
  }
  for (const c of contas) {
    const l = local.get(c.accountId.replace(/^act_/, "")) ?? { spend: 0, purchases: 0 };
    if (Math.abs(l.spend - c.spend) > Math.max(1, c.spend * 0.01)) return false;
    if (Math.round(l.purchases) !== Math.round(c.purchases)) return false;
  }
  return true;
}
