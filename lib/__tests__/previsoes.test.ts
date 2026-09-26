import { describe, it, expect } from "vitest";
import { previsoesDaAgenda, totalPrevisto } from "@/lib/financeiro/previsoes";
import type { Compromisso, Recorrencia } from "@/lib/financeiro/tipos";

/**
 * A agenda mostra o que EXISTE e o que VAI existir.
 *
 * Sem a previsão, "a pagar nos próximos 30 dias" mostra um número menor que a
 * realidade, porque metade das contas do mês ainda não foi gerada — e número
 * de caixa que engana para menos é pior que número nenhum.
 *
 * O caso que decide o desenho: uma volta já gerada NÃO pode aparecer duas
 * vezes (uma como compromisso, outra como previsão), senão o total dobra.
 */

const EMP = "e1";

const regra = (over: Partial<Recorrencia> = {}): Recorrencia => ({
  id: "r1", empresa_id: EMP, descricao: "Aluguel", categoria: "aluguel", valor: 8000,
  periodicidade: "mensal", intervalo_meses: 1, dia_vencimento: 10,
  conta_id: null, conta_destino_id: null, fornecedor_id: null, contato_id: null,
  forma_pagamento: null, responsavel_id: null,
  inicio: "2026-01-10", fim: null, proxima_competencia: "2026-08-01", status: "ativa",
  ...over,
});

const gerado = (competencia: string, over: Partial<Compromisso> = {}): Compromisso => ({
  id: `c-${competencia}`, empresa_id: EMP, descricao: "Aluguel", categoria: "aluguel", valor: 8000,
  vencimento: `${competencia.slice(0, 7)}-10`, competencia, status: "pendente",
  origem: "recorrencia", origem_id: "r1",
  parcela_numero: null, parcela_total: null,
  conta_id: null, fornecedor_id: null, contato_id: null, colaborador_id: null,
  pago_em: null, pago_valor: null, observacao: null,
  ...over,
});

describe("previsões da agenda", () => {
  it("a recorrência ativa vira linhas até o fim da janela", () => {
    const p = previsoesDaAgenda([regra()], [], "2026-11-30", "2026-08-22");
    expect(p.map((x) => x.vencimento)).toEqual(["2026-08-10", "2026-09-10", "2026-10-10", "2026-11-10"]);
    expect(p[0].valor).toBe(8000);
    expect(p[0].chave).toContain("r1");
  });

  it("o que JÁ foi gerado não aparece de novo — senão o total dobra", () => {
    const p = previsoesDaAgenda([regra()], [gerado("2026-08-01"), gerado("2026-09-01")], "2026-11-30", "2026-08-22");
    expect(p.map((x) => x.vencimento)).toEqual(["2026-10-10", "2026-11-10"]);
  });

  it("compromisso CANCELADO conta como decidido — não volta como previsão", () => {
    // Alguém decidiu que aquela volta não existe; reaparecer desfaria a
    // decisão em silêncio.
    const p = previsoesDaAgenda([regra()], [gerado("2026-08-01", { status: "cancelado" })], "2026-09-30", "2026-08-22");
    expect(p.map((x) => x.vencimento)).toEqual(["2026-09-10"]);
  });

  it("regra pausada e encerrada não preveem nada", () => {
    expect(previsoesDaAgenda([regra({ status: "pausada" })], [], "2026-11-30", "2026-08-22")).toEqual([]);
    expect(previsoesDaAgenda([regra({ status: "encerrada" })], [], "2026-11-30", "2026-08-22")).toEqual([]);
  });

  it("a regra ATRASADA de gerar aparece, com o vencimento no passado", () => {
    // É a que mais importa: ninguém gerou, e a conta venceu.
    const p = previsoesDaAgenda([regra({ proxima_competencia: "2026-06-01" })], [], "2026-08-31", "2026-08-22");
    expect(p[0].vencimento).toBe("2026-06-10");
  });

  it("respeita o fim da regra", () => {
    const p = previsoesDaAgenda([regra({ fim: "2026-09-30" })], [], "2026-12-31", "2026-08-22");
    expect(p.map((x) => x.vencimento)).toEqual(["2026-08-10", "2026-09-10"]);
  });

  it("dia 31 em fevereiro vira 28 — a previsão não escorrega de mês", () => {
    const p = previsoesDaAgenda(
      [regra({ dia_vencimento: 31, proxima_competencia: "2026-02-01", inicio: "2026-01-01" })],
      [], "2026-02-28", "2026-02-01");
    expect(p[0].vencimento).toBe("2026-02-28");
  });

  it("compromisso de OUTRA origem não silencia a previsão", () => {
    // Uma compra parcelada que caiu no mesmo dia não é a volta do aluguel.
    const compra = gerado("2026-08-01", { id: "x", origem: "compra", origem_id: "compra-1" });
    const p = previsoesDaAgenda([regra()], [compra], "2026-08-31", "2026-08-22");
    expect(p).toHaveLength(1);
  });

  it("sai ordenado por vencimento, com duas regras misturadas", () => {
    const outra = regra({ id: "r2", descricao: "Contador", dia_vencimento: 5, valor: 1200 });
    const p = previsoesDaAgenda([regra(), outra], [], "2026-09-30", "2026-08-22");
    expect(p.map((x) => `${x.vencimento} ${x.descricao}`)).toEqual([
      "2026-08-05 Contador", "2026-08-10 Aluguel", "2026-09-05 Contador", "2026-09-10 Aluguel",
    ]);
  });

  it("o total previsto só conta a janela pedida", () => {
    const p = previsoesDaAgenda([regra()], [], "2026-11-30", "2026-08-22");
    expect(totalPrevisto(p, "2026-08-22", "2026-09-30")).toBe(8000);
    expect(totalPrevisto(p, "2026-08-01", "2026-11-30")).toBe(32000);
  });
});

describe("Regra de valor variável na agenda", () => {
  const luz = (): Recorrencia => regra({
    id: "luz", descricao: "Luz", categoria: "servicos", valor: 480,
    valor_variavel: true, dia_vencimento: 20,
  } as Partial<Recorrencia>);

  it("aparece marcada como palpite quando ninguém informou", () => {
    // A conta de luz existe antes de a fatura chegar; sumir dela faria o
    // "a pagar" enganar para menos.
    const p = previsoesDaAgenda([luz()], [], "2026-09-30", "2026-08-22");
    expect(p[0].valor).toBe(480);
    expect(p[0].estimado).toBe(true);
  });

  it("o mês informado deixa de ser palpite", () => {
    // Continuar marcando "Estimado" ao lado do número que a pessoa escreveu
    // faz ela desconfiar da marca em vez de confiar nela.
    const p = previsoesDaAgenda([luz()], [], "2026-09-30", "2026-08-22",
      { luz: { "2026-09-01": 617.42 } });
    const setembro = p.find((x) => x.competencia === "2026-09-01")!;
    expect(setembro.valor).toBe(617.42);
    expect(setembro.estimado).toBeUndefined();
  });

  it("regra de valor fixo nunca é marcada", () => {
    const p = previsoesDaAgenda([regra()], [], "2026-09-30", "2026-08-22");
    expect(p.every((x) => x.estimado === undefined)).toBe(true);
  });

  it("o total previsto conta a estimativa — ela é a melhor informação que há", () => {
    const p = previsoesDaAgenda([luz()], [], "2026-09-30", "2026-08-22");
    expect(totalPrevisto(p, "2026-08-01", "2026-09-30")).toBe(960);
  });

  it("valores de outra regra não vazam", () => {
    const p = previsoesDaAgenda([luz()], [], "2026-08-31", "2026-08-22",
      { outra: { "2026-08-01": 999 } });
    expect(p[0].valor).toBe(480);
    expect(p[0].estimado).toBe(true);
  });
});
