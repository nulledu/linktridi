import { describe, expect, it } from "vitest";
import { buildCreativeIntelligenceFromRows, type CreativeWarehouseRow } from "../creative-intelligence/server";

const row = (patch: Partial<CreativeWarehouseRow>): CreativeWarehouseRow => ({
  date: "2026-09-01",
  adId: "1",
  adName: "MR 03",
  spend: 100,
  impressions: 1_000,
  clicks: 20,
  purchases: 2,
  revenue: 300,
  landingPageViews: 15,
  initiateCheckout: 4,
  funnelMetricsCollected: true,
  videoPlays: 800,
  videoViews3s: 500,
  videoViews2s: 400,
  videoViews25: 300,
  videoViews50: 200,
  videoViews75: 100,
  videoViews95: 80,
  videoViews100: 70,
  videoAvgWatchTime: 8,
  thruPlays: 160,
  videoMetricsCollected: true,
  ...patch,
});

describe("creative intelligence server transform", () => {
  it("monta detalhe, histórico, benchmark, score e tags no mesmo período", () => {
    const result = buildCreativeIntelligenceFromRows({
      currentKey: "mr 03@2026",
      currentAdIds: ["1", "2"],
      period: { since: "2026-09-01", until: "2026-09-07" },
      rows: [
        row({ adId: "1", date: "2026-09-01" }),
        row({ adId: "2", adName: "MR 03 — Cópia", date: "2026-09-02", spend: 50, revenue: 100, purchases: 1 }),
        row({ adId: "3", adName: "MR 07", clicks: 10, revenue: 100, videoViews2s: 200, thruPlays: 60 }),
        row({ adId: "4", adName: "MR 12", clicks: 30, revenue: 500, videoViews2s: 600, thruPlays: 300 }),
      ],
      marks: new Map([
        ["mr 03@2026", ["UGC", "Curto"]],
        ["mr 07@2026", ["UGC"]],
        ["mr 12@2026", ["Produto"]],
      ]),
    });

    expect(result.current.id).toBe("mr 03@2026");
    expect(result.current.metrics.spend).toBe(150);
    expect(result.current.metrics.roas).toBeCloseTo(400 / 150);
    expect(result.current.metrics.hookRate).toBe(62.5);
    expect(result.history).toHaveLength(2);
    expect(result.peers).toHaveLength(3);
    expect(result.benchmark.sampleSize).toBe(3);
    expect(result.score.overallScore).not.toBeNull();
    expect(result.tags.find((tag) => tag.name === "UGC")?.creativeCount).toBe(2);
    expect(result.period).toEqual({ since: "2026-09-01", until: "2026-09-07" });
  });

  it("preserva ausência histórica de funil e vídeo", () => {
    const result = buildCreativeIntelligenceFromRows({
      currentKey: "imagem 01@2026",
      currentAdIds: ["9"],
      period: { since: "2026-09-01", until: "2026-09-07" },
      rows: [row({
        adId: "9",
        adName: "Imagem 01",
        funnelMetricsCollected: false,
        videoMetricsCollected: false,
        landingPageViews: 0,
        initiateCheckout: 0,
        videoPlays: null,
        videoViews3s: null,
        videoViews2s: null,
        videoViews25: null,
        videoViews50: null,
        videoViews75: null,
        videoViews95: null,
        videoViews100: null,
        videoAvgWatchTime: null,
        thruPlays: null,
      })],
      marks: new Map(),
    });

    expect(result.current.metrics.landingPageViews).toBeNull();
    expect(result.current.metrics.initiateCheckout).toBeNull();
    expect(result.current.metrics.hookRate).toBeNull();
    expect(result.current.metrics.holdRate).toBeNull();
  });

  it("não mistura dias coletados com dias antigos sem métricas de vídeo", () => {
    const result = buildCreativeIntelligenceFromRows({
      currentKey: "mr 03@2026",
      currentAdIds: ["1"],
      period: { since: "2026-08-31", until: "2026-09-01" },
      rows: [
        row({ date: "2026-08-31", videoMetricsCollected: false, videoPlays: null, videoViews3s: null, thruPlays: null }),
        row({ date: "2026-09-01", videoPlays: 800, videoViews3s: 400, thruPlays: 100 }),
      ],
      marks: new Map(),
    });

    expect(result.current.metrics.videoPlays).toBeNull();
    expect(result.current.metrics.hookRate).toBeNull();
    expect(result.current.metrics.holdRate).toBeNull();
    expect(result.partial).toBe(true);
  });

  it("soma o engajamento e não inventa zero em dia gravado antes do SQL", () => {
    const base = { currentKey: "mr 03@2026", currentAdIds: ["1"], period: { since: "2026-08-31", until: "2026-09-01" }, marks: new Map<string, string[]>() };
    const completo = buildCreativeIntelligenceFromRows({
      ...base,
      rows: [
        row({ date: "2026-08-31", engagementMetricsCollected: true, reactions: 10, comments: 2, shares: 1 }),
        row({ date: "2026-09-01", engagementMetricsCollected: true, reactions: 5, comments: 0, shares: 3 }),
      ],
    });
    expect(completo.current.metrics).toMatchObject({ reactions: 15, comments: 2, shares: 4 });
    expect(completo.partial).toBe(false);

    const misturado = buildCreativeIntelligenceFromRows({
      ...base,
      rows: [row({ date: "2026-08-31" }), row({ date: "2026-09-01", engagementMetricsCollected: true, reactions: 5, comments: 0, shares: 3 })],
    });
    expect(misturado.current.metrics.reactions).toBeNull();
    expect(misturado.partial).toBe(true);

    // Antes do SQL nenhuma linha tem engajamento: fica em aberto, sem virar "dados parciais".
    const semSql = buildCreativeIntelligenceFromRows({ ...base, rows: [row({})] });
    expect(semSql.current.metrics.reactions).toBeNull();
    expect(semSql.partial).toBe(false);
  });

  it("não mistura dias coletados com dias antigos sem métricas de funil", () => {
    const result = buildCreativeIntelligenceFromRows({
      currentKey: "mr 03@2026",
      currentAdIds: ["1"],
      period: { since: "2026-08-31", until: "2026-09-01" },
      rows: [
        row({ date: "2026-08-31", funnelMetricsCollected: false, landingPageViews: null, initiateCheckout: null }),
        row({ date: "2026-09-01", landingPageViews: 15, initiateCheckout: 4 }),
      ],
      marks: new Map(),
    });

    expect(result.current.metrics.landingPageViews).toBeNull();
    expect(result.current.metrics.initiateCheckout).toBeNull();
    expect(result.partial).toBe(true);
  });
});
