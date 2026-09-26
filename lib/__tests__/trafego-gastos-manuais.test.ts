import { describe, expect, it } from "vitest";
import { lerValor, linhasPorBm } from "@/lib/trafego-gastos-conta";

describe("gastos manuais do widget Gasto + imposto", () => {
  it("lê valor em formato brasileiro e com ponto", () => {
    expect(lerValor("1.234,56")).toBe(1234.56);
    expect(lerValor("R$ 250,5")).toBe(250.5);
    expect(lerValor("99.9")).toBe(99.9);
    expect(lerValor("")).toBe(0);
    expect(lerValor("abc,")).toBeNaN();
  });

  it("quebra por BM soma meta reescalado + manual, e a soma bate com o total do card", () => {
    const taxa = 1.1383;
    const r = linhasPorBm({
      bms: [],
      // warehouse com metade do gasto: a fatia vale, o valor vem do card
      metaPorBm: [{ chave: "meta:1", nome: "BM 01", gasto: 300 }, { chave: "meta:2", nome: "BM 02", gasto: 200 }],
      gastos: [
        { id: "a", valor: 100, data: "2026-09-01", bmChave: "meta:2", bmNome: "BM 02", descricao: null },
        { id: "b", valor: 50, data: "2026-09-02", bmChave: "manual:x", bmNome: "BM 03", descricao: null },
      ],
    }, 1000, taxa);
    const por = Object.fromEntries(r.linhas.map((l) => [l.nome, l]));
    expect(por["BM 01"].meta).toBeCloseTo(600);
    expect(por["BM 02"].meta).toBeCloseTo(400);
    expect(por["BM 02"].manual).toBe(100);
    expect(por["BM 03"].total).toBeCloseTo(50 * taxa);
    expect(r.manualComImposto).toBeCloseTo(150 * taxa);
    expect(r.total).toBeCloseTo((1000 + 150) * taxa);
  });

  it("sem warehouse, o gasto do Meta vira uma linha só", () => {
    const r = linhasPorBm({ bms: [], metaPorBm: [], gastos: [] }, 500, 1.1);
    expect(r.linhas).toHaveLength(1);
    expect(r.total).toBeCloseTo(550);
  });
});
