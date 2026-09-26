import { describe, it, expect } from "vitest";
import { calcBanco, limitarExtraDiaUtil, EXTRA_TETO_DIA_UTIL_MIN } from "../banco-horas";
import type { PontoRegistro } from "../ponto";
import type { TipoFeriado } from "../jornada-calendario";

// ── Quitar dívida ≠ fazer hora extra ────────────────────────────────────────
// São duas contas, nesta ordem, e só a segunda tem teto:
//
//  1) QUITAR — quem deve horas e fica a mais está devolvendo o que pegou. Não
//     tem teto: deve 3h e fica 4h, as 3h voltam inteiras. Cortar antes de
//     quitar seria perverso — quem devesse mais que o teto nunca zeraria
//     trabalhando.
//  2) EXTRA — só o que sobra depois de a dívida acabar. Aí vale o teto de 2h
//     do dia da escala.
//
// Piso não existe além dos 10 min da tolerância: 11 min a mais são 11 min de
// hora extra.

const HOJE = "2026-08-31";
const PESSOA = {
  id: "p1", nome: "Ana", fotoUrl: null,
  jornadaMin: 480, entradaPrevista: "08:00", saidaPrevista: "17:00",
  almocoInicio: "12:00", almocoFim: "13:00",
  trabalhaSabado: false, sabadoMin: null as number | null,
};
const SEM = new Map<string, TipoFeriado>();

let seq = 0;
const bat = (dia: string, hhmm: string): PontoRegistro => {
  const [h, m] = hhmm.split(":").map(Number);
  return {
    id: `r${++seq}`, pessoaId: "p1", tipo: "entrada",
    batidoEm: new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10), h + 3, m)).toISOString(),
    selfieUrl: null, confianca: null, origem: "tablet",
  };
};
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const diaCom = (dia: string, saldoMin = 0) =>
  [bat(dia, "08:00"), bat(dia, "12:00"), bat(dia, "13:00"), bat(dia, hhmm(17 * 60 + saldoMin))];

/** Julho (do dia 15) e agosto trabalhados certinho, com os saldos pedidos. */
const registros = (saldos: Record<string, number>): PontoRegistro[] => {
  const out: PontoRegistro[] = [];
  for (let d = new Date(Date.UTC(2026, 6, 15)); d <= new Date(Date.UTC(2026, 7, 31)); d.setUTCDate(d.getUTCDate() + 1)) {
    const dia = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    out.push(...diaCom(dia, saldos[dia] ?? 0));
  }
  return out;
};
const calc = (saldos: Record<string, number>) =>
  calcBanco(PESSOA, registros(saldos), "2026-08", HOJE, SEM, [], 480, [], "23:59", []);
const doDia = (b: ReturnType<typeof calc>, dia: string) => b.dias.find((d) => d.dia === dia)!;

describe("hora extra sem piso: 11 minutos contam", () => {
  it("11 min a mais viram 11 min de crédito", () => {
    const b = calc({ "2026-08-11": 11 });
    expect(b.ledger.creditoMin).toBe(11);
    expect(doDia(b, "2026-08-11").saldoMin).toBe(11);
  });

  it("20 min também — não existe piso de 30", () => {
    expect(calc({ "2026-08-11": 20 }).ledger.creditoMin).toBe(20);
  });

  it("mas 8 min continuam sendo arredondamento de relógio (tolerância de 10)", () => {
    const b = calc({ "2026-08-11": 8 });
    expect(b.ledger.creditoMin).toBe(0);
    expect(doDia(b, "2026-08-11").saldoMin).toBe(0);
  });
});

describe("quitar dívida não tem teto", () => {
  it("deve 1h, fica 20 min: os 20 min abatem a dívida", () => {
    const b = calc({ "2026-08-10": -60, "2026-08-11": 20 });
    expect(b.ledger.debitoMin).toBe(40);
    expect(b.ledger.creditoMin).toBe(0);
    expect(doDia(b, "2026-08-11").quitadoMin).toBe(20);
  });

  it("deve 3h e fica 4h: quita as 3h inteiras e ainda faz 1h de extra", () => {
    const b = calc({ "2026-08-10": -180, "2026-08-11": 240 });
    expect(b.ledger.debitoMin).toBe(0);
    expect(b.ledger.creditoMin).toBe(60);
    const d = doDia(b, "2026-08-11");
    expect(d.quitadoMin).toBe(180);
    expect(d.saldoMin).toBe(240);
    expect(d.extraCortadoMin).toBeUndefined();   // nada foi cortado
  });

  it("deve 5h e fica 5h: paga tudo, mesmo passando muito do teto", () => {
    // O dia de dívida é montado à mão: 08:00–11:00 = 3h de 8h → −5h. (O helper
    // `diaCom` só serve pra saldos pequenos; com −300 as batidas saem fora de
    // ordem e o dia vira outra coisa.)
    const regs = [...registros({ "2026-08-11": 300 }).filter((r) => !r.batidoEm.startsWith("2026-08-10")),
      bat("2026-08-10", "08:00"), bat("2026-08-10", "11:00")];
    const b = calcBanco(PESSOA, regs, "2026-08", HOJE, SEM, [], 480, [], "23:59", []);
    expect(b.dias.find((d) => d.dia === "2026-08-10")!.saldoMin).toBe(-300);
    expect(b.ledger.debitoMin).toBe(0);
    expect(b.ledger.creditoMin).toBe(0);
    expect(b.dias.find((d) => d.dia === "2026-08-11")!.quitadoMin).toBe(300);
  });
});

describe("o teto de 2h vale para a sobra", () => {
  it("sem dívida, 4h a mais rendem 2h", () => {
    const b = calc({ "2026-08-11": 240 });
    expect(b.ledger.creditoMin).toBe(120);
    expect(doDia(b, "2026-08-11").extraCortadoMin).toBe(120);
    expect(doDia(b, "2026-08-11").saldoMin).toBe(120);
  });

  it("deve 1h e fica 4h: quita 1h e a sobra de 3h é cortada em 2h", () => {
    const b = calc({ "2026-08-10": -60, "2026-08-11": 240 });
    expect(b.ledger.debitoMin).toBe(0);
    expect(b.ledger.creditoMin).toBe(120);
    const d = doDia(b, "2026-08-11");
    expect(d.quitadoMin).toBe(60);
    expect(d.extraCortadoMin).toBe(60);
    expect(d.saldoMin).toBe(180);   // 60 quitados + 120 de extra
  });

  it("o teto é POR DIA — dois dias de 4h somam 4h de crédito", () => {
    expect(calc({ "2026-08-11": 240, "2026-08-12": 240 }).ledger.creditoMin).toBe(240);
  });

  it("a função pura: só corta o que passa de 2h", () => {
    expect(EXTRA_TETO_DIA_UTIL_MIN).toBe(120);
    expect(limitarExtraDiaUtil(11)).toEqual({ valeMin: 11, cortadoMin: 0 });
    expect(limitarExtraDiaUtil(120)).toEqual({ valeMin: 120, cortadoMin: 0 });
    expect(limitarExtraDiaUtil(180)).toEqual({ valeMin: 120, cortadoMin: 60 });
  });
});

describe("fora da escala não tem teto", () => {
  const DOM = "2026-08-16";   // domingo
  const SAB = "2026-08-15";   // sábado de quem não trabalha sábado
  it("domingo de 9h conta as 9h", () => {
    const regs = [...registros({}), bat(DOM, "08:00"), bat(DOM, "17:00")];
    const b = calcBanco(PESSOA, regs, "2026-08", HOJE, SEM, [], 480, [], "23:59", []);
    expect(b.dias.find((d) => d.dia === DOM)!.saldoMin).toBe(540);
    expect(b.ledger.creditoEspecialMin).toBe(540);
  });

  it("chamada num sábado que não é dela: 3h contam inteiras", () => {
    const regs = [...registros({}), bat(SAB, "08:00"), bat(SAB, "11:00")];
    const b = calcBanco(PESSOA, regs, "2026-08", HOJE, SEM, [], 480, [], "23:59", []);
    expect(b.dias.find((d) => d.dia === SAB)!.saldoMin).toBe(180);
  });
});
