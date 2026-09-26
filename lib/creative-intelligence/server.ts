import { normalizarNome } from "@/lib/criativos";
import { buildBenchmark } from "./benchmark";
import { aggregateByTags } from "./comparison";
import { buildCreativeInsights } from "./insights";
import { deriveCreativeMetrics } from "./metrics";
import { buildCreativeScore } from "./score";
import type {
  CreativeComparable,
  CreativeHistoryPoint,
  CreativeIntelligencePayload,
  CreativePeriod,
  CreativeRawMetrics,
} from "./types";

export interface CreativeWarehouseRow {
  date: string;
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  landingPageViews: number | null;
  initiateCheckout: number | null;
  funnelMetricsCollected: boolean;
  videoPlays: number | null;
  videoViews3s: number | null;
  videoViews2s: number | null;
  videoViews25: number | null;
  videoViews50: number | null;
  videoViews75: number | null;
  videoViews95: number | null;
  videoViews100: number | null;
  videoAvgWatchTime: number | null;
  thruPlays: number | null;
  videoMetricsCollected: boolean;
  /** Só linha gravada depois do `criativo_engajamento.sql` traz engajamento. */
  engagementMetricsCollected?: boolean;
  reactions?: number | null;
  comments?: number | null;
  shares?: number | null;
}

interface Accumulator {
  id: string;
  names: Map<string, number>;
  raw: CreativeRawMetrics;
  funnelCollected: boolean;
  videoCollected: boolean;
  avgWatchWeighted: number;
  avgWatchWeight: number;
  rows: number;
  funnelRows: number;
  videoRows: number;
  engagementRows: number;
}

const emptyRaw = (): CreativeRawMetrics => ({
  spend: 0,
  revenue: 0,
  impressions: 0,
  reach: null,
  clicks: 0,
  landingPageViews: null,
  initiateCheckout: null,
  purchases: 0,
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
  reactions: null,
  comments: null,
  shares: null,
});

const makeAccumulator = (id: string): Accumulator => ({
  id,
  names: new Map(),
  raw: emptyRaw(),
  funnelCollected: false,
  videoCollected: false,
  avgWatchWeighted: 0,
  avgWatchWeight: 0,
  rows: 0,
  funnelRows: 0,
  videoRows: 0,
  engagementRows: 0,
});

function sum(current: number | null, value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return current;
  return (current ?? 0) + value;
}

function add(acc: Accumulator, row: CreativeWarehouseRow) {
  acc.rows++;
  acc.names.set(row.adName, (acc.names.get(row.adName) ?? 0) + row.spend);
  acc.raw.spend = sum(acc.raw.spend, row.spend);
  acc.raw.revenue = sum(acc.raw.revenue, row.revenue);
  acc.raw.impressions = sum(acc.raw.impressions, row.impressions);
  acc.raw.clicks = sum(acc.raw.clicks, row.clicks);
  acc.raw.purchases = sum(acc.raw.purchases, row.purchases);
  if (row.funnelMetricsCollected) {
    acc.funnelCollected = true;
    acc.funnelRows++;
    acc.raw.landingPageViews = sum(acc.raw.landingPageViews, row.landingPageViews ?? 0);
    acc.raw.initiateCheckout = sum(acc.raw.initiateCheckout, row.initiateCheckout ?? 0);
  }
  if (row.videoMetricsCollected) {
    acc.videoCollected = true;
    acc.videoRows++;
    acc.raw.videoPlays = sum(acc.raw.videoPlays, row.videoPlays ?? 0);
    acc.raw.videoViews3s = sum(acc.raw.videoViews3s, row.videoViews3s ?? 0);
    acc.raw.videoViews2s = sum(acc.raw.videoViews2s, row.videoViews2s ?? 0);
    acc.raw.videoViews25 = sum(acc.raw.videoViews25, row.videoViews25 ?? 0);
    acc.raw.videoViews50 = sum(acc.raw.videoViews50, row.videoViews50 ?? 0);
    acc.raw.videoViews75 = sum(acc.raw.videoViews75, row.videoViews75 ?? 0);
    acc.raw.videoViews95 = sum(acc.raw.videoViews95, row.videoViews95 ?? 0);
    acc.raw.videoViews100 = sum(acc.raw.videoViews100, row.videoViews100 ?? 0);
    acc.raw.thruPlays = sum(acc.raw.thruPlays, row.thruPlays ?? 0);
    if (row.videoAvgWatchTime != null && Number.isFinite(row.videoAvgWatchTime)) {
      const weight = Math.max(1, row.videoPlays ?? 0);
      acc.avgWatchWeighted += row.videoAvgWatchTime * weight;
      acc.avgWatchWeight += weight;
    }
  }
  if (row.engagementMetricsCollected) {
    acc.engagementRows++;
    acc.raw.reactions = sum(acc.raw.reactions ?? null, row.reactions ?? 0);
    acc.raw.comments = sum(acc.raw.comments ?? null, row.comments ?? 0);
    acc.raw.shares = sum(acc.raw.shares ?? null, row.shares ?? 0);
  }
}

function finish(acc: Accumulator, tags: string[]): { comparable: CreativeComparable; partial: boolean } {
  let partial = false;
  if (!acc.funnelCollected) {
    acc.raw.landingPageViews = null;
    acc.raw.initiateCheckout = null;
  } else if (acc.funnelRows < acc.rows) {
    acc.raw.landingPageViews = null;
    acc.raw.initiateCheckout = null;
    partial = true;
  }
  if (!acc.videoCollected) {
    acc.raw.videoPlays = null;
    acc.raw.videoViews3s = null;
    acc.raw.videoViews2s = null;
    acc.raw.videoViews25 = null;
    acc.raw.videoViews50 = null;
    acc.raw.videoViews75 = null;
    acc.raw.videoViews95 = null;
    acc.raw.videoViews100 = null;
    acc.raw.thruPlays = null;
  } else if (acc.videoRows < acc.rows) {
    acc.raw.videoPlays = null;
    acc.raw.videoViews3s = null;
    acc.raw.videoViews2s = null;
    acc.raw.videoViews25 = null;
    acc.raw.videoViews50 = null;
    acc.raw.videoViews75 = null;
    acc.raw.videoViews95 = null;
    acc.raw.videoViews100 = null;
    acc.raw.thruPlays = null;
    partial = true;
  }
  if (acc.engagementRows < acc.rows) {
    // Dia gravado antes do SQL de engajamento não vira zero: a família inteira
    // fica indisponível no período, igual vídeo e funil.
    if (acc.engagementRows > 0) partial = true;
    acc.raw.reactions = null;
    acc.raw.comments = null;
    acc.raw.shares = null;
  }
  acc.raw.videoAvgWatchTime = acc.videoRows === acc.rows && acc.avgWatchWeight > 0 ? acc.avgWatchWeighted / acc.avgWatchWeight : null;
  const name = [...acc.names.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] ?? acc.id;
  return { comparable: { id: acc.id, name, tags, metrics: deriveCreativeMetrics(acc.raw) }, partial };
}

function rowKey(row: CreativeWarehouseRow, year: number): string {
  return `${normalizarNome(row.adName)}@${year}`;
}

export function buildCreativeIntelligenceFromRows(input: {
  currentKey: string;
  currentAdIds: string[];
  period: CreativePeriod;
  rows: CreativeWarehouseRow[];
  marks: Map<string, string[]>;
  partial?: boolean;
}): CreativeIntelligencePayload {
  const year = Number(input.period.until.slice(0, 4)) || new Date().getUTCFullYear();
  const currentIds = new Set(input.currentAdIds);
  const groups = new Map<string, Accumulator>();
  const days = new Map<string, Accumulator>();

  for (const row of input.rows) {
    const key = currentIds.has(row.adId) ? input.currentKey : rowKey(row, year);
    const group = groups.get(key) ?? makeAccumulator(key);
    add(group, row);
    groups.set(key, group);
    if (currentIds.has(row.adId)) {
      const day = days.get(row.date) ?? makeAccumulator(row.date);
      add(day, row);
      days.set(row.date, day);
    }
  }

  if (!groups.has(input.currentKey)) groups.set(input.currentKey, makeAccumulator(input.currentKey));
  const finished = [...groups.values()].map((group) => finish(group, input.marks.get(group.id) ?? []));
  const peers = finished.map((result) => result.comparable);
  const current = peers.find((row) => row.id === input.currentKey)!;
  const currentPartial = finished.find((result) => result.comparable.id === input.currentKey)?.partial ?? false;
  const benchmark = buildBenchmark(peers.map((row) => row.metrics), input.period);
  const score = buildCreativeScore(current.metrics, peers.map((row) => row.metrics));
  const analysis = buildCreativeInsights(current.metrics, benchmark);
  const history: CreativeHistoryPoint[] = [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, acc]) => ({ day, metrics: finish(acc, []).comparable.metrics }));

  return {
    period: input.period,
    current,
    peers: peers.sort((a, b) => (b.metrics.spend ?? 0) - (a.metrics.spend ?? 0)),
    tags: aggregateByTags(peers),
    benchmark,
    score,
    analysis,
    history,
    partial: (input.partial ?? false) || currentPartial,
    unavailableReason: input.rows.length ? undefined : "Nenhum dado sincronizado para este criativo no período.",
  };
}
