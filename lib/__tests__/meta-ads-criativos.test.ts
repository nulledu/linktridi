import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => ({ row: null as null | { data: unknown; updated_at: string } }));

const anuncios = Array.from({ length: 120 }, (_, index) => ({
  accountId: "1",
  id: `alto-${index}`,
  name: `Criativo alto ${index}`,
  campaign: "Campanha",
  spend: 1_000 - index,
  impressions: 10_000,
  clicks: 100,
  reach: 0,
  purchases: 0,
  revenue: 0,
  leads: 0,
}));
anuncios.push({
  accountId: "1",
  id: "campeao-vendas",
  name: "Campeão de vendas",
  campaign: "Campanha",
  spend: 1,
  impressions: 100,
  clicks: 20,
  reach: 0,
  purchases: 9,
  revenue: 900,
  leads: 0,
});

vi.mock("@/lib/meta", () => ({
  listAccounts: async () => [{ account_id: "1", name: "Conta", token: "token" }],
}));
vi.mock("@/lib/marketing-config", () => ({
  getMarketingConfig: async () => ({ contas: {} }),
}));
vi.mock("@/lib/meta-warehouse", () => ({
  arvoreLocal: async () => ({
    campanhas: [{ accountId: "1", id: "camp-1", name: "Campanha", spend: 1_001, impressions: 10_100, clicks: 120, reach: 0, purchases: 9, revenue: 900, leads: 0, lpv: 0, addCart: 0, checkout: 0, spark: [] }],
    conjuntos: [],
    anuncios,
  }),
  totaisDoPeriodo: async () => null,
  serieDiariaLocal: async () => null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: cache.row, error: null }),
        upsert: async () => ({ error: null }),
      };
      return query;
    },
  }),
}));

import { buildAdsOverview } from "../meta-ads";

beforeEach(() => { cache.row = null; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("biblioteca de criativos", () => {
  it("não elimina o campeão de vendas só porque ele investiu menos", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("?ids=")) {
        const ids = decodeURIComponent(new URL(url).searchParams.get("ids") ?? "").split(",");
        return { json: async () => Object.fromEntries(ids.map((id) => [id, { creative: {} }])) } as Response;
      }
      if (url.includes("time_increment=1")) return { json: async () => ({ data: [] }) } as Response;
      return { json: async () => ({ data: [{ spend: "1001", impressions: "10100", clicks: "120", actions: [{ action_type: "omni_purchase", value: "9" }], action_values: [{ action_type: "omni_purchase", value: "900" }] }] }) } as Response;
    }));

    const overview = await buildAdsOverview("2026-09-08", "2026-09-08", "Hoje", { recalcular: true });

    expect(overview?.anuncios.some((ad) => ad.id === "campeao-vendas")).toBe(true);
  });

  it("ignora cache antigo que ainda contém a biblioteca cortada por investimento", async () => {
    cache.row = {
      updated_at: new Date().toISOString(),
      data: {
        updatedAt: new Date().toISOString(),
        periodLabel: "Período antigo",
        kpis: {},
        campaigns: [],
        conjuntos: [],
        anuncios: [],
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("?ids=")) {
        const ids = decodeURIComponent(new URL(url).searchParams.get("ids") ?? "").split(",");
        return { json: async () => Object.fromEntries(ids.map((id) => [id, { creative: {} }])) } as Response;
      }
      if (url.includes("time_increment=1")) return { json: async () => ({ data: [] }) } as Response;
      return { json: async () => ({ data: [{ spend: "1001", impressions: "10100", clicks: "120", actions: [{ action_type: "omni_purchase", value: "9" }], action_values: [{ action_type: "omni_purchase", value: "900" }] }] }) } as Response;
    }));

    const overview = await buildAdsOverview("2026-09-07", "2026-09-07", "Ontem");

    expect(overview?.anuncios.some((ad) => ad.id === "campeao-vendas")).toBe(true);
  });
});
