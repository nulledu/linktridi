import { describe, expect, it } from "vitest";
import { comImposto, fatorImposto, snapshotSemImposto } from "../trafego-imposto";
import type { VendasSnapshot } from "../trafego-vendas";

describe("chave com/sem imposto da Tridify", () => {
  it("custo multiplica, ROAS divide, taxa e contagem ficam", () => {
    const d = { kpis: { spend: 100, cpa: 10, cpm: 20, cpc: 1, roas: 4, ctr: 3, purchases: 10 }, anuncios: [{ spend: 50, roas: 2 }] };
    const r = comImposto(d, 1.1);
    expect(r.kpis.spend).toBeCloseTo(110);
    expect(r.kpis.cpa).toBeCloseTo(11);
    expect(r.kpis.roas).toBeCloseTo(4 / 1.1);
    expect(r.kpis.ctr).toBe(3);
    expect(r.kpis.purchases).toBe(10);
    expect(r.anuncios[0].spend).toBeCloseTo(55);
    expect(d.kpis.spend).toBe(100); // não muta a origem
  });

  it("insight do criativo converte pelo nome da métrica", () => {
    const r = comImposto({ insights: [{ metric: "cpm", currentValue: 10, benchmarkValue: 20 }, { metric: "ctr", currentValue: 3, benchmarkValue: 2 }] }, 2);
    expect(r.insights[0]).toMatchObject({ currentValue: 20, benchmarkValue: 40 });
    expect(r.insights[1]).toMatchObject({ currentValue: 3, benchmarkValue: 2 });
  });

  it("snapshot sem imposto mede contra a fatura crua", () => {
    const v = { gasto: 100, gastoComImposto: 113.83, faturamentoTrafego: 500, faturamentoEmpresa: 800, pedidosTrafego: 5, metaRevenue: 400 } as VendasSnapshot;
    expect(fatorImposto(v)).toBeCloseTo(1.1383);
    const s = snapshotSemImposto(v);
    expect(s.roas).toBe(5);
    expect(s.lucro).toBe(400);
    expect(s.cpaTrafego).toBe(20);
    expect(s.mer).toBe(8);
  });
});
