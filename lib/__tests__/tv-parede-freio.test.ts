import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Freio por IP das rotas públicas de entrada da TV (`activate`, `registrar`).
 *
 * O balde é um `Map` em memória do processo, chaveado por IP. Ninguém tirava
 * nada de lá: cada IP novo abria uma entrada que durava enquanto a instância
 * vivesse — numa rota PÚBLICA, o tamanho do Map era decidido por quem chama.
 *
 * A poda só entra quando o Map passa de 1000 e só tira o que já venceu: um IP
 * ainda freado continua freado.
 */

// O freio vem antes de qualquer ida ao banco nos casos usados aqui.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => { throw new Error("o freio não chega ao banco neste teste"); },
}));

const pedir = (ip: string, corpo: string) =>
  new Request("http://tv.local/api/tv/device/x", {
    method: "POST",
    body: corpo,
    headers: { "x-forwarded-for": ip },
  }) as unknown as NextRequest;

const T0 = new Date(2026, 8, 9, 10, 0);
const ipDaFrota = (i: number) => `10.0.${i >> 8}.${i & 255}`;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.each([
  {
    nome: "activate",
    carregar: () => import("@/app/api/tv/device/activate/route"),
    corpo: JSON.stringify({ codigo: "" }), // código vazio: consome o freio e volta 401
    teto: 20,
  },
  {
    nome: "registrar",
    carregar: () => import("@/app/api/tv/device/registrar/route"),
    corpo: "não é json", // consome o freio antes de ler o corpo
    teto: 30,
  },
])("freio do $nome", ({ carregar, corpo, teto }) => {
  async function rota() {
    vi.resetModules(); // o balde mora no módulo
    return (await carregar()).POST;
  }

  it("passando de 1000 IPs, os que já venceram saem do Map", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: T0 });
    const POST = await rota();
    for (let i = 0; i < 1001; i++) await POST(pedir(ipDaFrota(i), corpo));

    vi.setSystemTime(new Date(T0.getTime() + 11 * 60_000)); // janela de 10 min vencida
    const apagar = vi.spyOn(Map.prototype, "delete");
    await POST(pedir("192.168.0.1", corpo));

    const podados = apagar.mock.calls.filter(([k]) => typeof k === "string" && k.startsWith("10.0.")).length;
    expect(podados).toBe(1001);
  });

  it("a poda não solta IP ainda freado", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: T0 });
    const POST = await rota();
    for (let i = 0; i < teto; i++) await POST(pedir("10.9.9.9", corpo));
    expect((await POST(pedir("10.9.9.9", corpo))).status).toBe(429);
    for (let i = 0; i < 1001; i++) await POST(pedir(ipDaFrota(i), corpo));

    vi.setSystemTime(new Date(T0.getTime() + 5 * 60_000)); // ainda dentro da janela
    const apagar = vi.spyOn(Map.prototype, "delete");
    await POST(pedir("192.168.0.1", corpo)); // passa do teto → tenta podar

    const podados = apagar.mock.calls.filter(([k]) => typeof k === "string" && /^10\.(0|9)\./.test(k)).length;
    expect(podados).toBe(0);
    expect((await POST(pedir("10.9.9.9", corpo))).status).toBe(429);
  });
});
