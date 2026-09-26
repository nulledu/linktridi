import { describe, expect, it } from "vitest";
import { movimentoPorHora, horaDePico, produtosMenosVendidos, dividaPorFuncionario } from "../tridimarket/dashboard";

describe("movimentoPorHora", () => {
  it("sempre devolve as 24 horas, mesmo sem venda", () => {
    const h = movimentoPorHora([]);
    expect(h).toHaveLength(24);
    expect(h.every((x) => x.compras === 0)).toBe(true);
    expect(h.map((x) => x.hora)).toEqual([...Array(24).keys()]);
  });

  it("converte UTC para o fuso de SP (UTC-3)", () => {
    // 15:30 UTC = 12:30 em SP
    const h = movimentoPorHora([{ at: "2026-07-24T15:30:00Z", revenue: 10 }]);
    expect(h[12].compras).toBe(1);
    expect(h[12].receita).toBe(10);
    expect(h[15].compras).toBe(0);
  });

  it("vira o dia corretamente (01:00 UTC = 22h do dia anterior em SP)", () => {
    const h = movimentoPorHora([{ at: "2026-07-24T01:00:00Z" }]);
    expect(h[22].compras).toBe(1);
  });

  it("ignora data invalida sem quebrar", () => {
    const h = movimentoPorHora([{ at: "nao-e-data" }, { at: "2026-07-24T15:00:00Z" }]);
    expect(h.reduce((s, x) => s + x.compras, 0)).toBe(1);
  });

  it("horaDePico pega a de maior movimento e null quando vazio", () => {
    expect(horaDePico(movimentoPorHora([]))).toBeNull();
    const h = movimentoPorHora([
      { at: "2026-07-24T15:00:00Z" }, { at: "2026-07-24T15:10:00Z" }, { at: "2026-07-24T18:00:00Z" },
    ]);
    expect(horaDePico(h)?.hora).toBe(12);   // 15h UTC → 12h SP, com 2 compras
  });
});

describe("produtosMenosVendidos", () => {
  const produtos = [
    { id: 1, name: "Café", active: true },
    { id: 2, name: "Barra", active: true },
    { id: 3, name: "Suco", active: true },
    { id: 9, name: "Descontinuado", active: false },
  ];
  const vendidos = new Map([
    [1, { units: 30, revenue: 300 }],
    [2, { units: 2, revenue: 20 }],
  ]);

  it("inclui produto com ZERO venda — e ele vem primeiro", () => {
    const r = produtosMenosVendidos(produtos, vendidos);
    expect(r[0].id).toBe(3);
    expect(r[0].units).toBe(0);
    expect(r[0].semVenda).toBe(true);
  });

  it("ordena do menos vendido pro mais vendido", () => {
    expect(produtosMenosVendidos(produtos, vendidos).map((p) => p.id)).toEqual([3, 2, 1]);
  });

  it("nao lista produto inativo", () => {
    expect(produtosMenosVendidos(produtos, vendidos).some((p) => p.id === 9)).toBe(false);
  });

  it("respeita o limite", () => {
    expect(produtosMenosVendidos(produtos, vendidos, 2)).toHaveLength(2);
  });
});

describe("dividaPorFuncionario", () => {
  it("ordena por divida e calcula a fatia do total", () => {
    const r = dividaPorFuncionario([
      { key: "a", name: "Ana", open: 30 },
      { key: "b", name: "Bia", open: 70 },
    ]);
    expect(r.map((p) => p.name)).toEqual(["Bia", "Ana"]);
    expect(r[0].share).toBeCloseTo(0.7);
    expect(r[1].share).toBeCloseTo(0.3);
  });

  it("ignora quem esta zerado ou com credito", () => {
    const r = dividaPorFuncionario([
      { key: "a", name: "Ana", open: 0 },
      { key: "b", name: "Bia", open: -15 },   // credito, nao divida
      { key: "c", name: "Cau", open: 5 },
    ]);
    expect(r.map((p) => p.name)).toEqual(["Cau"]);
    expect(r[0].share).toBe(1);
  });

  it("credito NAO entra no total (a fatia dos outros nao infla)", () => {
    const r = dividaPorFuncionario([
      { key: "a", name: "Ana", open: 50 },
      { key: "b", name: "Bia", open: -1000 },
      { key: "c", name: "Cau", open: 50 },
    ]);
    expect(r.every((p) => p.share === 0.5)).toBe(true);
  });

  it("lista vazia nao divide por zero", () => {
    expect(dividaPorFuncionario([])).toEqual([]);
  });
});
