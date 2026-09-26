import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Auditoria B · 5 — carimbo do sync do tablet do ponto.
 *
 * `void touchDevice(...)` deixava o UPDATE correndo solto depois da resposta —
 * e a Vercel congela a função assim que a resposta sai, então o "último sync"
 * do tablet podia nunca ser gravado. Trabalho pós-resposta mora em `after()`.
 */

const h = vi.hoisted(() => ({
  pendentes: [] as (() => unknown)[],
  touchDevice: vi.fn(async (_id: string) => {}),
}));

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (fn: () => unknown) => { h.pendentes.push(fn); },
}));
vi.mock("@/lib/device", () => ({
  autenticarDevice: async () => ({ ok: true, device: { id: "tablet-1" } }),
  touchDevice: h.touchDevice,
}));
vi.mock("@/lib/ponto", () => ({
  listPessoas: async () => [{ id: "p1", nome: "Ana", fotoUrl: null, fotos: [], pinHash: null }],
  amostrasPorPessoa: async () => new Map(),
  TabelaAusenteError: class extends Error {},
}));

beforeEach(() => {
  vi.clearAllMocks();
  h.pendentes.length = 0;
});

async function sync() {
  const { GET } = await import("@/app/api/ponto/sync/route");
  return GET(new NextRequest("http://x/api/ponto/sync", { headers: { "x-device-token": "t" } }));
}

describe("GET /api/ponto/sync", () => {
  it("o carimbo do tablet vai pro after(), não fica solto depois da resposta", async () => {
    const r = await sync();
    expect(r.status).toBe(200);
    expect(h.pendentes).toHaveLength(1);
    expect(h.touchDevice).not.toHaveBeenCalled();
    await h.pendentes[0]();
    expect(h.touchDevice).toHaveBeenCalledWith("tablet-1");
  });

  it("falha no carimbo não vira rejeição solta", async () => {
    h.touchDevice.mockRejectedValueOnce(new Error("rede"));
    await sync();
    await expect(Promise.resolve().then(() => h.pendentes[0]())).resolves.toBeUndefined();
  });
});
