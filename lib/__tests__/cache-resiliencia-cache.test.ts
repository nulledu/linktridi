import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Os dois caches em memória (lib/cache e lib/auth-cache) são Maps de módulo.
// Cada teste importa uma cópia nova pra não herdar entradas do anterior, e o
// relógio é de mentira pra "passar" minutos sem esperar.
let agora = 1_000_000;
beforeEach(() => {
  vi.resetModules();
  agora = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => agora);
});
afterEach(() => { vi.restoreAllMocks(); });

const valor = <T,>(v: T) => async () => v;

describe("cached()", () => {
  it("falha (Promise rejeitada) não fica no cache: a próxima chamada tenta de novo", async () => {
    const { cached } = await import("@/lib/cache");
    const fn = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce("ok");
    await expect(cached("k", 30_000, fn)).rejects.toThrow("timeout");
    await expect(cached("k", 30_000, fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // A poda cortava tudo acima de 5 min, mas há quem cacheie por 10: cache
  // válido era jogado fora na primeira vez que o Map enchia.
  it("poda respeita o TTL de cada entrada (cache de 10 min não cai aos 5)", async () => {
    const { cached } = await import("@/lib/cache");
    await cached("longo", 600_000, valor("v1"));
    for (let i = 0; i < 499; i++) await cached(`curto:${i}`, 30_000, valor(i));
    agora += 301_000;                                 // curtos vencidos; o longo não
    await cached("novo", 30_000, valor("n"));         // cheio → poda
    const fn = vi.fn(valor("v2"));
    expect(await cached("longo", 600_000, fn)).toBe("v1");
    expect(fn).not.toHaveBeenCalled();
  });

  // `set` em chave existente mantém a posição original no Map: a entrada mais
  // quente (profile:*, renovada a cada 30s) era a primeira despejada.
  it("chave regravada vai pro fim da fila (a quente não é a primeira despejada)", async () => {
    const { cached } = await import("@/lib/cache");
    await cached("quente", 30_000, valor(1));
    for (let i = 0; i < 499; i++) await cached(`frio:${i}`, 600_000, valor(i));
    agora += 31_000;                                  // a quente venceu → regrava
    await cached("quente", 30_000, valor(2));
    await cached("extra", 600_000, valor("x"));       // cheio, nada vencido → sai a mais antiga
    const fn = vi.fn(valor(3));
    expect(await cached("quente", 30_000, fn)).toBe(2);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("cachedByToken()", () => {
  it("rejeição não fica no cache", async () => {
    const { cachedByToken } = await import("@/lib/auth-cache");
    const fn = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("rede"))
      .mockResolvedValueOnce("u1");
    await expect(cachedByToken("sb=t", fn)).rejects.toThrow("rede");
    await expect(cachedByToken("sb=t", fn)).resolves.toBe("u1");
  });

  it("sessão regravada vai pro fim da fila", async () => {
    const { cachedByToken } = await import("@/lib/auth-cache");
    await cachedByToken("quente", valor(1));
    agora += 20_000;
    for (let i = 0; i < 499; i++) await cachedByToken(`outra:${i}`, valor(i));
    agora += 11_000;                                  // a quente venceu (31s); as outras têm 11s
    await cachedByToken("quente", valor(2));
    await cachedByToken("extra", valor("x"));         // cheio, nada vencido → sai a mais antiga
    const fn = vi.fn(valor(3));
    expect(await cachedByToken("quente", fn)).toBe(2);
    expect(fn).not.toHaveBeenCalled();
  });
});
