import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

/**
 * As rotas de máquina são públicas no middleware (o cron e o webhook chegam sem
 * cookie), então o segredo conferido DENTRO da rota é o único portão. Fail-open
 * ("sem CRON_SECRET = liberado") nessas rotas é a internet inteira disparando
 * o sync do ERP, a renovação de token da Meta e a faxina de selfie do ponto.
 *
 * O trabalho de cada rota é dublê: o teste só olha se ele foi ou não chamado.
 */

const m = vi.hoisted(() => ({
  buildErpSnapshot: vi.fn(), refreshAllTokens: vi.fn(), syncFatia: vi.fn(), statusSync: vi.fn(),
  buildAdsOverview: vi.fn(), limparSelfies: vi.fn(), addLeadX1: vi.fn(),
  getProfileForModule: vi.fn(), sincronizarYampi: vi.fn(),
}));

vi.mock("@/lib/erp", () => ({ buildErpSnapshot: m.buildErpSnapshot }));
vi.mock("@/lib/logistica", () => ({ persistLogisticaSnapshot: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => { throw new Error("o teste não vai ao banco"); },
}));
vi.mock("@/lib/meta-tokens", () => ({ refreshAllTokens: m.refreshAllTokens }));
vi.mock("@/lib/meta-warehouse", () => ({
  syncFatia: m.syncFatia, statusSync: m.statusSync, rodadaDeSync: () => 1,
}));
vi.mock("@/lib/meta-ads", () => ({ buildAdsOverview: m.buildAdsOverview }));
vi.mock("@/lib/ponto", () => ({ limparSelfies: m.limparSelfies }));
vi.mock("@/lib/comercial", () => ({ addLeadX1: m.addLeadX1 }));
vi.mock("@/lib/yampi-warehouse", () => ({ sincronizarYampi: m.sincronizarYampi }));
vi.mock("@/lib/yampi-api", () => ({ yampiConfigurado: () => true, lojasConfiguradas: () => ["loja"] }));
vi.mock("@/lib/require-auth", () => ({ getProfileForModule: m.getProfileForModule }));

const RAIZ = process.cwd();
const CRONS = (JSON.parse(readFileSync(join(RAIZ, "vercel.json"), "utf8")) as { crons: { path: string }[] })
  .crons.map((c) => c.path);

const SEGREDO = "cron-0123456789abcdef";

type Rota = { GET: (req: NextRequest) => Promise<Response> };
const CASOS: { rota: string; carregar: () => Promise<Rota>; trabalho: () => ReturnType<typeof vi.fn> }[] = [
  { rota: "/api/sync", carregar: () => import("@/app/api/sync/route"), trabalho: () => m.buildErpSnapshot },
  { rota: "/api/meta/refresh", carregar: () => import("@/app/api/meta/refresh/route"), trabalho: () => m.refreshAllTokens },
  { rota: "/api/trafego/sync", carregar: () => import("@/app/api/trafego/sync/route"), trabalho: () => m.syncFatia },
  { rota: "/api/trafego/warm", carregar: () => import("@/app/api/trafego/warm/route"), trabalho: () => m.buildAdsOverview },
  { rota: "/api/ponto/limpeza", carregar: () => import("@/app/api/ponto/limpeza/route"), trabalho: () => m.limparSelfies },
  { rota: "/api/yampi/sync", carregar: () => import("@/app/api/yampi/sync/route"), trabalho: () => m.sincronizarYampi },
];

const req = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) =>
  new NextRequest(`https://gaius.vercel.app${url}`, init);

beforeEach(() => {
  vi.clearAllMocks();
  // Vazio = "não configurado" pras rotas (`!secret`).
  vi.stubEnv("CRON_SECRET", "");
  vi.stubEnv("CONVERSAS_WORKER_TOKEN", "");
  vi.stubEnv("X1_WEBHOOK_SECRET", "");
  vi.stubEnv("META_APP_SECRET", "meta-app-secret");
  m.getProfileForModule.mockResolvedValue(null);           // sem sessão
  m.buildErpSnapshot.mockRejectedValue(new Error("parou no ERP"));
  m.refreshAllTokens.mockResolvedValue({ ok: true });
  m.syncFatia.mockResolvedValue({ processadas: 0, restantes: 0, linhas: 0, erros: [] });
  m.statusSync.mockResolvedValue([]);
  m.buildAdsOverview.mockResolvedValue(null);
  m.limparSelfies.mockResolvedValue({ apagadas: 0 });
  m.sincronizarYampi.mockResolvedValue([{ loja: "loja", pedidos: 0 }]);
  m.addLeadX1.mockResolvedValue({ ok: true, id: "l1" });
});
afterEach(() => vi.unstubAllEnvs());

describe("o vercel.json não tem cron sem teste de portão", () => {
  it("todo cron fora do prefixo próprio (-cron) está nos casos abaixo", () => {
    const cobertos = new Set(CASOS.map((c) => c.rota));
    const soltos = CRONS.filter((p) => !p.endsWith("-cron") && !cobertos.has(p));
    expect(soltos, "cron novo no vercel.json: acrescente aos CASOS deste teste").toEqual([]);
  });
});

describe("sem CRON_SECRET configurado a rota de cron recusa todo mundo", () => {
  it.each(CASOS.map((c) => [c.rota, c] as const))("%s", async (_rota, c) => {
    const { GET } = await c.carregar();
    const r = await GET(req(c.rota));
    expect([401, 403], `${c.rota} respondeu ${r.status} sem segredo nenhum`).toContain(r.status);
    expect(c.trabalho()).not.toHaveBeenCalled();
  });
});

describe("com CRON_SECRET configurado", () => {
  it.each(CASOS.map((c) => [c.rota, c] as const))("%s: segredo errado recusa, certo trabalha", async (_rota, c) => {
    vi.stubEnv("CRON_SECRET", SEGREDO);
    const { GET } = await c.carregar();
    const errado = await GET(req(c.rota, { headers: { authorization: "Bearer outro-segredo-qualquer" } }));
    expect([401, 403]).toContain(errado.status);
    expect(c.trabalho()).not.toHaveBeenCalled();
    await GET(req(c.rota, { headers: { authorization: `Bearer ${SEGREDO}` } }));
    expect(c.trabalho(), `${c.rota} recusou o segredo certo — o portão virou "nega sempre"`).toHaveBeenCalled();
  });
});

describe("/api/trafego/sync: o botão Atualizar da Tridify entra pela sessão", () => {
  it("sem segredo e sem sessão → 401; com a área trafego → sincroniza", async () => {
    const { GET } = await import("@/app/api/trafego/sync/route");
    expect((await GET(req("/api/trafego/sync?agora=1&period=hoje"))).status).toBe(401);
    expect(m.syncFatia).not.toHaveBeenCalled();

    m.getProfileForModule.mockResolvedValue({ id: "u1" });
    expect((await GET(req("/api/trafego/sync?agora=1&period=hoje"))).status).toBe(200);
    expect(m.getProfileForModule).toHaveBeenCalledWith("trafego");
    expect(m.syncFatia).toHaveBeenCalled();
  });

  it("?status=1 e o backfill (POST) exigem a área — o segredo do cron não basta", async () => {
    vi.stubEnv("CRON_SECRET", SEGREDO);
    const { GET, POST } = await import("@/app/api/trafego/sync/route");
    const auth = { authorization: `Bearer ${SEGREDO}` };
    expect((await GET(req("/api/trafego/sync?status=1", { headers: auth }))).status).toBe(403);
    const corpo = JSON.stringify({ since: "2026-09-01", until: "2026-09-02" });
    expect((await POST(req("/api/trafego/sync", { method: "POST", headers: auth, body: corpo }))).status).toBe(403);
    expect(m.statusSync).not.toHaveBeenCalled();
    expect(m.syncFatia).not.toHaveBeenCalled();
  });
});

describe("/api/webhooks/leads-x1: segredo só do env, fail-closed", () => {
  const corpo = JSON.stringify({ telefone: "11999998888", nome: "Ana" });
  const post = (url: string, headers: Record<string, string> = {}) =>
    req(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: corpo });

  it("não existe segredo de reserva escrito no código", () => {
    const src = readFileSync(join(RAIZ, "app/api/webhooks/leads-x1/route.ts"), "utf8");
    expect(src, "fallback literal do segredo: está no git, não autoriza nada").not.toMatch(/X1_WEBHOOK_SECRET\s*(\|\||\?\?)\s*["'`]/);
  });

  it("sem X1_WEBHOOK_SECRET → 503 pra qualquer token, e o Facebook não recebe o challenge", async () => {
    const { POST, GET } = await import("@/app/api/webhooks/leads-x1/route");
    expect((await POST(post("/api/webhooks/leads-x1?token=qualquer"))).status).toBe(503);
    expect((await POST(post("/api/webhooks/leads-x1", { "x-webhook-secret": "qualquer" }))).status).toBe(503);
    expect(m.addLeadX1).not.toHaveBeenCalled();
    const g = await GET(req("/api/webhooks/leads-x1?hub.mode=subscribe&hub.verify_token=qualquer&hub.challenge=42"));
    expect(await g.text()).not.toBe("42");
  });

  it("com o segredo: token certo (query ou header) grava; errado recusa", async () => {
    vi.stubEnv("X1_WEBHOOK_SECRET", "x1-segredo-de-teste-123");
    const { POST, GET } = await import("@/app/api/webhooks/leads-x1/route");
    expect((await POST(post("/api/webhooks/leads-x1?token=errado"))).status).toBe(401);
    expect(m.addLeadX1).not.toHaveBeenCalled();
    expect((await POST(post("/api/webhooks/leads-x1?token=x1-segredo-de-teste-123"))).status).toBe(200);
    expect((await POST(post("/api/webhooks/leads-x1", { "x-webhook-secret": "x1-segredo-de-teste-123" }))).status).toBe(200);
    expect(m.addLeadX1).toHaveBeenCalledTimes(2);

    const ok = await GET(req("/api/webhooks/leads-x1?hub.mode=subscribe&hub.verify_token=x1-segredo-de-teste-123&hub.challenge=42"));
    expect(await ok.text()).toBe("42");
    const nao = await GET(req("/api/webhooks/leads-x1?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=42"));
    expect(await nao.text()).not.toBe("42");
  });
});

describe("nenhuma rota de cron faz fail-open", () => {
  const FAIL_OPEN = /if\s*\(\s*!\s*secret\s*\)\s*return\s+true/;
  // Crons de OUTRO dono que ainda liberam geral sem CRON_SECRET. Moram em
  // prefixo público próprio, então hoje, sem o env, qualquer um dispara. Ficam
  // fora desta verificação até receberem o mesmo fail-closed (motivo: fora do
  // escopo da correção dos crons barrados pelo middleware).
  const PENDENTES = new Set(["/api/financeiro-cron", "/api/lojas-cron", "/api/contingencia-cron"]);

  it.each(CRONS.filter((p) => !PENDENTES.has(p)))("%s", (path) => {
    const src = readFileSync(join(RAIZ, "app", path, "route.ts"), "utf8");
    expect(src, `${path} libera geral quando CRON_SECRET falta`).not.toMatch(FAIL_OPEN);
  });
});
