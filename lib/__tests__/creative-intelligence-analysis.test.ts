import { describe, expect, it } from "vitest";
import { buildBenchmark, percentileRank } from "../creative-intelligence/benchmark";
import { aggregateByTags, bestMetricKeys } from "../creative-intelligence/comparison";
import { buildCreativeInsights } from "../creative-intelligence/insights";
import { buildCreativeScore } from "../creative-intelligence/score";
import { deriveCreativeMetrics } from "../creative-intelligence/metrics";
import type { CreativeMetrics, CreativeRawMetrics } from "../creative-intelligence/types";

const metric = (patch: Partial<CreativeRawMetrics> = {}): CreativeMetrics => deriveCreativeMetrics({
  spend: 100,
  revenue: 200,
  impressions: 1_000,
  reach: null,
  clicks: 20,
  landingPageViews: 15,
  initiateCheckout: 4,
  purchases: 2,
  videoPlays: 800,
  videoViews3s: 400,
  videoViews2s: 400,
  videoViews25: 300,
  videoViews50: 200,
  videoViews75: 100,
  videoViews95: 80,
  videoViews100: 70,
  videoAvgWatchTime: 8,
  thruPlays: 160,
  ...patch,
});

describe("creative benchmark", () => {
  it("usa mediana e ignora métricas ausentes", () => {
    const b = buildBenchmark([
      metric({ clicks: 10 }),
      metric({ clicks: 20 }),
      metric({ clicks: 1_000 }),
      metric({ videoPlays: null, videoViews3s: null, videoViews2s: null }),
    ], { since: "2026-09-01", until: "2026-09-07" });
    expect(b.sampleSize).toBe(4);
    expect(b.medians.clicks).toBe(20);
    expect(b.medians.hookRate).toBe(50);
    expect(b.period).toEqual({ since: "2026-09-01", until: "2026-09-07" });
  });

  it("inverte o percentil para custos, onde menor é melhor", () => {
    expect(percentileRank(20, [10, 20, 30], "higher")).toBe(50);
    expect(percentileRank(20, [10, 20, 30], "lower")).toBe(50);
    expect(percentileRank(10, [10, 20, 30], "lower")).toBe(100);
    expect(percentileRank(30, [10, 20, 30], "lower")).toBe(0);
  });
});

describe("creative score and insights", () => {
  it("calcula score relativo e remove dimensões sem dados do denominador", () => {
    const peers = [
      metric({ clicks: 10, videoViews3s: 200, thruPlays: 40 }),
      metric({ clicks: 20, videoViews3s: 400, thruPlays: 160 }),
      metric({ clicks: 30, videoViews3s: 600, thruPlays: 360 }),
    ];
    const score = buildCreativeScore(peers[1], peers);
    expect(score.overallScore).toBe(50);
    expect(score.hookScore).not.toBeNull();
    expect(score.retentionScore).not.toBeNull();

    const partial = buildCreativeScore(metric({
      videoPlays: null,
      videoViews3s: null,
      videoViews2s: null,
      thruPlays: null,
      initiateCheckout: null,
      purchases: null,
      revenue: null,
    }), peers);
    expect(partial.hookScore).toBeNull();
    expect(Number.isFinite(partial.overallScore!)).toBe(true);
  });

  it("descreve como possibilidade o gargalo após o clique", () => {
    const current = metric({ clicks: 30, initiateCheckout: 2, videoViews3s: 600 });
    const peers = [metric(), metric({ clicks: 18 }), metric({ clicks: 22 })];
    const benchmark = buildBenchmark(peers, { since: "2026-09-01", until: "2026-09-07" });
    const out = buildCreativeInsights(current, benchmark);
    expect(out.diagnosis.title).toContain("Possível diagnóstico");
    expect(out.diagnosis.description).toMatch(/sugerem|pode/i);
    expect(out.suggestedTests.join(" ")).toMatch(/oferta|CTA/i);
  });
});

describe("creative comparison", () => {
  it("agrega tags pelas bases em vez de fazer média simples de percentuais", () => {
    const rows = aggregateByTags([
      { id: "a", name: "A", tags: ["UGC"], metrics: metric({ spend: 100, impressions: 1_000, clicks: 10, purchases: 1, revenue: 300 }) },
      { id: "b", name: "B", tags: ["UGC"], metrics: metric({ spend: 200, impressions: 1_000, clicks: 20, purchases: 4, revenue: 400 }) },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].creativeCount).toBe(2);
    expect(rows[0].metrics.ctr).toBe(1.5);
    expect(rows[0].metrics.cpm).toBe(150);
    expect(rows[0].metrics.cpa).toBe(60);
    expect(rows[0].metrics.roas).toBeCloseTo(700 / 300);
  });

  it("destaca maior retorno e menor custo por linha", () => {
    const rows = [
      { id: "a", metrics: metric({ spend: 100, purchases: 1, revenue: 100 }) },
      { id: "b", metrics: metric({ spend: 100, purchases: 2, revenue: 300 }) },
    ];
    expect(bestMetricKeys(rows, "roas")).toEqual(["b"]);
    expect(bestMetricKeys(rows, "cpa")).toEqual(["b"]);
  });
});
