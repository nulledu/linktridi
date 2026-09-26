import { describe, expect, it } from "vitest";
import { linhaDoGraph } from "@/lib/creative-intelligence/ao-vivo";

describe("linhaDoGraph", () => {
  it("traz engajamento e vídeo da linha da Meta no formato do armazém", () => {
    const r = linhaDoGraph("123", {
      ad_id: "9", ad_name: "MR 03", date_start: "2026-09-10",
      spend: "100.5", impressions: "5000", clicks: "80",
      actions: [
        { action_type: "omni_purchase", value: "4" },
        { action_type: "video_view", value: "1200" },
        { action_type: "post_reaction", value: "37" },
        { action_type: "comment", value: "5" },
        { action_type: "post", value: "2" },
      ],
      action_values: [{ action_type: "omni_purchase", value: "480" }],
      video_play_actions: [{ action_type: "video_view", value: "4000" }],
      video_thruplay_watched_actions: [{ action_type: "video_view", value: "300" }],
    });
    expect(r).toMatchObject({
      ad_account_id: "123", date: "2026-09-10", ad_id: "9", spend: 100.5,
      purchases_meta: 4, purchase_value_meta: 480,
      video_metrics_collected: true, video_plays: 4000, video_views_3s: 1200, video_thruplays: 300,
      engagement_metrics_collected: true, post_reactions: 37, post_comments: 5, post_shares: 2,
    });
  });

  it("anúncio sem reação vem com zero, não com traço", () => {
    const r = linhaDoGraph("1", { ad_id: "9", date_start: "2026-09-10", spend: "1" });
    expect(r).toMatchObject({ engagement_metrics_collected: true, post_reactions: 0, post_comments: 0, post_shares: 0 });
  });
});
