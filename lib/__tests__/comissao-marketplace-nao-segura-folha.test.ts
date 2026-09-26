import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A comissão do marketplace não pode segurar a folha — a mesma trava da
 * comissão de tráfego (`comissao-nao-segura-folha.test.ts`), pelo mesmo
 * motivo: `snapshotVendas` agrega o mês inteiro e levou 4,7 s contra a
 * produção dentro do `Promise.all` da página de Colaboradores.
 */

const marketing = vi.hoisted(() => ({ get: vi.fn() }));
const vendas = vi.hoisted(() => ({ snapshot: vi.fn() }));

vi.mock("@/lib/marketing-config", () => ({ getMarketingConfig: marketing.get }));
vi.mock("@/lib/trafego-vendas", () => ({ snapshotVendas: vendas.snapshot }));

const ACORDO = { pessoaId: "p1", pct: 2.5, ativa: true };
const SNAP = { marketplaceValor: 2028.5, marketplaceN: 39 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  marketing.get.mockResolvedValue({ marketplaceGestor: ACORDO });
  vendas.snapshot.mockResolvedValue(SNAP);
});

describe("comissaoMarketplaceDoMes", () => {
  it("devolve a conta quando chega a tempo — % do bruto, com a base junto", async () => {
    const { comissaoMarketplaceDoMes } = await import("@/lib/comissao-marketplace-servidor");
    const r = await comissaoMarketplaceDoMes("2026-08");
    expect(r).toMatchObject({ pessoaId: "p1", pct: 2.5, faturamento: 2028.5, pedidos: 39, valor: 50.71 });
    // Mês fechado: pede exatamente 1º a 31 de agosto.
    expect(vendas.snapshot).toHaveBeenCalledWith("2026-08-01", "2026-08-31");
  });

  it("DESISTE quando a conta demora — a folha abre sem ela", async () => {
    vi.useFakeTimers();
    vendas.snapshot.mockImplementation(() => new Promise(() => {}));
    const { comissaoMarketplaceDoMes } = await import("@/lib/comissao-marketplace-servidor");
    const p = comissaoMarketplaceDoMes("mes");
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(p).resolves.toBeNull();
    vi.useRealTimers();
  });

  it("LEMBRA: a segunda chamada não refaz a conta", async () => {
    const { comissaoMarketplaceDoMes } = await import("@/lib/comissao-marketplace-servidor");
    await comissaoMarketplaceDoMes("mes");
    await comissaoMarketplaceDoMes("mes");
    await comissaoMarketplaceDoMes("mes");
    expect(vendas.snapshot, "recontou o mês a cada abertura").toHaveBeenCalledTimes(1);
  });

  it("falhar devolve null — a folha nunca cai por causa disto", async () => {
    vendas.snapshot.mockRejectedValue(new Error("ERP fora do ar"));
    const { comissaoMarketplaceDoMes } = await import("@/lib/comissao-marketplace-servidor");
    await expect(comissaoMarketplaceDoMes("mes")).resolves.toBeNull();
  });

  it("sem acordo ativo (ou sem pessoa) não chega a consultar vendas", async () => {
    marketing.get.mockResolvedValue({ marketplaceGestor: { ...ACORDO, ativa: false } });
    const { comissaoMarketplaceDoMes } = await import("@/lib/comissao-marketplace-servidor");
    await expect(comissaoMarketplaceDoMes("mes")).resolves.toBeNull();
    expect(vendas.snapshot).not.toHaveBeenCalled();
  });
});
