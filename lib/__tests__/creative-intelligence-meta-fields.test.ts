import { describe, expect, it } from "vitest";
import { extractEngagementMetrics, extractVideoMetrics, pickMetaMetric } from "../creative-intelligence/meta-fields";

describe("Meta engagement field mapping", () => {
  it("lê curtidas, comentários e compartilhamentos do mesmo actions e trata ausência como zero", () => {
    expect(extractEngagementMetrics({
      actions: [
        { action_type: "post_reaction", value: "31" },
        { action_type: "comment", value: "4" },
        { action_type: "post", value: "7" },
        // Curtida na PÁGINA não é curtida no anúncio.
        { action_type: "like", value: "99" },
      ],
    })).toEqual({ reactions: 31, comments: 4, shares: 7 });
    // A Meta omite o array quando ninguém reagiu: numa linha vinda da API isso é zero.
    expect(extractEngagementMetrics({})).toEqual({ reactions: 0, comments: 0, shares: 0 });
  });
});

describe("Meta video field mapping", () => {
  it("preserva campo ausente como null e zero coletado como zero", () => {
    expect(pickMetaMetric(undefined)).toBeNull();
    expect(pickMetaMetric([])).toBeNull();
    expect(pickMetaMetric([{ action_type: "video_view", value: "0" }])).toBe(0);
  });

  it("mapeia os arrays oficiais para o contrato interno", () => {
    const result = extractVideoMetrics({
      actions: [
        { action_type: "link_click", value: "12" },
        { action_type: "video_view", value: "70" },
      ],
      video_play_actions: [{ action_type: "video_view", value: "100" }],
      video_continuous_2_sec_watched_actions: [{ action_type: "video_view", value: "60" }],
      video_p25_watched_actions: [{ action_type: "video_view", value: "50" }],
      video_p50_watched_actions: [{ action_type: "video_view", value: "40" }],
      video_p75_watched_actions: [{ action_type: "video_view", value: "30" }],
      video_p95_watched_actions: [{ action_type: "video_view", value: "20" }],
      video_p100_watched_actions: [{ action_type: "video_view", value: "10" }],
      video_avg_time_watched_actions: [{ action_type: "video_view", value: "8.5" }],
      video_thruplay_watched_actions: [{ action_type: "video_view", value: "25" }],
    });
    expect(result).toEqual({
      videoMetricsCollected: true,
      videoPlays: 100,
      videoViews3s: 70,
      videoViews2s: 60,
      videoViews25: 50,
      videoViews50: 40,
      videoViews75: 30,
      videoViews95: 20,
      videoViews100: 10,
      videoAvgWatchTime: 8.5,
      thruPlays: 25,
    });
  });

  it("marca anúncios sem qualquer campo de vídeo como não coletados", () => {
    expect(extractVideoMetrics({ actions: [] })).toEqual({
      videoMetricsCollected: false,
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
    });
  });
});
