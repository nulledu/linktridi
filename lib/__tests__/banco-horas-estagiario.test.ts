import { describe, it, expect } from "vitest";
import { calcBanco } from "../banco-horas";
import type { PontoRegistro, PontoAjuste } from "../ponto";
import type { TipoFeriado } from "../jornada-calendario";

// ── Estagiário não tem hora extra ───────────────────────────────────────────
// Estágio não gera hora extra: ficar além da jornada NÃO vira crédito no banco.
// O que continua valendo, porque não é marcação de relógio e sim decisão de
// gestão:
//
//  1) QUITAR dívida — ficar a mais devolve o que a pessoa devia. Se não
//     quitasse, o estagiário que saiu cedo um dia ficaria devendo para sempre,
//     sem nenhuma forma de zerar trabalhando.
//  2) AJUSTE MANUAL do admin — a única porta pela qual um estagiário ganha
//     horas a favor.
//
// Sair mais cedo continua virando dívida igual a todo mundo: o corte é só do
// crédito que nasce do relógio.

const HOJE = "2026-08-31";
const BASE = {
  id: "p1", nome: "Ana", fotoUrl: null,
  jornadaMin: 480, entradaPrevista: "08:00", saidaPrevista: "17:00",
  almocoInicio: "12:00", almocoFim: "13:00",
  trabalhaSabado: false, sabadoMin: null as number | null,
};
const EFETIVO = { ...BASE, estagiario: false };
const ESTAGIARIO = { ...BASE, estagiario: true };
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

/** Julho (do dia 15) e agosto trabalhados, com os saldos pedidos por dia. */
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
const calc = (pessoa: typeof EFETIVO, saldos: Record<string, number>, ajustes: PontoAjuste[] = []) =>
  calcBanco(pessoa, registros(saldos), "2026-08", HOJE, SEM, [], 480, ajustes, "23:59", []);
const doDia = (b: ReturnType<typeof calc>, dia: string) => b.dias.find((d) => d.dia === dia)!;

const ajuste = (dia: string, minutos: number): PontoAjuste => ({
  id: `a-${dia}`, pessoaId: "p1", dia, minutos, motivo: "acerto", autorNome: "Admin",
  createdAt: `${dia}T12:00:00.000Z`,
});

describe("estagiário não acumula hora extra", () => {
  it("ficar 90 min a mais não vira crédito nenhum", () => {
    const b = calc(ESTAGIARIO, { "2026-08-11": 90 });
    expect(b.ledger.creditoMin).toBe(0);
    expect(doDia(b, "2026-08-11").saldoMin).toBe(0);
  });

  it("o mesmo dia, para quem não é estagiário, vira 90 min", () => {
    const b = calc(EFETIVO, { "2026-08-11": 90 });
    expect(b.ledger.creditoMin).toBe(90);
  });

  it("sem a marca (campo ausente) nada muda: o padrão é ter hora extra", () => {
    const b = calc(BASE as typeof EFETIVO, { "2026-08-11": 90 });
    expect(b.ledger.creditoMin).toBe(90);
  });

  it("o extra descartado aparece como cortado, pra tela poder explicar", () => {
    const d = doDia(calc(ESTAGIARIO, { "2026-08-11": 90 }), "2026-08-11");
    expect(d.extraCortadoMin).toBe(90);
  });
});

describe("o que o estagiário continua tendo", () => {
  it("ficar a mais QUITA a dívida de um dia curto", () => {
    // Sai 60 min mais cedo num dia, fica 60 min a mais no outro: zera.
    const b = calc(ESTAGIARIO, { "2026-08-11": -60, "2026-08-12": 60 });
    expect(b.ledger.debitoMin).toBe(0);
    expect(b.ledger.creditoMin).toBe(0);
    expect(doDia(b, "2026-08-12").quitadoMin).toBe(60);
  });

  it("quitar não engole a dívida além do que ficou a mais", () => {
    const b = calc(ESTAGIARIO, { "2026-08-11": -60, "2026-08-12": 20 });
    expect(b.ledger.debitoMin).toBe(40);
    expect(b.ledger.creditoMin).toBe(0);
  });

  it("sair mais cedo vira dívida, igual a todo mundo", () => {
    const b = calc(ESTAGIARIO, { "2026-08-11": -45 });
    expect(b.ledger.debitoMin).toBe(45);
  });

  it("ajuste manual do admin ainda gera crédito", () => {
    const b = calc(ESTAGIARIO, {}, [ajuste("2026-08-11", 120)]);
    expect(b.ledger.creditoMin).toBe(120);
  });

  it("num dia com ajuste manual E relógio a mais, só o ajuste conta", () => {
    const b = calc(ESTAGIARIO, { "2026-08-11": 45 }, [ajuste("2026-08-11", 60)]);
    expect(b.ledger.creditoMin).toBe(60);
  });
});
