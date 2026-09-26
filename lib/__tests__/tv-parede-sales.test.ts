import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/sales — a rota que TODA TV puxa o dia inteiro.
 *
 * Duas coisas que não aparecem lendo o código com pressa:
 *
 *  1. **`Promise.all([f(await a()), b()])` não é paralelo.** O `await` dentro
 *     do primeiro elemento suspende antes de o segundo existir: ERP e Tridify
 *     saíam em fila, somando os dois tempos numa rota de parede.
 *  2. **Cache sem single-flight.** Na virada do minuto, as TVs que chegam
 *     juntas encontravam o cache vencido e CADA UMA remontava ERP + Tridify.
 *     O cache tem que guardar a promessa em voo, não só o resultado.
 */

const m = vi.hoisted(() => ({ erp: vi.fn(), tridify: vi.fn(), reserva: vi.fn() }));
vi.mock("@/lib/erp", () => ({ buildErpSnapshot: m.erp }));
vi.mock("@/lib/painel-tridify", () => ({ resumoTridifyDoMes: m.tridify }));
vi.mock("@/lib/datasource", () => ({ getDataSource: () => ({ getSales: m.reserva }) }));
// Sem Supabase: `mergeGoals` segue sem metas (é o caminho tolerante dele).
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => { throw new Error("sem supabase no teste"); },
}));

function adiado<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
const snap = () => ({
  updatedAt: "2026-09-09T13:00:00.000Z",
  salespeople: [],
  teams: [{ id: "marketing", name: "Marketing", current: 10, goal: 100, progressPct: 10 }],
});
const fila = () => new Promise((r) => setTimeout(r, 0));

// Módulo novo a cada teste: o cache mora no módulo (e no `lib/cache`).
async function rota() {
  vi.resetModules();
  return (await import("@/app/api/sales/route")).GET;
}

beforeEach(() => {
  m.erp.mockReset();
  m.tridify.mockReset();
  m.reserva.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

describe("/api/sales", () => {
  it("ERP e Tridify saem juntos, não um depois do outro", async () => {
    const erp = adiado<ReturnType<typeof snap>>();
    m.erp.mockReturnValue(erp.promise);
    m.tridify.mockResolvedValue(null);
    const GET = await rota();

    const resp = GET();
    await fila();
    expect(m.tridify).toHaveBeenCalledTimes(1); // o ERP ainda nem respondeu

    erp.resolve(snap());
    expect((await resp).status).toBe(200);
  });

  it("ticks simultâneos na virada do cache montam o snapshot UMA vez", async () => {
    const erp = adiado<ReturnType<typeof snap>>();
    m.erp.mockReturnValue(erp.promise);
    m.tridify.mockResolvedValue(null);
    const GET = await rota();

    const a = GET();
    const b = GET();
    await fila();
    erp.resolve(snap());
    const [ra, rb] = await Promise.all([a, b]);

    expect(m.erp).toHaveBeenCalledTimes(1);
    expect(m.tridify).toHaveBeenCalledTimes(1);
    expect(await ra.json()).toEqual(await rb.json());
  });

  it("dentro do minuto reaproveita; o formato da resposta não muda", async () => {
    m.erp.mockImplementation(async () => snap());
    m.tridify.mockResolvedValue({ faturamentoTrafego: 50, comercial: 70 });
    const GET = await rota();

    const j1 = await (await GET()).json();
    const j2 = await (await GET()).json();

    expect(m.erp).toHaveBeenCalledTimes(1);
    expect(j2).toEqual(j1);
    expect(j1.tridify).toEqual({ faturamentoTrafego: 50, comercial: 70 });
    expect(j1.teams[0]).toMatchObject({ id: "marketing", current: 50, progressPct: 50 });
    expect(j1.reserva).toBeUndefined();
  });

  it("passado o minuto, monta de novo", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 9, 10, 0) });
    m.erp.mockImplementation(async () => snap());
    m.tridify.mockResolvedValue(null);
    const GET = await rota();

    await GET();
    vi.setSystemTime(new Date(2026, 8, 9, 10, 1, 1));
    await GET();
    expect(m.erp).toHaveBeenCalledTimes(2);
  });

  it("Tridify fora não derruba o snapshot ao vivo", async () => {
    m.erp.mockImplementation(async () => snap());
    m.tridify.mockRejectedValue(new Error("Graph fora"));
    const GET = await rota();

    const j = await (await GET()).json();
    expect(j.tridify).toBeNull();
    expect(j.reserva).toBeUndefined();
  });

  it("ERP fora: responde a reserva ASSINADA e não guarda a falha", async () => {
    m.erp.mockRejectedValueOnce(new Error("erp fora")).mockImplementation(async () => snap());
    m.tridify.mockResolvedValue(null);
    m.reserva.mockResolvedValue({ ...snap(), updatedAt: "ontem" });
    const GET = await rota();

    const j1 = await (await GET()).json();
    expect(j1.reserva).toBe(true);
    const j2 = await (await GET()).json();
    expect(j2.reserva).toBeUndefined();
    expect(m.erp).toHaveBeenCalledTimes(2);
  });
});
