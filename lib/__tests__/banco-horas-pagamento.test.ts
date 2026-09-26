import { describe, it, expect } from "vitest";
import { calcBanco } from "../banco-horas";
import type { PontoRegistro, PontoPagamento } from "../ponto";

// Pagar horas a favor = a empresa quitou em dinheiro. As horas SAEM do banco:
// consomem o crédito mais antigo (o que vence primeiro) e nunca viram dívida.

const MES = "2026-07";
const HOJE = "2026-07-22";   // quarta. Banco começa em 15/07, também quarta.
const SEM_FERIADO = new Set<string>();
const PESSOA = {
  id: "p1", nome: "Bruno", fotoUrl: null,
  jornadaMin: 480,                              // 8h
  entradaPrevista: "08:00", saidaPrevista: "17:00",
  almocoInicio: "12:00", almocoFim: "13:00",
  trabalhaSabado: false, sabadoMin: null,
};

// Batida em horário SP (UTC-3) → ISO UTC.
let seq = 0;
const bat = (dia: string, hhmm: string): PontoRegistro => {
  const [h, m] = hhmm.split(":").map(Number);
  const iso = new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10), h + 3, m)).toISOString();
  return { id: `r${++seq}`, pessoaId: "p1", tipo: "entrada", batidoEm: iso, selfieUrl: null, confianca: null, origem: "tablet" };
};
// Dia com jornada de 8h + `extra` minutos (negativo = saiu mais cedo).
const diaCom = (dia: string, extraMin: number): PontoRegistro[] => {
  const saida = 17 * 60 + extraMin;   // 08–12 + 13–17 = 8h cravadas
  return [bat(dia, "08:00"), bat(dia, "12:00"), bat(dia, "13:00"), bat(dia, `${String(Math.floor(saida / 60)).padStart(2, "0")}:${String(saida % 60).padStart(2, "0")}`)];
};
// Mês inteiro certinho (15/07 a 22/07, dias úteis), com os extras onde o teste
// pedir. Sem isso, todo dia útil sem batida vira FALTA e a dívida come o
// crédito antes do pagamento chegar — o cenário nem existiria.
const UTEIS = ["2026-07-15", "2026-07-16", "2026-07-17", "2026-07-20", "2026-07-21", "2026-07-22"];
const montar = (extras: Record<string, number> = {}): PontoRegistro[] =>
  UTEIS.flatMap((d) => diaCom(d, extras[d] ?? 0));
const pag = (dia: string, minutos: number, i = 1, janela?: { de: string; ate: string }): PontoPagamento =>
  ({ id: `pg${i}`, pessoaId: "p1", dia, minutos, observacao: null, autorNome: "Admin", createdAt: `${dia}T12:00:00Z`, periodoDe: janela?.de ?? null, periodoAte: janela?.ate ?? null });

const banco = (regs: PontoRegistro[], pagamentos: PontoPagamento[] = []) =>
  calcBanco(PESSOA, regs, MES, HOJE, SEM_FERIADO, [], 480, [], "23:59", pagamentos);

const COM_EXTRAS = { "2026-07-16": 60, "2026-07-17": 120 };   // 1h + 2h = 3h a favor

describe("banco de horas — pagar horas a favor", () => {
  it("sem pagamento, o crédito continua inteiro", () => {
    const L = banco(montar(COM_EXTRAS)).ledger;
    expect(L.creditoMin).toBe(180);
    expect(L.pagoMin).toBe(0);
    expect(L.pagamentos).toEqual([]);
  });

  it("pagamento tira o crédito do banco e zera o saldo", () => {
    const L = banco(montar(COM_EXTRAS), [pag("2026-07-20", 180)]).ledger;
    expect(L.pagoMin).toBe(180);
    expect(L.creditoMin).toBe(0);
    expect(L.saldoMin).toBe(0);
    expect(L.creditos).toEqual([]);
  });

  it("pagamento parcial consome o crédito MAIS ANTIGO primeiro", () => {
    // 16/07 rende 1h e 17/07 rende 2h. Pagando 1h30, some o dia 16 inteiro e
    // meia hora do dia 17 — sobra 1h30 do 17, que é o que vence por último.
    const L = banco(montar(COM_EXTRAS), [pag("2026-07-20", 90)]).ledger;
    expect(L.pagoMin).toBe(90);
    expect(L.creditoMin).toBe(90);
    expect(L.creditos).toHaveLength(1);
    expect(L.creditos[0].dia).toBe("2026-07-17");
    expect(L.creditos[0].min).toBe(90);
  });

  it("pagar mais do que existe NÃO vira dívida — aplica só o que havia", () => {
    const L = banco(montar({ "2026-07-16": 60 }), [pag("2026-07-20", 600)]).ledger;
    expect(L.pagoMin).toBe(60);            // só as 1h que existiam
    expect(L.debitoMin).toBe(0);           // e nada de dívida
    expect(L.saldoMin).toBe(0);
    expect(L.pagamentos[0].min).toBe(600);
    expect(L.pagamentos[0].aplicadoMin).toBe(60);
  });

  it("crédito posterior ao pagamento fica de pé (não é engolido retroativamente)", () => {
    const L = banco(montar({ "2026-07-16": 60, "2026-07-22": 120 }), [pag("2026-07-17", 60)]).ledger;
    expect(L.pagoMin).toBe(60);
    expect(L.creditoMin).toBe(120);
    expect(L.creditos[0].dia).toBe("2026-07-22");
  });

  it("hora paga não abate dívida futura — quem deve depois, deve mesmo", () => {
    // Ganha 2h no dia 16, recebe as 2h no dia 17, e no dia 20 sai 1h mais cedo.
    const L = banco(montar({ "2026-07-16": 120, "2026-07-20": -60 }), [pag("2026-07-17", 120)]).ledger;
    expect(L.pagoMin).toBe(120);
    expect(L.debitoMin).toBe(60);
    expect(L.creditoMin).toBe(0);
    expect(L.saldoMin).toBe(-60);
  });

  it("pagamento do próprio dia vale (paga o que foi gerado hoje)", () => {
    const L = banco(montar({ "2026-07-16": 60 }), [pag("2026-07-16", 60)]).ledger;
    expect(L.pagoMin).toBe(60);
    expect(L.creditoMin).toBe(0);
  });

  it("dois pagamentos somam e são devolvidos do mais recente pro mais antigo", () => {
    const L = banco(montar(COM_EXTRAS), [pag("2026-07-18", 60, 1), pag("2026-07-21", 30, 2)]).ledger;
    expect(L.pagoMin).toBe(90);
    expect(L.creditoMin).toBe(90);
    expect(L.pagamentos.map((p) => p.dia)).toEqual(["2026-07-21", "2026-07-18"]);
  });
});

// ── Pagar por PERÍODO ───────────────────────────────────────────────────────
// Pagar a folha de um intervalo tem que consumir o crédito DAQUELE intervalo.
// Sem janela, o FIFO come o mais antigo — e o recibo de agosto quitava julho.
describe("banco de horas — pagar por período", () => {
  const DOIS_DIAS = { "2026-07-16": 60, "2026-07-17": 120 };   // 1h no 16, 2h no 17

  it("a janela pula o crédito mais antigo e paga o do período", () => {
    const L = banco(montar(DOIS_DIAS), [pag("2026-07-20", 120, 1, { de: "2026-07-17", ate: "2026-07-17" })]).ledger;
    expect(L.pagoMin).toBe(120);
    // O dia 16 continua de pé: não era dele que a folha falava.
    expect(L.creditos).toHaveLength(1);
    expect(L.creditos[0].dia).toBe("2026-07-16");
    expect(L.creditos[0].min).toBe(60);
  });

  it("a janela é um teto: não vaza pro crédito de fora dela", () => {
    // Pede 3h com janela só do dia 16 (que tem 1h): aplica 1h e para.
    const L = banco(montar(DOIS_DIAS), [pag("2026-07-20", 180, 1, { de: "2026-07-16", ate: "2026-07-16" })]).ledger;
    expect(L.pagamentos[0].aplicadoMin).toBe(60);
    expect(L.creditoMin).toBe(120);
    expect(L.creditos[0].dia).toBe("2026-07-17");
  });

  it("janela que fecha depois do dia do pagamento espera o período inteiro", () => {
    // Pago em 16/07 cobrindo 15–22/07: o crédito do dia 17 ainda nem existia
    // na data do pagamento. Aplicar no dia 16 pagaria só 1h das 3h.
    const L = banco(montar(DOIS_DIAS), [pag("2026-07-16", 180, 1, { de: "2026-07-15", ate: "2026-07-22" })]).ledger;
    expect(L.pagoMin).toBe(180);
    expect(L.creditoMin).toBe(0);
  });

  it("sem janela, continua sendo o mais antigo primeiro", () => {
    const L = banco(montar(DOIS_DIAS), [pag("2026-07-20", 60)]).ledger;
    expect(L.creditos[0].dia).toBe("2026-07-17");
    expect(L.creditoMin).toBe(120);
  });

  it("o período volta no histórico pra tela mostrar o que foi pago", () => {
    const L = banco(montar(DOIS_DIAS), [pag("2026-07-20", 60, 1, { de: "2026-07-15", ate: "2026-07-16" })]).ledger;
    expect(L.pagamentos[0].de).toBe("2026-07-15");
    expect(L.pagamentos[0].ate).toBe("2026-07-16");
  });
});

// ── Período de análise ──────────────────────────────────────────────────────
describe("banco de horas — período de análise", () => {
  it("intervalo livre traz só os dias pedidos, e o ledger continua corrido", () => {
    const b = calcBanco(PESSOA, montar({ "2026-07-16": 60, "2026-07-17": 120 }), { de: "2026-07-16", ate: "2026-07-17" }, HOJE, SEM_FERIADO, [], 480, [], "23:59", []);
    expect(b.de).toBe("2026-07-16");
    expect(b.ate).toBe("2026-07-17");
    expect(b.dias.map((d) => d.dia)).toEqual(["2026-07-16", "2026-07-17"]);
    expect(b.saldoMesMin).toBe(180);        // só o que aconteceu no intervalo
    expect(b.ledger.creditoMin).toBe(180);  // ledger não depende do que está aberto
  });

  it("intervalo que cruza meses não perde dia na virada", () => {
    const b = calcBanco(PESSOA, [], { de: "2026-07-30", ate: "2026-08-02" }, "2026-08-05", SEM_FERIADO, [], 480, [], "23:59", []);
    expect(b.dias.map((d) => d.dia)).toEqual(["2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"]);
  });

  it("\"YYYY-MM\" continua significando o mês inteiro", () => {
    const b = calcBanco(PESSOA, [], "2026-07", HOJE, SEM_FERIADO, [], 480, [], "23:59", []);
    expect(b.de).toBe("2026-07-01");
    expect(b.ate).toBe("2026-07-31");
    expect(b.dias).toHaveLength(31);
  });

  it("pontas invertidas se endireitam em vez de devolver nada", () => {
    const b = calcBanco(PESSOA, [], { de: "2026-07-20", ate: "2026-07-18" }, HOJE, SEM_FERIADO, [], 480, [], "23:59", []);
    expect(b.dias.map((d) => d.dia)).toEqual(["2026-07-18", "2026-07-19", "2026-07-20"]);
  });
});
