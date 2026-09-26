import { describe, it, expect } from "vitest";
import { agruparSaidaPorItem } from "@/lib/estoque-saida-resumo";
import type { ResultadoBaixaCodigo } from "@/lib/estoque-baixa";

// O resumo é o que a tela do galpão lê depois de bipar. Errar aqui não estraga
// um pixel: faz a pessoa acreditar que saiu material que não saiu (ou o
// contrário) e ir embora sem conferir.

const linha = (codigo: string, situacao: ResultadoBaixaCodigo["situacao"], pecas: number): ResultadoBaixaCodigo =>
  ({ codigo, situacao, item: null, pecas });

const catalogo = new Map([
  ["i1", { nome: "Chapa MDF 6 mm", quantidade: 320, unidade: "un" }],
  ["i2", { nome: "Cola branca", quantidade: 12.5, unidade: "L" }],
]);

describe("agruparSaidaPorItem", () => {
  it("soma as caixas do mesmo item numa linha só", () => {
    const mapa = new Map([["A-1", "i1"], ["A-2", "i1"], ["A-3", "i1"]]);
    const r = agruparSaidaPorItem(
      [linha("A-1", "baixada", 50), linha("A-2", "baixada", 50), linha("A-3", "baixada", 1)],
      mapa,
      catalogo,
    );
    expect(r).toEqual([{ item: "Chapa MDF 6 mm", pecas: 101, saldo: 320, unidade: "un" }]);
  });

  it("o que NÃO saiu fica de fora do total", () => {
    // Esta é a regra cara: contar `ja_baixada` faria a tela anunciar 100 peças
    // saindo quando só 50 saíram — e ninguém confere isso de novo.
    const mapa = new Map([["A-1", "i1"], ["A-2", "i1"], ["A-3", "i1"]]);
    const r = agruparSaidaPorItem(
      [linha("A-1", "baixada", 50), linha("A-2", "ja_baixada", 0), linha("A-3", "desconhecida", 0)],
      mapa,
      catalogo,
    );
    expect(r).toEqual([{ item: "Chapa MDF 6 mm", pecas: 50, saldo: 320, unidade: "un" }]);
  });

  it("guarda a ordem em que a pessoa bipou, não a alfabética", () => {
    const mapa = new Map([["B-1", "i2"], ["A-1", "i1"]]);
    const r = agruparSaidaPorItem([linha("B-1", "baixada", 2), linha("A-1", "baixada", 1)], mapa, catalogo);
    expect(r.map((x) => x.item)).toEqual(["Cola branca", "Chapa MDF 6 mm"]);
  });

  it("saldo fracionário sobrevive — granel não é peça", () => {
    const r = agruparSaidaPorItem([linha("B-1", "baixada", 1)], new Map([["B-1", "i2"]]), catalogo);
    expect(r[0]).toEqual({ item: "Cola branca", pecas: 1, saldo: 12.5, unidade: "L" });
  });

  it("item que o banco não devolveu não vira linha sem nome", () => {
    // Uma linha "— 1 peça · restam 0" se lê como item zerado. Sumir é honesto;
    // mentir zero não é.
    const r = agruparSaidaPorItem([linha("Z-1", "baixada", 1)], new Map([["Z-1", "sumiu"]]), catalogo);
    expect(r).toEqual([]);
  });

  it("código sem unidade conhecida não entra", () => {
    const r = agruparSaidaPorItem([linha("Z-9", "baixada", 1)], new Map(), catalogo);
    expect(r).toEqual([]);
  });

  it("peças ausentes ou zeradas valem 1 — servidor antigo não zera a saída", () => {
    const semPecas = { codigo: "A-1", situacao: "baixada", item: null } as unknown as ResultadoBaixaCodigo;
    const r = agruparSaidaPorItem([semPecas], new Map([["A-1", "i1"]]), catalogo);
    expect(r[0].pecas).toBe(1);
  });

  it("saldo negativo satura em zero", () => {
    const bagunca = new Map([["x", { nome: "Item torto", quantidade: -3, unidade: "un" }]]);
    const r = agruparSaidaPorItem([linha("A-1", "baixada", 1)], new Map([["A-1", "x"]]), bagunca);
    expect(r[0].saldo).toBe(0);
  });
});
