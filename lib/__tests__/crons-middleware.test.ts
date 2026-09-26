import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";

/**
 * Os crons do vercel.json chegam SEM cookie. Com o gate de sessão do middleware
 * na frente, 5 dos 9 levavam 401 antes de a rota conferir o CRON_SECRET — a
 * renovação semanal do token da Meta, o aquecimento do Tráfego e o sync noturno
 * do warehouse nunca rodaram, e ninguém via: resposta de cron não aparece em tela.
 *
 * Aqui o middleware roda DE VERDADE (só o cliente do Supabase é dublê), com o
 * env de auth ligado — então qualquer rota que não seja pública leva o 401.
 */

const auth = vi.hoisted(() => ({ getClaims: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth }) }));

const RAIZ = process.cwd();
const CRONS = (JSON.parse(readFileSync(join(RAIZ, "vercel.json"), "utf8")) as { crons: { path: string }[] })
  .crons.map((c) => c.path);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemplo.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  auth.getClaims.mockReset();
  // Sem cookie o getSession não acha sessão: `{ data: null, error: null }`.
  auth.getClaims.mockResolvedValue({ data: null, error: null });
});
afterEach(() => vi.unstubAllEnvs());

async function passar(path: string, cookie?: string) {
  const { middleware } = await import("@/middleware");
  const headers: Record<string, string> = cookie ? { cookie } : {};
  return middleware(new NextRequest(`https://gaius.vercel.app${path}`, { headers }));
}
/** `NextResponse.next()`: a requisição seguiu pra rota. */
const seguiu = (r: Response) => r.status === 200 && r.headers.get("x-middleware-next") === "1";

describe("crons do vercel.json passam pelo middleware sem cookie", () => {
  it("o vercel.json tem crons (senão o teste abaixo não prova nada)", () => {
    expect(CRONS.length).toBeGreaterThan(0);
  });

  it.each(CRONS)("%s", async (path) => {
    const r = await passar(path);
    expect(r.status, `${path} levou ${r.status} do middleware — o cron morre antes de a rota conferir o CRON_SECRET`).not.toBe(401);
    expect(seguiu(r)).toBe(true);
  });

  it("o webhook de leads X1 também (Facebook/Zapier não têm cookie)", async () => {
    expect(seguiu(await passar("/api/webhooks/leads-x1"))).toBe(true);
  });

  it("controle: rota protegida sem cookie continua levando 401", async () => {
    expect((await passar("/api/tarefas")).status).toBe(401);
  });

  it("rota de máquina sai antes de montar o cliente do Supabase", async () => {
    for (const p of [...CRONS, "/api/webhooks/leads-x1"]) await passar(p);
    expect(auth.getClaims).not.toHaveBeenCalled();
  });
});

describe("a abertura é por caminho EXATO, não por prefixo", () => {
  // `/api/trafego/sync` é público porque a ROTA se autentica sozinha. Nada
  // abaixo nem ao lado dele herda isso.
  it.each([
    "/api/sync/x", "/api/syncx", "/api/meta/refresh/x", "/api/meta/connections",
    "/api/trafego", "/api/trafego/sync/x", "/api/trafego/syncx", "/api/trafego/warm/x",
    "/api/tridichat/fila", "/api/tridichat/fila/drenar/x", "/api/tridichat/conversas",
    "/api/webhooks", "/api/webhooks/leads-x1/x", "/api/webhooks/outro",
  ])("%s continua exigindo sessão", async (path) => {
    expect((await passar(path)).status).toBe(401);
  });
});

describe("blip de rede no auth não vira 'deslogado'", () => {
  // `getClaims()` NÃO lança num AuthRetryableFetchError (refresh do token ou
  // JWKS que falhou por rede): devolve `{ data: null, error }`. Ler isso como
  // "sem sessão" dava 401/login pra quem tem refresh token válido — e o
  // auth-cache guardava o null por 30 s.
  it("API segue pra rota, que confere a sessão de novo", async () => {
    auth.getClaims.mockResolvedValueOnce({ data: null, error: new AuthRetryableFetchError("fetch failed", 0) });
    const r = await passar("/api/tarefas", "sb-ref-auth-token=blip-1");
    expect(r.status).not.toBe(401);
    expect(seguiu(r)).toBe(true);
  });

  it("página não é mandada pro /login", async () => {
    auth.getClaims.mockResolvedValueOnce({ data: null, error: new AuthRetryableFetchError("gateway", 503) });
    const r = await passar("/central", "sb-ref-auth-token=blip-2");
    expect(r.headers.get("location")).toBeNull();
    expect(seguiu(r)).toBe(true);
  });

  it("o blip NÃO fica no cache: o mesmo cookie é verificado de novo na próxima", async () => {
    auth.getClaims
      .mockResolvedValueOnce({ data: null, error: new AuthRetryableFetchError("fetch failed", 0) })
      .mockResolvedValueOnce({ data: { claims: { sub: "u1" } }, error: null });
    await passar("/api/tarefas", "sb-ref-auth-token=blip-3");
    const r = await passar("/api/tarefas", "sb-ref-auth-token=blip-3");
    expect(auth.getClaims).toHaveBeenCalledTimes(2);
    expect(seguiu(r)).toBe(true);
  });

  it("token inválido de verdade continua sendo 401", async () => {
    auth.getClaims.mockResolvedValueOnce({
      data: null, error: new AuthApiError("Invalid Refresh Token", 400, "refresh_token_not_found"),
    });
    expect((await passar("/api/tarefas", "sb-ref-auth-token=invalido-1")).status).toBe(401);
  });
});
