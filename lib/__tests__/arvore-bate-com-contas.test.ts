import { describe, expect, it } from "vitest";
import { arvoreBateComContas } from "@/lib/meta-arvore-cobertura";
import type { ArvoreLocal } from "@/lib/meta-warehouse";

const camp = (accountId: string, spend: number, purchases = 0) => ({
  accountId, id: `${accountId}-${spend}`, name: "c", spend, impressions: 0, clicks: 0, reach: 0,
  purchases, revenue: 0, leads: 0, lpv: 0, addCart: 0, checkout: 0, spark: [],
});
const arvore = (...c: ReturnType<typeof camp>[]): ArvoreLocal => ({ campanhas: c, conjuntos: [], anuncios: [] });

describe("arvoreBateComContas", () => {
  it("aceita quando gasto e compras de cada conta batem com o insight ao vivo", () => {
    expect(arvoreBateComContas(arvore(camp("1", 600, 3), camp("1", 400, 2), camp("2", 50)), [
      { accountId: "act_1", spend: 1000.4, purchases: 5 }, { accountId: "2", spend: 50, purchases: 0 },
    ])).toBe(true);
  });

  it("recusa armazém com dia faltando (gasto menor que o da conta)", () => {
    expect(arvoreBateComContas(arvore(camp("1", 520, 5)), [{ accountId: "1", spend: 1000, purchases: 5 }])).toBe(false);
  });

  it("recusa quando uma conta com gasto nem aparece no armazém", () => {
    expect(arvoreBateComContas(arvore(camp("1", 1000)), [
      { accountId: "1", spend: 1000, purchases: 0 }, { accountId: "3", spend: 200, purchases: 0 },
    ])).toBe(false);
  });

  it("recusa gasto igual com compras velhas (Meta atribuiu mais depois do sync)", () => {
    expect(arvoreBateComContas(arvore(camp("1", 1000, 73)), [{ accountId: "1", spend: 1000, purchases: 225 }])).toBe(false);
  });
});
