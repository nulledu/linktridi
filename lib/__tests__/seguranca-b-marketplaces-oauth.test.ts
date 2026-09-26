import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Auditoria B · 3 — OAuth dos marketplaces sem `state` conferido.
 *
 * A rota que inicia gerava um state e jogava fora; o callback aceitava qualquer
 * `code`, de qualquer pessoa logada. Um link forjado fazia o navegador de um
 * admin amarrar ao sistema a conta do Mercado Livre de OUTRA pessoa (CSRF de
 * login). E um upsert que falhava ainda redirecionava dizendo "conectado".
 */

const h = vi.hoisted(() => ({
  perfil: { id: "adm" } as { id: string } | null,
  upsert: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/require-auth", () => ({ getProfileForModule: async () => h.perfil }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({ from: () => ({ upsert: h.upsert }) }),
}));

const TOKEN_ML = { access_token: "AT", refresh_token: "RT", user_id: 42, expires_in: 21600 };

beforeEach(() => {
  vi.clearAllMocks();
  h.perfil = { id: "adm" };
  h.upsert.mockResolvedValue({ error: null });
  h.fetch.mockImplementation(async () =>
    new Response(JSON.stringify(TOKEN_ML), { headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", h.fetch);
  process.env.ML_CLIENT_ID = "cid";
  process.env.ML_CLIENT_SECRET = "csec";
});
afterEach(() => { vi.unstubAllGlobals(); });

async function callback(qs: string, cookie?: string, provider = "mercado_livre") {
  const { GET } = await import("@/app/api/marketplaces/[provider]/oauth/callback/route");
  const req = new NextRequest(`http://x/api/marketplaces/${provider}/oauth/callback?${qs}`, cookie ? { headers: { cookie } } : undefined);
  return GET(req, { params: Promise.resolve({ provider }) });
}

describe("OAuth dos marketplaces — state amarrado ao navegador que começou", () => {
  it("iniciar a conexão guarda o state num cookie httpOnly (provider junto)", async () => {
    const { POST } = await import("@/app/api/marketplaces/route");
    const r = await POST(new NextRequest("http://x/api/marketplaces", {
      method: "POST", body: JSON.stringify({ provider: "mercado_livre" }), headers: { "content-type": "application/json" },
    }));
    expect(r.status).toBe(200);
    const j = await r.json();
    const c = r.cookies.get("mkt_oauth_state");
    expect(c?.value).toBe(`mercado_livre.${j.state}`);
    expect(c?.httpOnly).toBe(true);
    expect(j.authorizeUrl).toContain(`state=${j.state}`);
  });

  it("callback sem o cookie → 400, e nada é trocado nem gravado", async () => {
    const r = await callback("code=abc&state=s1");
    expect(r.status).toBe(400);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("state diferente do cookie → 400", async () => {
    expect((await callback("code=abc&state=s2", "mkt_oauth_state=mercado_livre.s1")).status).toBe(400);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("cookie de OUTRO provider não serve", async () => {
    expect((await callback("code=abc&state=s1", "mkt_oauth_state=tiktok_shop.s1")).status).toBe(400);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("sem a permissão de Marketplaces → 403 (mesmo portão de quem inicia)", async () => {
    h.perfil = null;
    const r = await callback("code=abc&state=s1", "mkt_oauth_state=mercado_livre.s1");
    expect(r.status).toBe(403);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("state certo: troca o code COM prazo, grava e só então diz conectado", async () => {
    const r = await callback("code=abc&state=s1", "mkt_oauth_state=mercado_livre.s1");
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toContain("mkt=conectado");
    const init = h.fetch.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(h.upsert).toHaveBeenCalledOnce();
    // State é de uso único.
    expect(r.cookies.get("mkt_oauth_state")?.value ?? "").toBe("");
  });

  it("upsert que falha NÃO redireciona dizendo conectado", async () => {
    h.upsert.mockResolvedValueOnce({ error: { message: "violates check constraint" } });
    const r = await callback("code=abc&state=s1", "mkt_oauth_state=mercado_livre.s1");
    expect(r.status).toBe(500);
    expect(r.headers.get("location")).toBeNull();
  });
});
