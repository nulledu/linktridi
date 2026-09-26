import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { vendaDeMarketplace } from "@/lib/marketing-config";
import { noPeriodo } from "@/lib/dia-do-pedido";

// ── Agosto/2026 do Mercado Livre, medido contra o painel do próprio ML ───────
//
// O painel do ML (conta TridiXP) fechou agosto em **R$ 1.074 · 23 vendas**.
// O ERP mostrava **R$ 1.621,97 · 24 pedidos** — 51% a mais. A diferença tinha
// duas causas, e esta fixture é o mês inteiro, pedido a pedido, para provar
// que as duas juntas fecham a conta:
//
// 1. `preco_total` é a NOTA (produto + frete). O painel reporta o PRODUTO.
//    R$ 508,77 de agosto eram frete de correio.
// 2. O pedido 2000018225917596 tem `created_at` = 2026-09-01T00:00:00+00:00 —
//    DATA sem hora. Lida como instante, vira 31/08 às 21h em São Paulo e cai
//    dentro de agosto.
//
// Se alguém voltar a somar a nota, ou voltar a ler data-sem-hora como
// instante, este teste diz exatamente qual das duas quebrou.
const AGOSTO_ML: { num: string; criadoEm: string; total: number; frete: number }[] = [
  { num: "2000017711061448", criadoEm: "2026-08-02T13:11:02.000000+00:00", total: 46.89, frete: 6.99 },
  { num: "2000014332496449", criadoEm: "2026-08-03T00:00:00+00:00", total: 97.79, frete: 17.99 },
  { num: "2000014336029903", criadoEm: "2026-08-03T00:00:00+00:00", total: 55.89, frete: 15.99 },
  { num: "2000017759028398", criadoEm: "2026-08-04T16:02:11.000000+00:00", total: 46.89, frete: 6.99 },
  { num: "2000017750493106", criadoEm: "2026-08-04T11:40:55.000000+00:00", total: 102.89, frete: 62.99 },
  { num: "2000014382028527", criadoEm: "2026-08-05T00:00:00+00:00", total: 46.89, frete: 6.99 },
  { num: "2000014402352869", criadoEm: "2026-08-06T00:00:00+00:00", total: 55.89, frete: 15.99 },
  { num: "2000014389527719", criadoEm: "2026-08-06T00:00:00+00:00", total: 157.69, frete: 37.99 },
  { num: "2000017869599844", criadoEm: "2026-08-10T18:22:40.000000+00:00", total: 79.89, frete: 39.99 },
  { num: "2000017911403806", criadoEm: "2026-08-13T11:05:19.000000+00:00", total: 49.89, frete: 9.99 },
  { num: "2000017910309976", criadoEm: "2026-08-13T10:31:02.000000+00:00", total: 46.89, frete: 6.99 },
  { num: "2000014526305789", criadoEm: "2026-08-14T00:00:00+00:00", total: 75.80, frete: 0 },
  { num: "2000014536655085", criadoEm: "2026-08-14T00:00:00+00:00", total: 49.89, frete: 9.99 },
  { num: "2000017947420266", criadoEm: "2026-08-15T14:47:33.000000+00:00", total: 46.89, frete: 6.99 },
  { num: "2000017948575164", criadoEm: "2026-08-15T16:20:08.000000+00:00", total: 46.89, frete: 6.99 },
  { num: "2000018017795750", criadoEm: "2026-08-19T11:55:41.000000+00:00", total: 46.89, frete: 6.99 },
  { num: "2000018038117944", criadoEm: "2026-08-20T17:31:22.000000+00:00", total: 55.89, frete: 15.99 },
  { num: "2000014622476685", criadoEm: "2026-08-20T00:00:00+00:00", total: 46.89, frete: 6.99 },
  { num: "2000018048729416", criadoEm: "2026-08-21T12:09:57.000000+00:00", total: 49.89, frete: 9.99 },
  { num: "2000018097501370", criadoEm: "2026-08-24T18:44:03.000000+00:00", total: 79.89, frete: 39.99 },
  { num: "2000018131082378", criadoEm: "2026-08-26T11:20:36.000000+00:00", total: 105.89, frete: 65.99 },
  { num: "2000014762953911", criadoEm: "2026-08-29T00:00:00+00:00", total: 69.89, frete: 29.99 },
  { num: "2000018186385782", criadoEm: "2026-08-30T14:03:18.000000+00:00", total: 79.89, frete: 39.99 },
  // O pedido que o fuso roubava de setembro:
  { num: "2000018225917596", criadoEm: "2026-09-01T00:00:00+00:00", total: 79.89, frete: 39.99 },
];

const DE = "2026-08-01", ATE = "2026-08-31";
const cent = (n: number) => Math.round(n * 100) / 100;

describe("agosto/2026 do Mercado Livre bate com o painel do ML", () => {
  const doMes = AGOSTO_ML.filter((p) => noPeriodo(p.criadoEm, DE, ATE));

  it("o mês tem 23 pedidos, não 24", () => {
    expect(AGOSTO_ML.length, "a fixture é o que o ERP devolvia").toBe(24);
    expect(doMes.length).toBe(23);
    expect(doMes.some((p) => p.num === "2000018225917596"), "o pedido de 1º/set não é de agosto").toBe(false);
  });

  it("o total é a VENDA (R$ 1.073,30), não a nota (R$ 1.621,97)", () => {
    const nota = cent(doMes.reduce((s, p) => s + p.total, 0));
    const venda = cent(doMes.reduce((s, p) => s + vendaDeMarketplace(p.total, p.frete), 0));
    expect(nota).toBe(1542.08);
    expect(venda).toBe(1073.30);
    // O painel do ML mostra R$ 1.074 (ele arredonda). Setenta centavos.
    expect(Math.abs(venda - 1074)).toBeLessThan(1);
  });

  it("contando a nota inteira e o mês errado, dá o número velho", () => {
    // A prova de que a fixture é o caso real, e não uma que eu escolhi para
    // passar: as DUAS causas juntas reproduzem exatamente o que a tela mostrava.
    const errado = cent(AGOSTO_ML.reduce((s, p) => s + p.total, 0));
    expect(errado).toBe(1621.97);
  });
});

describe("a regra do valor de venda", () => {
  it("desconta o frete e nunca fica negativa", () => {
    expect(vendaDeMarketplace(79.89, 39.99)).toBe(39.90);
    expect(vendaDeMarketplace(75.80, 0)).toBe(75.80);
    expect(vendaDeMarketplace(10, 30)).toBe(0);
    expect(vendaDeMarketplace(null, null)).toBe(0);
    expect(vendaDeMarketplace("46.89", "6.99")).toBeCloseTo(39.90, 2);
  });

  it("os dois lugares que somam marketplace usam a MESMA função", () => {
    // Duas cópias da mesma conta divergem — foi assim que a rampa de cor mudou
    // sozinha depois do paint. O total (snapshot) e a lista pedido a pedido
    // (comercial-pedidos) têm que dar o mesmo número, então nenhum dos dois
    // pode escrever a subtração na mão.
    for (const arquivo of ["lib/trafego-vendas.ts", "lib/comercial-pedidos.ts"]) {
      const src = readFileSync(arquivo, "utf8");
      expect(src, `${arquivo} deixou de usar vendaDeMarketplace`).toContain("vendaDeMarketplace(");
      expect(src, `${arquivo} voltou a subtrair o frete na mão`)
        .not.toMatch(/-\s*\(Number\(p\.preco_frete_venda\)\s*\|\|\s*0\)/);
    }
  });
});
