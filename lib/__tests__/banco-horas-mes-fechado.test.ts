import { describe, it, expect } from "vitest";
import { calcBanco, type MesBanco } from "../banco-horas";
import type { PontoRegistro, PontoPagamento, Justificativa } from "../ponto";

// ── Compensar atravessa o mês; pagar, não ────────────────────────────────────
// Hora se compensa com hora ATÉ ONDE O BANCO ALCANÇAR: sair mais cedo come o
// crédito ainda válido (3 meses), de qualquer mês, do mais antigo pro mais
// novo. Só o que sobra depois de raspar o banco vira dívida de verdade.
//
// Dinheiro é outra conta: a folha é sempre "as horas do mês tal", e pagar
// agosto não pode quitar julho por baixo do pano — quem garante isso é a
// JANELA do pagamento (`de`/`ate`), não a compensação.
//
// Por mês, `geradoMin`/`devidoMin` são o BRUTO (histórico, não muda mais) e
// `creditoMin`/`debitoMin` são o que continua EM ABERTO — esse encolhe quando
// um mês seguinte compensa contra ele.

const SEM_FERIADO = new Set<string>();
const PESSOA = {
  id: "p1", nome: "Bruno", fotoUrl: null,
  jornadaMin: 480,                                // 8h
  entradaPrevista: "08:00", saidaPrevista: "17:00",
  almocoInicio: "12:00", almocoFim: "13:00",
  trabalhaSabado: false, sabadoMin: null,
};

let seq = 0;
const bat = (dia: string, hhmm: string): PontoRegistro => {
  const [h, m] = hhmm.split(":").map(Number);
  const iso = new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10), h + 3, m)).toISOString();
  return { id: `r${++seq}`, pessoaId: "p1", tipo: "entrada", batidoEm: iso, selfieUrl: null, confianca: null, origem: "tablet" };
};
// Dia com 8h + `extra` minutos (negativo = saiu mais cedo).
const diaCom = (dia: string, extraMin: number): PontoRegistro[] => {
  const saida = 17 * 60 + extraMin;
  return [bat(dia, "08:00"), bat(dia, "12:00"), bat(dia, "13:00"), bat(dia, `${String(Math.floor(saida / 60)).padStart(2, "0")}:${String(saida % 60).padStart(2, "0")}`)];
};

// Todo dia útil de 15/07 a 05/08 batido certinho (senão dia sem batida vira
// FALTA e a dívida cobre o cenário todo).
const UTEIS = [
  "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-20", "2026-07-21", "2026-07-22",
  "2026-07-23", "2026-07-24", "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31",
  "2026-08-03", "2026-08-04", "2026-08-05",
];
const HOJE = "2026-08-05";
const montar = (extras: Record<string, number> = {}): PontoRegistro[] => UTEIS.flatMap((d) => diaCom(d, extras[d] ?? 0));

const banco = (extras: Record<string, number> = {}, pagamentos: PontoPagamento[] = [], just: Justificativa[] = []) =>
  calcBanco(PESSOA, montar(extras), "2026-08", HOJE, SEM_FERIADO, just, 480, [], "23:59", pagamentos);
const pag = (dia: string, minutos: number, janela?: { de: string; ate: string }, i = 1): PontoPagamento =>
  ({ id: `pg${i}`, pessoaId: "p1", dia, minutos, observacao: null, autorNome: "Admin", createdAt: `${dia}T12:00:00Z`, periodoDe: janela?.de ?? null, periodoAte: janela?.ate ?? null });
const mes = (meses: MesBanco[], m: string): MesBanco => meses.find((x) => x.mes === m)!;

const JULHO = { de: "2026-07-01", ate: "2026-07-31" };
const AGOSTO = { de: "2026-08-01", ate: "2026-08-31" };

describe("banco de horas — o mês fecha", () => {
  it("cada mês vira uma linha, com o bruto e o que ficou aberto", () => {
    const L = banco({ "2026-07-16": 120, "2026-08-04": 60 }).ledger;
    expect(L.meses.map((m) => m.mes)).toEqual(["2026-07", "2026-08"]);
    expect(mes(L.meses, "2026-07").geradoMin).toBe(120);
    expect(mes(L.meses, "2026-07").creditoMin).toBe(120);
    expect(mes(L.meses, "2026-08").geradoMin).toBe(60);
    expect(mes(L.meses, "2026-08").creditoMin).toBe(60);
    expect(L.creditoMin).toBe(180);   // o total continua somando os dois
  });

  it("sair mais cedo come o crédito do mês anterior antes de virar dívida", () => {
    // +2h em 16/07 e −1h em 04/08: a pessoa tinha hora a favor, então não deve
    // nada — só o crédito encolhe.
    const L = banco({ "2026-07-16": 120, "2026-08-04": -60 }).ledger;
    expect(mes(L.meses, "2026-07").geradoMin).toBe(120);   // o bruto não muda
    expect(mes(L.meses, "2026-07").creditoMin).toBe(60);   // o aberto, sim
    expect(mes(L.meses, "2026-08").devidoMin).toBe(60);
    expect(mes(L.meses, "2026-08").debitoMin).toBe(0);     // não virou dívida
    expect(L.debitoMin).toBe(0);
    expect(L.saldoMin).toBe(60);
  });

  it("o que passa do que havia no banco vira dívida", () => {
    // +1h em julho, −3h em agosto: 1h compensa, 2h ficam devendo.
    const L = banco({ "2026-07-16": 60, "2026-08-04": -180 }).ledger;
    expect(L.creditoMin).toBe(0);
    expect(mes(L.meses, "2026-08").debitoMin).toBe(120);
    expect(L.saldoMin).toBe(-120);
  });

  it("crédito de agosto quita dívida que ficou de julho", () => {
    const L = banco({ "2026-07-16": -60, "2026-08-04": 120 }).ledger;
    expect(mes(L.meses, "2026-07").debitoMin).toBe(0);
    expect(mes(L.meses, "2026-08").creditoMin).toBe(60);
    expect(L.saldoMin).toBe(60);
  });

  it("dentro do mesmo mês continua compensando por ordem de chegada", () => {
    const L = banco({ "2026-07-16": 120, "2026-07-21": -30 }).ledger;
    expect(mes(L.meses, "2026-07").geradoMin).toBe(120);
    expect(mes(L.meses, "2026-07").devidoMin).toBe(30);
    expect(mes(L.meses, "2026-07").creditoMin).toBe(90);
    expect(mes(L.meses, "2026-07").debitoMin).toBe(0);
    expect(mes(L.meses, "2026-07").saldoMin).toBe(90);
  });

  it("o mês corrente é marcado (o número dele ainda pode mudar)", () => {
    const L = banco().ledger;
    expect(mes(L.meses, "2026-07").corrente).toBe(false);
    expect(mes(L.meses, "2026-08").corrente).toBe(true);
  });
});

describe("banco de horas — pagar o mês desconta só o mês", () => {
  it("pagar julho não toca em agosto", () => {
    const L = banco({ "2026-07-16": 120, "2026-08-04": 60 }, [pag("2026-08-05", 120, JULHO)]).ledger;
    expect(L.pagoMin).toBe(120);
    expect(mes(L.meses, "2026-07").pagoMin).toBe(120);
    expect(mes(L.meses, "2026-07").creditoMin).toBe(0);
    expect(mes(L.meses, "2026-08").pagoMin).toBe(0);
    expect(mes(L.meses, "2026-08").creditoMin).toBe(60);   // agosto fica de pé
  });

  it("pagar agosto não quita julho por baixo do pano", () => {
    const L = banco({ "2026-07-16": 120, "2026-08-04": 60 }, [pag("2026-08-05", 60, AGOSTO)]).ledger;
    expect(mes(L.meses, "2026-08").creditoMin).toBe(0);
    expect(mes(L.meses, "2026-07").creditoMin).toBe(120);
  });

  it("a janela é teto: pedir mais do que o mês tem aplica só o que havia", () => {
    const L = banco({ "2026-07-16": 120, "2026-08-04": 60 }, [pag("2026-08-05", 600, AGOSTO)]).ledger;
    expect(L.pagamentos[0].aplicadoMin).toBe(60);
    expect(mes(L.meses, "2026-07").creditoMin).toBe(120);
    expect(L.debitoMin).toBe(0);   // pagar demais nunca vira dívida
  });

  it("o pago entra no mês que GEROU a hora, não no mês em que caiu o dinheiro", () => {
    const L = banco({ "2026-07-16": 120 }, [pag("2026-08-05", 120, JULHO)]).ledger;
    expect(mes(L.meses, "2026-07").pagoMin).toBe(120);
    expect(mes(L.meses, "2026-08").pagoMin).toBe(0);
  });
});

describe("banco de horas — falta justificada sem abono", () => {
  const falta: Justificativa = { id: "j1", pessoaId: "p1", dia: "2026-08-04", motivo: "consulta", abona: false };

  it("continua devendo as horas, mas sai da lista de pendência", () => {
    // Sem batida no dia 04/08 e com justificativa não abonada: a dívida existe,
    // a pendência de justificar não.
    const b = calcBanco(PESSOA, montar().filter((r) => !r.batidoEm.startsWith("2026-08-04")), "2026-08", HOJE, SEM_FERIADO, [falta], 480, [], "23:59", []);
    const dia = b.dias.find((d) => d.dia === "2026-08-04")!;
    expect(dia.justificada).toBe(true);
    expect(dia.abonada).toBe(false);
    expect(dia.saldoMin).toBe(-480);
    expect(b.ledger.faltasNaoJustificadas.map((f) => f.dia)).not.toContain("2026-08-04");
    expect(mes(b.ledger.meses, "2026-08").debitoMin).toBe(480);
  });

  it("com abono, ninguém paga nada", () => {
    const b = calcBanco(PESSOA, montar().filter((r) => !r.batidoEm.startsWith("2026-08-04")), "2026-08", HOJE, SEM_FERIADO, [{ ...falta, abona: true }], 480, [], "23:59", []);
    const dia = b.dias.find((d) => d.dia === "2026-08-04")!;
    expect(dia.abonada).toBe(true);
    expect(dia.saldoMin).toBe(0);
    expect(mes(b.ledger.meses, "2026-08").debitoMin).toBe(0);
  });

  it("falta sem justificativa nenhuma continua aparecendo como pendência", () => {
    const b = calcBanco(PESSOA, montar().filter((r) => !r.batidoEm.startsWith("2026-08-04")), "2026-08", HOJE, SEM_FERIADO, [], 480, [], "23:59", []);
    expect(b.ledger.faltasNaoJustificadas.map((f) => f.dia)).toContain("2026-08-04");
  });
});

describe("banco de horas — piso de 10 min por dia", () => {
  it("8 min a mais num dia não entram no mês", () => {
    const L = banco({ "2026-07-16": 8 }).ledger;
    expect(mes(L.meses, "2026-07").geradoMin).toBe(0);
    expect(L.creditoMin).toBe(0);
  });

  it("11 min a mais entram inteiros", () => {
    const L = banco({ "2026-07-16": 11 }).ledger;
    expect(mes(L.meses, "2026-07").geradoMin).toBe(11);
  });

  it("vários dias de 8 min não somam hora extra no mês", () => {
    const L = banco({ "2026-07-16": 8, "2026-07-17": 8, "2026-07-20": 8, "2026-07-21": 8 }).ledger;
    expect(mes(L.meses, "2026-07").geradoMin).toBe(0);
  });
});
