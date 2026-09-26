import { metricPercentile } from "./benchmark";
import type { CreativeMetricKey, CreativeMetrics, CreativeScore } from "./types";

const DIMENSIONS: Array<{ output: Exclude<keyof CreativeScore, "overallScore">; weight: number; metrics: CreativeMetricKey[] }> = [
  { output: "hookScore", weight: 0.15, metrics: ["hookRate"] },
  { output: "retentionScore", weight: 0.15, metrics: ["holdRate", "videoViews50", "videoViews100"] },
  { output: "engagementScore", weight: 0.15, metrics: ["ctr"] },
  { output: "mediaEfficiencyScore", weight: 0.20, metrics: ["cpm", "cpc", "cpa"] },
  { output: "intentScore", weight: 0.15, metrics: ["clickToInitiateCheckoutRate"] },
  { output: "conversionScore", weight: 0.20, metrics: ["initiateCheckoutToPurchaseRate", "clickToPurchaseRate", "roas"] },
];

const round = (value: number) => Math.round(Math.max(0, Math.min(100, value)));

export function buildCreativeScore(current: CreativeMetrics, peers: CreativeMetrics[]): CreativeScore {
  const result: CreativeScore = {
    overallScore: null,
    hookScore: null,
    retentionScore: null,
    engagementScore: null,
    mediaEfficiencyScore: null,
    intentScore: null,
    conversionScore: null,
  };
  let weighted = 0;
  let totalWeight = 0;
  for (const dimension of DIMENSIONS) {
    const percentiles = dimension.metrics
      .map((key) => metricPercentile(current, peers, key))
      .filter((value): value is number => value != null);
    if (!percentiles.length) continue;
    const score = round(percentiles.reduce((sum, value) => sum + value, 0) / percentiles.length);
    result[dimension.output] = score;
    weighted += score * dimension.weight;
    totalWeight += dimension.weight;
  }
  result.overallScore = totalWeight > 0 ? round(weighted / totalWeight) : null;
  return result;
}
