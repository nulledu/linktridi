import { describe, it, expect } from "vitest";
import { montarSemanaDeEnvios, rotuloDoDia, serieDiaria, diaCurto, type PontoEnvio } from "@/lib/painel-envios";

/**
 * A semana de envios na parede da logística.
 *
 * Duas coisas que o teste existe pra impedir: o dia parado sumir do gráfico
 * (seis barras se leem como "domingo foi igual", não como "domingo foi zero")
 * e a média móvel do começo da semana ser calculada só com os dias visíveis —
 * que faria a curva nascer subindo em toda semana, sem exceção.
 */

// Uma semana completa: 20/05 (qua) a 26/05 (ter) de 2026 — os números do
// desenho aprovado.
const SEMANA: PontoEnvio[] = [
  { dia: "2026-05-20", valor: 78 },
  { dia: "2026-05-21", valor: 95 },
  { dia: "2026-05-22", valor: 118 },
  { dia: "2026-05-23", valor: 102 },
  { dia: "2026-05-24", valor: 110 },
  { dia: "2026-05-25", valor: 64 },
  { dia: "2026-05-26", valor: 43 },
];
// Os 7 anteriores, somando 545 (a semana exibida soma 610 → +11.9% ≈ +12%).
const ANTERIORES: PontoEnvio[] = [
  { dia: "2026-05-13", valor: 70 },
  { dia: "2026-05-14", valor: 80 },
  { dia: "2026-05-15", valor: 100 },
  { dia: "2026-05-16", valor: 95 },
  { dia: "2026-05-17", valor: 90 },
  { dia: "2026-05-18", valor: 60 },
  { dia: "2026-05-19", valor: 50 },
];

describe("rotuloDoDia", () => {
  it("nomeia o dia sem escorregar pelo fuso da máquina", () => {
    expect(rotuloDoDia("2026-05-20")).toBe("Qua");
    expect(rotuloDoDia("2026-05-24")).toBe("Dom");
    expect(rotuloDoDia("2026-05-26")).toBe("Ter");
  });
});

describe("diaCurto", () => {
  it("vira dd/MM", () => {
    expect(diaCurto("2026-05-20")).toBe("20/05");
  });
});

describe("serieDiaria", () => {
  it("preenche com ZERO o dia sem movimento", () => {
    const s = serieDiaria({ "2026-05-25": 64, "2026-05-26": 43 }, "2026-05-26", 4);
    expect(s).toEqual([
      { dia: "2026-05-23", valor: 0 },
      { dia: "2026-05-24", valor: 0 },
      { dia: "2026-05-25", valor: 64 },
      { dia: "2026-05-26", valor: 43 },
    ]);
  });

  it("devolve sempre a quantidade pedida de dias, terminando no último", () => {
    const s = serieDiaria({}, "2026-05-26", 14);
    expect(s).toHaveLength(14);
    expect(s[0].dia).toBe("2026-05-13");
    expect(s[13].dia).toBe("2026-05-26");
  });
});

describe("montarSemanaDeEnvios", () => {
  const semana = montarSemanaDeEnvios([...ANTERIORES, ...SEMANA]);

  it("mostra os 7 últimos dias, com rótulo", () => {
    expect(semana.dias.map((d) => d.valor)).toEqual([78, 95, 118, 102, 110, 64, 43]);
    expect(semana.dias.map((d) => d.rotulo)).toEqual(["Qua", "Qui", "Sex", "Sáb", "Dom", "Seg", "Ter"]);
  });

  it("soma a semana e compara com a anterior", () => {
    expect(semana.total).toBe(610);
    expect(semana.totalAnterior).toBe(545);
    expect(semana.variacaoPct).toBe(12);
  });

  it("o período é o intervalo exibido", () => {
    expect(semana.periodo).toBe("20/05 – 26/05");
  });

  it("a média móvel usa o LASTRO, não só os dias visíveis", () => {
    // 1º ponto = média de 14/05..20/05 = (80+100+95+90+60+50+78)/7 = 79
    expect(semana.mediaMovel[0]).toBe(79);
    // último = média de 20/05..26/05 = 610/7 ≈ 87
    expect(semana.mediaMovel[6]).toBe(87);
    // Sem lastro, o 1º ponto seria o próprio dia (78) e a curva nasceria
    // sempre subindo — é exatamente isso que o lastro evita.
    expect(semana.mediaMovel[0]).not.toBe(78);
  });

  it("série curta não quebra: a janela encolhe em vez de inventar zero", () => {
    const s = montarSemanaDeEnvios(SEMANA);
    expect(s.total).toBe(610);
    expect(s.mediaMovel[0]).toBe(78);   // só o próprio dia disponível
    expect(s.totalAnterior).toBe(0);
    expect(s.variacaoPct).toBe(100);    // sem base de comparação
  });

  it("semana vazia não estoura", () => {
    const s = montarSemanaDeEnvios([]);
    expect(s.dias).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.variacaoPct).toBe(0);
    expect(s.periodo).toBe("");
  });
});
