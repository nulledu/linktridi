import { describe, expect, it } from "vitest";
import { buildBenchmark } from "@/lib/creative-intelligence/benchmark";
import { buildEditorDeck, biggestDrop, formatPeriodLabel } from "@/lib/creative-intelligence/editor-deck";
import { buildCreativeInsights } from "@/lib/creative-intelligence/insights";
import { deriveCreativeMetrics } from "@/lib/creative-intelligence/metrics";
import { buildCreativeScore } from "@/lib/creative-intelligence/score";
import type { CreativeIntelligencePayload, CreativeRawMetrics } from "@/lib/creative-intelligence/types";

const RAW: CreativeRawMetrics = {
  spend: 200, revenue: 600, impressions: 10_000, reach: null, clicks: 200,
  landingPageViews: 150, initiateCheckout: 40, purchases: 10,
  videoPlays: 8_000, videoViews3s: 5_000, videoViews2s: 4_000, videoViews25: 3_000,
  videoViews50: 2_000, videoViews75: 1_000, videoViews95: 800,
  videoViews100: 700, videoAvgWatchTime: 8, thruPlays: 1_600,
};

function payloadFor(raw: CreativeRawMetrics, peers: CreativeRawMetrics[] = [raw]): CreativeIntelligencePayload {
  const metrics = deriveCreativeMetrics(raw);
  const all = peers.map((peer) => deriveCreativeMetrics(peer));
  const benchmark = buildBenchmark(all, { since: "2026-07-06", until: "2026-07-19" });
  return {
    period: benchmark.period,
    current: { id: "mr-03@2026", name: "MR 03", metrics },
    peers: all.map((peer, index) => ({ id: `p${index}`, name: `P${index}`, metrics: peer })),
    tags: [],
    benchmark,
    score: buildCreativeScore(metrics, all),
    analysis: buildCreativeInsights(metrics, benchmark),
    history: [],
    partial: false,
  };
}

describe("apresentação para editores", () => {
  it("monta capa, métricas dos editores, retenção, engajamento, leitura e testes", () => {
    const deck = buildEditorDeck(payloadFor(RAW));
    expect(deck.slides).toEqual(["capa", "sinais", "retencao", "engajamento", "leitura", "testes"]);
    expect(deck.signals.map((signal) => signal.label)).toEqual(["Hook Rate", "Hold Rate", "CTR"]);
  });

  it("no Engajamento a taxa compara com a mediana na direção certa e a reação vem por mil impressões", () => {
    const comEngajamento = { ...RAW, reactions: 42, comments: 6, shares: 9 };
    const caro = { ...comEngajamento, spend: 400 }; // mesmos cliques e impressões, custo em dobro
    const deck = buildEditorDeck(payloadFor(comEngajamento, [comEngajamento, caro, caro]));
    const item = (key: string) => deck.engagement.find((entry) => entry.key === key);

    // CPC e CPM abaixo da média são BONS; ROAS acima também.
    expect(item("cpc")).toMatchObject({ note: "−50% vs. média", tone: "bom" });
    expect(item("cpm")).toMatchObject({ note: "−50% vs. média", tone: "bom" });
    expect(item("roas")).toMatchObject({ note: "+100% vs. média", tone: "bom" });
    expect(item("ctr")).toMatchObject({ note: "na média", tone: null });
    // Curtida absoluta contra a mediana premiaria quem gastou mais: vai por mil impressões.
    expect(item("reactions")).toMatchObject({ value: 42, note: "4,2 a cada mil impressões" });
    expect(item("purchases")).toMatchObject({ value: 10, note: null });
    expect(deck.engagementPending).toBe(false);
  });

  it("sem engajamento coletado o slide fica, com as reações em aberto", () => {
    const deck = buildEditorDeck(payloadFor(RAW));
    expect(deck.slides).toContain("engajamento");
    expect(deck.engagementPending).toBe(true);
    expect(deck.engagement.filter((entry) => entry.group === "publico").map((entry) => entry.value)).toEqual([null, null, null]);
  });

  it("some com o slide de retenção quando não há curva para mostrar", () => {
    const deck = buildEditorDeck(payloadFor({ ...RAW, videoViews3s: null, videoViews25: null, videoViews50: null, videoViews75: null, videoViews100: null }));
    expect(deck.slides).not.toContain("retencao");
    expect(deck.retention).toEqual([]);
    expect(deck.biggestDrop).toBeNull();
  });

  it("aponta o trecho que mais perde gente, em pontos de quem passou dos 3 s", () => {
    const deck = buildEditorDeck(payloadFor(RAW));
    // 100 → 60 → 40 → 20 → 14: a maior queda é logo depois da abertura.
    expect(deck.retention.map((step) => Math.round(step.share))).toEqual([100, 60, 40, 20, 14]);
    expect(deck.biggestDrop).toMatchObject({ lost: 40 });
    expect(deck.biggestDrop?.from.key).toBe("videoViews3s");
    expect(deck.biggestDrop?.to.key).toBe("videoViews25");
  });

  it("não inventa queda quando a curva não cai", () => {
    const flat = [
      { key: "videoViews3s", label: "3 segundos", trecho: "os 3 segundos", chegada: "aos 3 segundos", value: 10, share: 100 },
      { key: "videoViews25", label: "25% do vídeo", trecho: "25% do vídeo", chegada: "a 25% do vídeo", value: 10, share: 100 },
    ] as const;
    expect(biggestDrop([...flat])).toBeNull();
  });

  it("compara com a mediana e diz quando está na média", () => {
    const same = buildEditorDeck(payloadFor(RAW));
    expect(same.signals.every((signal) => signal.verdict === "media")).toBe(true);
    expect(same.signals[0].comparison).toBe("Na média dos outros criativos");

    const weakHook = buildEditorDeck(payloadFor({ ...RAW, videoViews3s: 2_500 }, [RAW, { ...RAW, videoViews3s: 2_500 }, RAW]));
    expect(weakHook.signals[0]).toMatchObject({ verdict: "abaixo" });
    expect(weakHook.reading.title).toBe("A abertura precisa ganhar força");
    expect(weakHook.reading.evidence?.key).toBe("hookRate");
    expect(weakHook.tests[0]).toEqual({ text: "Criar uma nova abertura para os primeiros 3 segundos", reason: "Hook Rate abaixo da mediana" });
  });

  it("leva compras, CTR, CPC, CPM e ROAS no Engajamento, e nunca investimento, faturamento ou CPA", () => {
    const deck = buildEditorDeck(payloadFor(RAW));
    expect(deck.engagement.map((entry) => entry.key)).toEqual(["purchases", "ctr", "cpc", "cpm", "roas", "reactions", "comments", "shares"]);
    expect(JSON.stringify(deck)).not.toMatch(/Investimento|Faturamento|CPA|"spend"|"revenue"|"cpa"/);
  });

  it("escreve o período como frase", () => {
    expect(formatPeriodLabel("2026-07-06", "2026-07-19")).toBe("6 a 19 de julho de 2026");
    expect(formatPeriodLabel("2026-06-28", "2026-07-05")).toBe("28 de junho a 5 de julho de 2026");
    expect(formatPeriodLabel("2025-12-20", "2026-01-01")).toBe("20 de dezembro de 2025 a 1º de janeiro de 2026");
    expect(formatPeriodLabel("2026-09-01", "2026-09-01")).toBe("1º de setembro de 2026");
    expect(formatPeriodLabel("ontem", "hoje")).toBe("ontem a hoje");
  });
});
