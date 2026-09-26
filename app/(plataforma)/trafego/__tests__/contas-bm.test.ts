import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { agruparPorBM } from "../ContasBM";

const conta = (id: string, bmId: string, bmNome: string, spend: number, purchases: number, revenue: number) => ({
  id, nome: `Conta ${id}`, bmId, bmNome,
  spend, purchases, revenue, leads: 0, clicks: 0, impressions: 0,
});

describe("agruparPorBM", () => {
  it("soma as contas de cada BM e ordena por gasto", () => {
    const g = agruparPorBM([
      conta("1", "bm-a", "BM A", 100, 2, 300),
      conta("2", "bm-b", "BM B", 500, 4, 400),
      conta("3", "bm-a", "BM A", 50, 1, 90),
    ]);
    expect(g.map((x) => x.id)).toEqual(["bm-b", "bm-a"]);
    const a = g.find((x) => x.id === "bm-a")!;
    expect(a.gasto).toBe(150);
    expect(a.vendas).toBe(3);
    expect(a.receita).toBe(390);
    // Custo real = fatura + imposto de importação; lucro e ROAS saem dele, não
    // da fatura crua — medir contra a fatura infla o retorno em ~14%.
    expect(a.custo).toBeCloseTo(150 * 1.1383, 6);
    expect(a.lucro).toBeCloseTo(390 - 150 * 1.1383, 6);
    expect(a.roas).toBeCloseTo(390 / (150 * 1.1383), 6);
    expect(a.contas.map((c) => c.id)).toEqual(["1", "3"]);
  });

  it("conta sem BM não some do agrupamento", () => {
    const g = agruparPorBM([conta("9", "sem-bm", "Sem BM", 10, 0, 0)]);
    expect(g).toHaveLength(1);
    expect(g[0].nome).toBe("Sem BM");
    expect(g[0].roas).toBeCloseTo(0, 6);
  });
});

// As rotas do Tráfego resolvem período por `period`/`from`/`to` (resolvePeriod).
// Widget que manda `de=`/`ate=` NÃO erra: cai calado no default "mes" e mostra o
// mês inteiro qualquer que seja o período escolhido em cima. Foi o que o card da
// Vega fazia — daí a trava.
describe("widgets do painel mandam o período que a rota lê", () => {
  const raiz = join(__dirname, "..");
  for (const arquivo of ["VegaView.tsx", "ContasBM.tsx"]) {
    it(`${arquivo} não usa de=/ate= na querystring`, () => {
      const src = readFileSync(join(raiz, arquivo), "utf8");
      const chamadas = src.match(/fetch\(`\/api\/[^`]*`/g) ?? [];
      expect(chamadas.length).toBeGreaterThan(0);
      for (const c of chamadas) {
        expect(c).not.toMatch(/[?&]de=/);
        expect(c).not.toMatch(/[?&]ate=/);
      }
      expect(src).toMatch(/period:\s*"custom"/);
    });
  }
});
