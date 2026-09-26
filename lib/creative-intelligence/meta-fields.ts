export interface MetaActionValue {
  action_type?: string;
  value?: string | number;
}

export function pickMetaMetric(value: unknown): number | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value.find((item) => item && typeof item === "object" && "value" in item) as MetaActionValue | undefined;
  if (!first) return null;
  const parsed = Number(first.value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function pickMetaAction(value: unknown, actionType: string): number | null {
  if (!Array.isArray(value)) return null;
  const item = value.find((candidate) => candidate && typeof candidate === "object"
    && (candidate as MetaActionValue).action_type === actionType) as MetaActionValue | undefined;
  if (!item) return null;
  const parsed = Number(item.value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface ExtractedVideoMetrics {
  videoMetricsCollected: boolean;
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
}

export function extractVideoMetrics(row: Record<string, unknown>): ExtractedVideoMetrics {
  const result = {
    videoPlays: pickMetaMetric(row.video_play_actions),
    videoViews3s: pickMetaAction(row.actions, "video_view"),
    videoViews2s: pickMetaMetric(row.video_continuous_2_sec_watched_actions),
    videoViews25: pickMetaMetric(row.video_p25_watched_actions),
    videoViews50: pickMetaMetric(row.video_p50_watched_actions),
    videoViews75: pickMetaMetric(row.video_p75_watched_actions),
    videoViews95: pickMetaMetric(row.video_p95_watched_actions),
    videoViews100: pickMetaMetric(row.video_p100_watched_actions),
    videoAvgWatchTime: pickMetaMetric(row.video_avg_time_watched_actions),
    thruPlays: pickMetaMetric(row.video_thruplay_watched_actions),
  };
  return {
    videoMetricsCollected: Object.values(result).some((value) => value != null),
    ...result,
  };
}

export interface ExtractedEngagementMetrics {
  reactions: number;
  comments: number;
  shares: number;
}

/**
 * Curtidas, comentários e compartilhamentos chegam no MESMO `actions` que já
 * traz compras e checkout — não há campo novo pra pedir à Meta. A Meta omite o
 * tipo (e às vezes o array inteiro) quando ninguém reagiu, então numa linha que
 * veio da API "ausente" é zero; o "sem dado" das linhas antigas é marcado à
 * parte, por `engagement_metrics_collected`.
 */
export function extractEngagementMetrics(row: Record<string, unknown>): ExtractedEngagementMetrics {
  return {
    reactions: pickMetaAction(row.actions, "post_reaction") ?? 0,
    comments: pickMetaAction(row.actions, "comment") ?? 0,
    shares: pickMetaAction(row.actions, "post") ?? 0,
  };
}
