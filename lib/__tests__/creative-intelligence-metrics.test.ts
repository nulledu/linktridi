import { describe, expect, it } from "vitest";
import {
  HOOK_RATE_DEFINITION,
  HOLD_RATE_DEFINITION,
  deriveCreativeMetrics,
  safeDivide,
} from "../creative-intelligence/metrics";
import type { CreativeRawMetrics } from "../creative-intelligence/types";

const raw = (patch: Partial<CreativeRawMetrics> = {}): CreativeRawMetrics => ({
  spend: 200,
  revenue: 600,
  impressions: 10_000,
  reach: null,
  clicks: 200,
  landingPageViews: 150,
  initiateCheckout: 40,
  purchases: 10,
  videoPlays: 8_000,
  videoViews3s: 5_000,
  videoViews2s: 4_000,
  videoViews25: 3_000,
  videoViews50: 2_000,
  videoViews75: 1_000,
  videoViews95: 800,
  videoViews100: 700,
  videoAvgWatchTime: 8,
  thruPlays: 1_600,
  ...patch,
});

describe("creative metrics", () => {
  it("deriva custos e taxas das bases agregadas", () => {
    const m = deriveCreativeMetrics(raw());
    expect(m.cpm).toBe(20);
    expect(m.ctr).toBe(2);
    expect(m.cpc).toBe(1);
    expect(m.cpa).toBe(20);
    expect(m.roas).toBe(3);
    expect(m.costPerInitiateCheckout).toBe(5);
    expect(m.clickToLandingPageViewRate).toBe(75);
    expect(m.landingPageViewToInitiateCheckoutRate).toBeCloseTo(26.6667, 3);
    expect(m.clickToInitiateCheckoutRate).toBe(20);
    expect(m.initiateCheckoutToPurchaseRate).toBe(25);
    expect(m.impressionToClickRate).toBe(2);
    expect(m.clickToPurchaseRate).toBe(5);
  });

  it("usa as definições explícitas de Hook e Hold", () => {
    const m = deriveCreativeMetrics(raw());
    expect(m.hookRate).toBe(62.5);
    expect(m.holdRate).toBe(32);
    expect(HOOK_RATE_DEFINITION.formula).toContain("3 segundos");
    expect(HOLD_RATE_DEFINITION.formula).toContain("ThruPlay");
  });

  it("não converte ausência ou denominador zero em zero falso", () => {
    const m = deriveCreativeMetrics(raw({
      impressions: 0,
      clicks: 0,
      purchases: null,
      initiateCheckout: null,
      videoPlays: null,
      videoViews3s: null,
      videoViews2s: null,
      thruPlays: null,
    }));
    expect(m.cpm).toBeNull();
    expect(m.ctr).toBeNull();
    expect(m.cpc).toBeNull();
    expect(m.cpa).toBeNull();
    expect(m.costPerInitiateCheckout).toBeNull();
    expect(m.clickToLandingPageViewRate).toBeNull();
    expect(m.landingPageViewToInitiateCheckoutRate).toBeNull();
    expect(m.hookRate).toBeNull();
    expect(m.holdRate).toBeNull();
  });

  it("nunca devolve NaN ou Infinity", () => {
    expect(safeDivide(Number.NaN, 2)).toBeNull();
    expect(safeDivide(2, Number.POSITIVE_INFINITY)).toBeNull();
    expect(safeDivide(2, 0)).toBeNull();
    const m = deriveCreativeMetrics(raw({ spend: Number.NaN, revenue: Number.POSITIVE_INFINITY }));
    expect(m.roas).toBeNull();
  });

  it("mantém zero real quando o denominador existe", () => {
    const m = deriveCreativeMetrics(raw({ clicks: 0, purchases: 0, initiateCheckout: 0 }));
    expect(m.ctr).toBe(0);
    expect(m.clickToPurchaseRate).toBeNull();
    expect(m.cpa).toBeNull();
  });
});
