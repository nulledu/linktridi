import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A comissão não pode segurar a folha.
 *
 * `comissoesPorPessoa` chama `snapshotVendas`, que agrega as vendas do mês
 * inteiro. Medido contra a produção: **4,7 s** — dentro do `Promise.all` da
 * página de Colaboradores, ou seja, a tela de salários não pintava nada antes
 * disso. Com lambda fria vira "Colaboradores não entra nunca".
 *
 * O `try/catch` que já existia cobria a FALHA e não cobria a DEMORA, que é o
 * caso comum. Comissão é informação a mais na ficha; fazer a folha esperar por
 * ela troca um problema pequeno por um grande.
 */

const marketing = vi.hoisted(() => ({ get: vi.fn() }));
const vendas = vi.hoisted(() => ({ snapshot: vi.fn() }));

vi.mock("@/lib/marketing-config", () => ({ getMarketingConfig: marketing.get }));
vi.mock("@/lib/trafego-vendas", () => ({ snapshotVendas: vendas.snapshot }));

const ACORDO = {
  id: "a1", nome: "Gestor", pessoaId: "p1", ativa: true,
  pctFaturamento: 1, pctEficiencia: 0,
};

beforeEach(() => {
  // `resetModules` dá um módulo novo (e um cache novo), mas NÃO zera a
  // contagem dos espiões — sem isto, "chamou 1 vez" soma as chamadas dos
  // testes anteriores e o teste do cache passa a medir a suíte, não o cache.
  vi.clearAllMocks();
  vi.resetModules();
  marketing.get.mockResolvedValue({ comissoes: [ACORDO] });
  vendas.snapshot.mockResolvedValue({
    faturamentoTrafego: 100000, faturamentoEmpresa: 200000, gastoComImposto: 10000,
  });
});

describe("comissoesPorPessoa", () => {
  it("devolve o valor quando a conta chega a tempo", async () => {
    const { comissoesPorPessoa } = await import("@/lib/comissao-gestor-servidor");
    const r = await comissoesPorPessoa("mes");
    expect(Object.keys(r)).toEqual(["p1"]);
  });

  it("DESISTE quando a conta demora — a folha abre sem ela", async () => {
    vi.useFakeTimers();
    // Uma conta que nunca termina é o pior caso, e é o que a página vivia.
    vendas.snapshot.mockImplementation(() => new Promise(() => {}));
    const { comissoesPorPessoa } = await import("@/lib/comissao-gestor-servidor");
    const p = comissoesPorPessoa("mes");
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(p).resolves.toEqual({});
    vi.useRealTimers();
  });

  it("a conta CONTINUA depois da desistência — é o que aquece o cache", async () => {
    let terminar: (v: unknown) => void = () => {};
    vendas.snapshot.mockImplementation(() => new Promise((r) => { terminar = r; }));
    const { comissoesPorPessoa } = await import("@/lib/comissao-gestor-servidor");

    vi.useFakeTimers();
    const primeira = comissoesPorPessoa("mes");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await primeira, "a primeira desiste").toEqual({});
    vi.useRealTimers();

    // A conta termina depois; a próxima abertura encontra o resultado pronto.
    terminar({ faturamentoTrafego: 100000, faturamentoEmpresa: 200000, gastoComImposto: 10000 });
    await new Promise((r) => setTimeout(r, 10));
    expect(Object.keys(await comissoesPorPessoa("mes"))).toEqual(["p1"]);
  });

  it("LEMBRA: a segunda chamada não refaz a conta", async () => {
    const { comissoesPorPessoa } = await import("@/lib/comissao-gestor-servidor");
    await comissoesPorPessoa("mes");
    await comissoesPorPessoa("mes");
    await comissoesPorPessoa("mes");
    expect(vendas.snapshot, "recontou o mês a cada abertura").toHaveBeenCalledTimes(1);
  });

  it("falhar continua devolvendo {} — a folha nunca cai por causa disto", async () => {
    vendas.snapshot.mockRejectedValue(new Error("Meta fora do ar"));
    const { comissoesPorPessoa } = await import("@/lib/comissao-gestor-servidor");
    await expect(comissoesPorPessoa("mes")).resolves.toEqual({});
  });

  it("sem acordo ativo não chega a consultar vendas", async () => {
    marketing.get.mockResolvedValue({ comissoes: [{ ...ACORDO, ativa: false }] });
    const { comissoesPorPessoa } = await import("@/lib/comissao-gestor-servidor");
    await expect(comissoesPorPessoa("mes")).resolves.toEqual({});
    expect(vendas.snapshot).not.toHaveBeenCalled();
  });
});
