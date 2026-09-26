import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A comissão de VENDAS vem da planilha do ERP (`comercial_planilha_mes`):
 * soma do `valor_comissao` por vendedora nos pagamentos do mês. E, como as
 * outras duas, não pode segurar a folha.
 */

const supa = vi.hoisted(() => ({ employees: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({ select: () => ({ in: () => ({ limit: supa.employees }) }) }),
  }),
}));

const fetchMock = vi.fn();
const PLANILHA = [
  { responsavel_id: "erp-paola", valor_comissao: 4 },
  { responsavel_id: "erp-paola", valor_comissao: 2.5 },
  { responsavel_id: "erp-vitoria", valor_comissao: 10 },
  { responsavel_id: null, valor_comissao: 99 },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => PLANILHA });
  supa.employees.mockResolvedValue({
    data: [{ id: "p-paola", erp_user_id: "erp-paola" }, { id: "p-vitoria", erp_user_id: "erp-vitoria" }],
  });
});

describe("comissoesVendasPorPessoa", () => {
  it("soma o valor_comissao por vendedora e indexa pela pessoa do app", async () => {
    const { comissoesVendasPorPessoa } = await import("@/lib/comissao-vendas-servidor");
    const r = await comissoesVendasPorPessoa("2026-08");
    expect(r["p-paola"]).toMatchObject({ valor: 6.5, pagamentos: 2, erpUserId: "erp-paola" });
    expect(r["p-vitoria"]).toMatchObject({ valor: 10, pagamentos: 1 });
    // Linha sem responsável não vira comissão de ninguém.
    expect(Object.keys(r)).toHaveLength(2);
  });

  it("pede à planilha o mês fechado pela data de PAGAMENTO, em horário de Brasília", async () => {
    const { comissoesVendasPorPessoa } = await import("@/lib/comissao-vendas-servidor");
    await comissoesVendasPorPessoa("2026-08");
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("comercial_planilha_mes?select=responsavel_id,valor_comissao");
    expect(url).toContain("data_pagamento=gte.2026-08-01T00:00:00-03:00");
    expect(url).toContain("data_pagamento=lt.2026-09-01T00:00:00-03:00");
  });

  it("período que não é AAAA-MM devolve {} sem consultar nada", async () => {
    const { comissoesVendasPorPessoa } = await import("@/lib/comissao-vendas-servidor");
    await expect(comissoesVendasPorPessoa("mes")).resolves.toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DESISTE quando a planilha demora — a folha abre sem ela", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { comissoesVendasPorPessoa } = await import("@/lib/comissao-vendas-servidor");
    const p = comissoesVendasPorPessoa("2026-08");
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(p).resolves.toEqual({});
    vi.useRealTimers();
  });

  it("LEMBRA: a segunda chamada não refaz a conta", async () => {
    const { comissoesVendasPorPessoa } = await import("@/lib/comissao-vendas-servidor");
    await comissoesVendasPorPessoa("2026-08");
    await comissoesVendasPorPessoa("2026-08");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falhar devolve {} — a folha nunca cai por causa disto", async () => {
    fetchMock.mockRejectedValue(new Error("ERP fora do ar"));
    const { comissoesVendasPorPessoa } = await import("@/lib/comissao-vendas-servidor");
    await expect(comissoesVendasPorPessoa("2026-08")).resolves.toEqual({});
  });
});
