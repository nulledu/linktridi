import { describe, it, expect } from "vitest";
import { faturasPorMes, mesPadraoDaBaixa, saldoPessoa, valorAteOMes } from "../tridimarket/domain";

const DIA = 86_400_000;
const AGORA = 1_700_000_000_000; // instante fixo, para "atraso" ser determinístico
const antiga = AGORA - 40 * DIA;  // > 30 dias → em atraso
const recente = AGORA - 2 * DIA;  // < 30 dias

describe("saldo da pessoa (pagou e continua devendo?)", () => {
  it("pagou o total: dívida e atraso zeram — o bug do print", () => {
    // Uma venda antiga de R$ 1,40 e um pagamento de R$ 1,40 no razão.
    const r = saldoPessoa([{ value: 1.4, at: antiga }], -1.4, AGORA);
    expect(r.open).toBe(0);
    expect(r.overdue).toBe(0);
  });

  it("sem pagamento, a dívida da venda antiga aparece como atraso", () => {
    const r = saldoPessoa([{ value: 1.4, at: antiga }], 0, AGORA);
    expect(r.open).toBe(1.4);
    expect(r.overdue).toBe(1.4);
  });

  it("pagamento parcial abate a mais ANTIGA primeiro (FIFO)", () => {
    // Deve 5 (antiga, em atraso) + 3 (recente). Paga 5 → quita a antiga.
    const r = saldoPessoa([{ value: 5, at: antiga }, { value: 3, at: recente }], -5, AGORA);
    expect(r.open).toBe(3);       // sobra a recente
    expect(r.overdue).toBe(0);    // a antiga (atraso) foi quitada
  });

  it("pagamento parcial insuficiente ainda deixa parte da antiga em atraso", () => {
    // Deve 5 (antiga) + 3 (recente). Paga 2 → sobra 3 da antiga.
    const r = saldoPessoa([{ value: 5, at: antiga }, { value: 3, at: recente }], -2, AGORA);
    expect(r.open).toBe(6);       // (5-2) + 3
    expect(r.overdue).toBe(3);    // resto da antiga continua em atraso
  });

  it("pagou MAIS que devia não vira dívida negativa", () => {
    // Overpay: crédito sobra, mas a dívida não fica negativa (o crédito
    // sobrando não é rastreado aqui — é caso raro de lançamento manual).
    const r = saldoPessoa([{ value: 1.4, at: antiga }], -5, AGORA);
    expect(r.open).toBe(0);
    expect(r.overdue).toBe(0);
  });

  it("débito lançado à mão entra como dívida atual (não em atraso)", () => {
    const r = saldoPessoa([], 2.5, AGORA);
    expect(r.open).toBe(2.5);
    expect(r.overdue).toBe(0);
  });

  it("sem vendas e sem ajuste: zero", () => {
    expect(saldoPessoa([], 0, AGORA)).toEqual({ open: 0, overdue: 0, cycleOpen: 0, previousOpen: 0 });
  });
});

// ── Ciclo mensal ────────────────────────────────────────────────────────────
// O limite é uma MESADA: na virada do mês ele volta cheio e o que ficou
// devendo vira fatura a pagar. Quem ocupa o limite é só o gasto DO MÊS.
describe("ciclo mensal (o limite vira junto com o mês)", () => {
  const emSP = (iso: string) => new Date(iso).getTime();
  const AGO_20 = emSP("2026-08-20T15:00:00-03:00");
  const SET_02 = emSP("2026-09-02T10:00:00-03:00");
  const SET_05 = emSP("2026-09-05T10:00:00-03:00");
  const HOJE = emSP("2026-09-10T09:00:00-03:00");

  it("gasto do mês anterior sai do ciclo: o limite renasce cheio", () => {
    const r = saldoPessoa([{ value: 300, at: AGO_20 }], 0, HOJE);
    expect(r.open).toBe(300);        // ela continua devendo 300
    expect(r.cycleOpen).toBe(0);     // mas não ocupa nada do limite deste mês
    expect(r.previousOpen).toBe(300); // é a fatura a pagar
  });

  it("gasto deste mês ocupa o limite; o do mês passado não", () => {
    const r = saldoPessoa([{ value: 300, at: AGO_20 }, { value: 80, at: SET_02 }, { value: 20, at: SET_05 }], 0, HOJE);
    expect(r.open).toBe(400);
    expect(r.cycleOpen).toBe(100);
    expect(r.previousOpen).toBe(300);
  });

  it("pagamento abate a fatura antiga primeiro e não devolve limite do mês", () => {
    const r = saldoPessoa([{ value: 300, at: AGO_20 }, { value: 100, at: SET_02 }], -300, HOJE);
    expect(r.open).toBe(100);
    expect(r.previousOpen).toBe(0);   // fatura de agosto quitada
    expect(r.cycleOpen).toBe(100);    // setembro continua consumido
  });

  it("débito lançado à mão (sem data) ocupa o ciclo corrente", () => {
    const r = saldoPessoa([], 2.5, HOJE);
    expect(r.cycleOpen).toBe(2.5);
    expect(r.previousOpen).toBe(0);
  });

  it("a virada é meia-noite de São Paulo, não UTC", () => {
    // 31/08 às 22h em SP = 01/09 às 01h UTC. É AGOSTO.
    const compra = emSP("2026-08-31T22:00:00-03:00");
    const r = saldoPessoa([{ value: 50, at: compra }], 0, HOJE);
    expect(r.cycleOpen).toBe(0);
    expect(r.previousOpen).toBe(50);
    // 01/09 às 00h30 em SP já é SETEMBRO.
    const r2 = saldoPessoa([{ value: 50, at: emSP("2026-09-01T00:30:00-03:00") }], 0, HOJE);
    expect(r2.cycleOpen).toBe(50);
  });
});

// ── Fatura de um mês ESCOLHIDO ──────────────────────────────────────────────
// A fatura fecha no último dia do mês; no dia 1º abre outra. O gestor escolhe
// QUAL fatura quer ver — o padrão é a que está aberta.
describe("fatura do mês selecionado", () => {
  const emSP = (iso: string) => new Date(iso).getTime();
  const HOJE = emSP("2026-09-10T09:00:00-03:00");
  const JUL_10 = emSP("2026-07-10T12:00:00-03:00");
  const AGO_20 = emSP("2026-08-20T12:00:00-03:00");
  const SET_02 = emSP("2026-09-02T12:00:00-03:00");
  const compras = [{ value: 70, at: JUL_10 }, { value: 300, at: AGO_20 }, { value: 100, at: SET_02 }];
  const agosto = { de: emSP("2026-08-01T00:00:00-03:00"), ate: emSP("2026-09-01T00:00:00-03:00") };

  it("olhando AGOSTO, a fatura é a de agosto e o anterior é julho", () => {
    const r = saldoPessoa(compras, 0, HOJE, 30, agosto.de, agosto.ate);
    expect(r.cycleOpen).toBe(300);
    expect(r.previousOpen).toBe(70);    // julho, fechado antes da janela
    expect(r.open).toBe(470);           // a dívida total não muda com o recorte
  });

  it("setembro (padrão) não enxerga a compra de setembro como fatura de agosto", () => {
    const r = saldoPessoa(compras, 0, HOJE);
    expect(r.cycleOpen).toBe(100);
    expect(r.previousOpen).toBe(370);   // julho + agosto
  });

  it("pagamento FIFO quita julho primeiro, e a fatura de agosto continua de pé", () => {
    const r = saldoPessoa(compras, -70, HOJE, 30, agosto.de, agosto.ate);
    expect(r.cycleOpen).toBe(300);
    expect(r.previousOpen).toBe(0);
    expect(r.open).toBe(400);
  });
});

describe("faturas por mês (pra dar baixa mês a mês)", () => {
  const emSP = (iso: string) => new Date(iso).getTime();
  const HOJE = emSP("2026-09-10T09:00:00-03:00");
  const compras = [
    { value: 70, at: emSP("2026-07-10T12:00:00-03:00") },
    { value: 300, at: emSP("2026-08-20T12:00:00-03:00") },
    { value: 50, at: emSP("2026-08-31T23:30:00-03:00") },   // ainda agosto em SP (02:30 UTC de 1º/09)
    { value: 100, at: emSP("2026-09-02T12:00:00-03:00") },
  ];

  it("separa o que sobrou de cada mês, do mais antigo pro aberto", () => {
    expect(faturasPorMes(compras, 0, HOJE)).toEqual([
      { mes: "2026-07", valor: 70, aberta: false },
      { mes: "2026-08", valor: 350, aberta: false },
      { mes: "2026-09", valor: 100, aberta: true },
    ]);
  });

  it("pagamento FIFO some do mês mais antigo e o mês quitado não aparece", () => {
    expect(faturasPorMes(compras, -100, HOJE)).toEqual([
      { mes: "2026-08", valor: 320, aberta: false },
      { mes: "2026-09", valor: 100, aberta: true },
    ]);
  });

  it("o mês aberto aparece mesmo sem compra, e débito à mão cai nele", () => {
    expect(faturasPorMes([], 0, HOJE)).toEqual([{ mes: "2026-09", valor: 0, aberta: true }]);
    expect(faturasPorMes([], 25, HOJE)).toEqual([{ mes: "2026-09", valor: 25, aberta: true }]);
  });

  it("valor sugerido pra baixa: as fechadas por padrão; um mês escolhido leva os anteriores junto", () => {
    const f = faturasPorMes(compras, 0, HOJE);
    expect(valorAteOMes(f, mesPadraoDaBaixa(f))).toBe(420);   // julho + agosto
    expect(valorAteOMes(f, "2026-07")).toBe(70);
    expect(valorAteOMes(f, "2026-09")).toBe(520);             // tudo
  });

  it("sem fatura fechada, o padrão é o mês aberto", () => {
    const f = faturasPorMes([{ value: 100, at: emSP("2026-09-02T12:00:00-03:00") }], 0, HOJE);
    expect(mesPadraoDaBaixa(f)).toBe("2026-09");
  });
});
