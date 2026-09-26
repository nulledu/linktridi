import { describe, expect, it } from "vitest";
import { geracaoDaCompetencia } from "@/lib/financeiro/materializar-recorrencia";
import type { Recorrencia } from "@/lib/financeiro/tipos";

const regra = (over: Partial<Recorrencia> = {}): Recorrencia => ({
  id: "00000000-0000-4000-8000-000000000001",
  empresa_id: "00000000-0000-4000-8000-000000000002",
  descricao: "Aluguel", categoria: "aluguel", valor: 8000,
  periodicidade: "mensal", intervalo_meses: 1, dia_vencimento: 10,
  conta_id: null, fornecedor_id: null, contato_id: null, conta_destino_id: null,
  forma_pagamento: null, responsavel_id: null,
  inicio: "2026-08-10", fim: null, proxima_competencia: "2026-08-01", status: "ativa",
  ...over,
});

describe("geração exata de uma recorrência", () => {
  it("seleciona somente a competência pedida", () => {
    const g = geracaoDaCompetencia(regra(), "2026-10-01");
    expect(g).toEqual({
      valor: 8000,
      vencimento: "2026-10-10",
      competencia: "2026-10-01",
      idempotency_key: "rec:00000000-0000-4000-8000-000000000001:2026-10",
    });
  });

  it("recusa competência fora da cadência", () => {
    expect(geracaoDaCompetencia(regra({ periodicidade: "trimestral" }), "2026-09-01")).toBeNull();
  });

  it("recusa competência depois do fim", () => {
    expect(geracaoDaCompetencia(regra({ fim: "2026-09-30" }), "2026-10-01")).toBeNull();
  });

  it("recusa regra pausada", () => {
    expect(geracaoDaCompetencia(regra({ status: "pausada" }), "2026-08-01")).toBeNull();
  });
});
