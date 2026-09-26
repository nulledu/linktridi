import { describe, expect, it } from "vitest";
import { preverFaturamento, montarPrevisaoCompleta, ratearUpsell, indicesSemana, fracaoAte, somaDiasISO, diaDaSemana, type DiaValor } from "../previsao-faturamento";

// Série sintética: 10 mil nos dias úteis, 4 mil no sábado, 2 mil no domingo.
const PESO = [2000, 10000, 10000, 10000, 10000, 10000, 4000];
function serie(ate: string, dias: number, ruido = 0): DiaValor[] {
  const out: DiaValor[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = somaDiasISO(ate, -i);
    out.push({ d, v: PESO[diaDaSemana(d)] * (1 + (i % 2 ? ruido : -ruido)) });
  }
  return out;
}
const PLANO = { util: Array(24).fill(1), fimDeSemana: Array(24).fill(1) };

describe("previsão de faturamento", () => {
  it("índice semanal reflete o peso de cada dia", () => {
    const idx = indicesSemana(serie("2026-09-23", 56));
    expect(idx[1]).toBeGreaterThan(idx[6]);
    expect(idx[6]).toBeGreaterThan(idx[0]);
    expect(idx.reduce((a, b) => a + b, 0) / 7).toBeCloseTo(1, 5);
  });

  it("fração acumulada do perfil horário", () => {
    expect(fracaoAte(PLANO.util, 12)).toBeCloseTo(0.5);
    expect(fracaoAte(PLANO.util, 0)).toBe(0);
    expect(fracaoAte(PLANO.util, 24)).toBe(1);
  });

  it("série estável prevê o dia típico e o mês soma realizado + futuro", () => {
    // 24/09/2026 é quinta.
    const p = preverFaturamento({ serie: serie("2026-09-23", 84), hoje: "2026-09-24", realizadoHoje: 0, hora: 0, perfil: PLANO });
    expect(p.dia.previsto).toBeGreaterThan(9000);
    expect(p.dia.previsto).toBeLessThan(11000);
    expect(p.proximos[1].previsto).toBeLessThan(p.proximos[0].previsto); // sábado < sexta
    expect(p.semana.de).toBe("2026-09-21");
    expect(p.semana.ate).toBe("2026-09-27");
    expect(p.mes.diasRestantes).toBe(6);
    expect(p.mes.previsto).toBeGreaterThan(p.mes.realizado);
    expect(p.mes.min).toBeLessThanOrEqual(p.mes.previsto);
    expect(p.mes.max).toBeGreaterThanOrEqual(p.mes.previsto);
  });

  it("dia acima do ritmo puxa a previsão de hoje pra cima, e nunca abaixo do realizado", () => {
    const base = { serie: serie("2026-09-23", 84, 0.05), hoje: "2026-09-24", hora: 12, perfil: PLANO };
    const normal = preverFaturamento({ ...base, realizadoHoje: 5000 });
    const forte = preverFaturamento({ ...base, realizadoHoje: 9000 });
    expect(forte.dia.previsto).toBeGreaterThan(normal.dia.previsto);
    expect(forte.dia.ritmo!).toBeGreaterThan(1.5);
    expect(forte.dia.min).toBeGreaterThanOrEqual(9000);
    expect(normal.mape).not.toBeNull();
  });

  it("curva horária escala pro realizado do dia", () => {
    const porHora = Array(24).fill(0); porHora[9] = 100; porHora[10] = 100;
    const p = preverFaturamento({ serie: serie("2026-09-23", 84), hoje: "2026-09-24", realizadoHoje: 4000, hojePorHora: porHora, hora: 11.5, perfil: PLANO });
    expect(p.horas[11].realizado).toBe(4000);
    expect(p.horas[12].realizado).toBeNull();
    expect(p.horas[23].esperado).toBeCloseTo(p.dia.previsto, -1);
  });

  it("gasto + imposto vira % do faturamento em cada horizonte", () => {
    const base = { hoje: "2026-09-24", hora: 0, perfil: PLANO };
    const fat = preverFaturamento({ ...base, serie: serie("2026-09-23", 84), realizadoHoje: 0 });
    const gasto = preverFaturamento({ ...base, serie: serie("2026-09-23", 84).map((x) => ({ d: x.d, v: x.v * 0.2 })), realizadoHoje: 0 });
    const c = montarPrevisaoCompleta(fat, gasto, 1.1383, { fTP: 1, fTotal: 1, gTP: 1, realizado: { fTP: 1, fTotal: 1, gTP: 1 } });
    expect(c.pct.mes).toBeCloseTo(22.8, 0);
    expect(c.pct.dia).toBeCloseTo(22.8, 0);
  });

  it("série esparsa (produto que vende 1 por dia às vezes) não explode", () => {
    // ~0,4 unidade/dia, espalhadas sem padrão de dia da semana.
    const esparsa: DiaValor[] = Array.from({ length: 84 }, (_, i) => ({ d: somaDiasISO("2026-09-23", -(83 - i)), v: (i * 7) % 5 < 2 ? 1 : 0 }));
    const p = preverFaturamento({ serie: esparsa, hoje: "2026-09-24", realizadoHoje: 0, hora: 0, perfil: PLANO });
    // Faltam hoje + 6 dias do mês: a ~0,4/dia, algo entre 1 e 7 unidades.
    const falta = p.mes.previsto - p.mes.realizado;
    expect(falta).toBeGreaterThanOrEqual(1);
    expect(falta).toBeLessThanOrEqual(7);
  });

  it("upsell do pedido vai pro item que a vendedora aumentou, e sem nenhum, pra todos", () => {
    const aumentado = ratearUpsell([{ preco: 100, mexido: true }, { preco: 0, mexido: false }, { preco: 50, mexido: false }], 60);
    expect(aumentado).toEqual([60, 0, 0]);
    const nenhum = ratearUpsell([{ preco: 100, mexido: false }, { preco: 50, mexido: false }], 30);
    expect(nenhum).toEqual([20, 10]);
    expect(ratearUpsell([{ preco: 10, mexido: true }], 0)).toEqual([0]);
  });
});
