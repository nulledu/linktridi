import { METRIC_DEFINITIONS, deriveCreativeMetrics } from "./metrics";
import type { CreativeComparable, CreativeMetricKey, CreativeMetrics, CreativeRawMetrics, CreativeTagAggregate } from "./types";

const ADDITIVE: Array<keyof CreativeRawMetrics> = [
  "spend", "revenue", "impressions", "clicks", "landingPageViews", "initiateCheckout", "purchases",
  "videoPlays", "videoViews3s", "videoViews2s", "videoViews25", "videoViews50", "videoViews75", "videoViews95", "videoViews100", "thruPlays",
  "reactions", "comments", "shares",
];

export function aggregateByTags(rows: CreativeComparable[]): CreativeTagAggregate[] {
  const groups = new Map<string, CreativeComparable[]>();
  for (const row of rows) for (const tag of row.tags ?? []) {
    const clean = tag.trim();
    if (!clean) continue;
    const current = groups.get(clean) ?? [];
    current.push(row);
    groups.set(clean, current);
  }

  return [...groups.entries()].map(([tag, members]) => {
    const raw = Object.fromEntries(ADDITIVE.map((key) => {
      const available = members.map((row) => row.metrics[key]).filter((value): value is number => value != null && Number.isFinite(value));
      return [key, available.length ? available.reduce((sum, value) => sum + value, 0) : null];
    })) as unknown as CreativeRawMetrics;
    const playWeight = members.reduce((sum, row) => sum + (row.metrics.videoPlays ?? 0), 0);
    raw.videoAvgWatchTime = playWeight > 0
      ? members.reduce((sum, row) => sum + (row.metrics.videoAvgWatchTime ?? 0) * (row.metrics.videoPlays ?? 0), 0) / playWeight
      : null;
    raw.reach = null;
    return {
      id: `tag:${tag}`,
      name: tag,
      tags: [tag],
      creativeCount: members.length,
      metrics: deriveCreativeMetrics(raw),
    };
  }).sort((a, b) => (b.metrics.spend ?? 0) - (a.metrics.spend ?? 0));
}

export function bestMetricKeys<T extends { id: string; metrics: CreativeMetrics }>(rows: T[], key: CreativeMetricKey): string[] {
  const available = rows.filter((row) => row.metrics[key] != null);
  if (!available.length || METRIC_DEFINITIONS[key].direction === "neutral") return [];
  const values = available.map((row) => row.metrics[key] as number);
  const best = METRIC_DEFINITIONS[key].direction === "lower" ? Math.min(...values) : Math.max(...values);
  return available.filter((row) => row.metrics[key] === best).map((row) => row.id);
}
