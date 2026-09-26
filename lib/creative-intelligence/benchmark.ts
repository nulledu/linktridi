import { METRIC_DEFINITIONS } from "./metrics";
import type { CreativeBenchmark, CreativeMetricKey, CreativeMetrics, CreativePeriod, MetricDirection } from "./types";

const values = (metrics: CreativeMetrics[], key: CreativeMetricKey) => metrics
  .map((row) => row[key])
  .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

export function median(input: number[]): number | null {
  if (!input.length) return null;
  const sorted = [...input].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildBenchmark(metrics: CreativeMetrics[], period: CreativePeriod): CreativeBenchmark {
  const medians: CreativeBenchmark["medians"] = {};
  for (const key of Object.keys(METRIC_DEFINITIONS) as CreativeMetricKey[]) {
    const value = median(values(metrics, key));
    if (value != null) medians[key] = value;
  }
  return { period, sampleSize: metrics.length, medians };
}

export function percentileRank(value: number | null, distribution: number[], direction: MetricDirection): number | null {
  if (value == null || !Number.isFinite(value) || !distribution.length) return null;
  const clean = distribution.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  if (clean.length === 1) return 50;
  const below = clean.filter((item) => item < value).length;
  const equal = clean.filter((item) => item === value).length;
  const rank = ((below + Math.max(0, equal - 1) / 2) / (clean.length - 1)) * 100;
  const normalized = Math.max(0, Math.min(100, rank));
  return direction === "lower" ? 100 - normalized : normalized;
}

export function metricPercentile(current: CreativeMetrics, peers: CreativeMetrics[], key: CreativeMetricKey): number | null {
  const direction = METRIC_DEFINITIONS[key].direction;
  if (direction === "neutral") return null;
  return percentileRank(current[key], values(peers, key), direction);
}
