import { describe, expect, it } from "vitest";
import { agruparLancamentos } from "../tridimarket/razao";
import { saldoPessoa } from "../tridimarket/domain";

const emSP = (iso: string) => new Date(iso).getTime();
const AGO = "2026-08-20T15:00:00-03:00";
const SET = "2026-09-01T13:39:00-03:00";
const HOJE = emSP("2026-09-01T14:30:00-03:00");

// Caso real: Gustavo devia R$ 321,19 de agosto e comprou Pringles ×2 (R$ 25,98)
// hoje. Baixar pra ×1 gera um estorno de -12,99 LIGADO àquela venda.
const linhas = [
  { funcionario_id: 1, tipo: "compra", valor: 321.19, ocorrido_em: AGO, venda_id: 10 },
  { funcionario_id: 1, tipo: "compra", valor: 25.98, ocorrido_em: SET, venda_id: 11 },
  { funcionario_id: 1, tipo: "estorno", valor: -12.99, ocorrido_em: SET, venda_id: 11 },
];

describe("corrigir uma venda abate AQUELA venda", () => {
  it("o estorno não vira crédito solto que o FIFO gasta na fatura velha", () => {
    const { comprasPor, abatePor } = agruparLancamentos(linhas);
    const r = saldoPessoa(comprasPor.get(1) ?? [], abatePor.get(1) ?? 0, HOJE);
    expect(r.cycleOpen).toBe(12.99);     // a fatura aberta CAIU
    expect(r.previousOpen).toBe(321.19); // agosto ficou intocado
    expect(r.open).toBe(334.18);
  });

  it("venda zerada some da conta em vez de virar crédito", () => {
    const { comprasPor, abatePor } = agruparLancamentos([
      ...linhas.slice(0, 2),
      { funcionario_id: 1, tipo: "estorno", valor: -25.98, ocorrido_em: SET, venda_id: 11 },
    ]);
    const r = saldoPessoa(comprasPor.get(1) ?? [], abatePor.get(1) ?? 0, HOJE);
    expect(r.cycleOpen).toBe(0);
    expect(r.previousOpen).toBe(321.19);
  });

  it("pagamento SOLTO continua abatendo o mais antigo (FIFO)", () => {
    const { comprasPor, abatePor } = agruparLancamentos([
      ...linhas.slice(0, 2),
      { funcionario_id: 1, tipo: "pagamento", valor: -321.19, ocorrido_em: SET, venda_id: null },
    ]);
    const r = saldoPessoa(comprasPor.get(1) ?? [], abatePor.get(1) ?? 0, HOJE);
    expect(r.previousOpen).toBe(0);
    expect(r.cycleOpen).toBe(25.98);
  });

  it("a compra fica na data DELA, não na data do estorno", () => {
    const { comprasPor } = agruparLancamentos([
      { funcionario_id: 1, tipo: "compra", valor: 100, ocorrido_em: AGO, venda_id: 10 },
      { funcionario_id: 1, tipo: "estorno", valor: -40, ocorrido_em: SET, venda_id: 10 },
    ]);
    const compra = (comprasPor.get(1) ?? [])[0];
    expect(compra.value).toBe(60);
    expect(compra.at).toBe(emSP(AGO));   // agosto: senão a dívida velha rejuvenesce
  });

  it("estorno maior que a venda vira crédito, não dívida negativa", () => {
    const { comprasPor, abatePor } = agruparLancamentos([
      { funcionario_id: 1, tipo: "compra", valor: 10, ocorrido_em: SET, venda_id: 11 },
      { funcionario_id: 1, tipo: "estorno", valor: -15, ocorrido_em: SET, venda_id: 11 },
    ]);
    expect(comprasPor.get(1) ?? []).toEqual([]);
    expect(abatePor.get(1)).toBe(-5);
  });

  it("débito lançado à mão, sem venda, continua contando", () => {
    const { comprasPor } = agruparLancamentos([
      { funcionario_id: 1, tipo: "debito", valor: 30, ocorrido_em: SET, venda_id: null },
    ]);
    expect((comprasPor.get(1) ?? [])[0].value).toBe(30);
  });
});
