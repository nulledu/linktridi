import { describe, expect, it } from "vitest";
import { formatMarketCurrency, marketStatusLabel, normalizeMarketTab } from "../tridimarket/view";

describe("TridiMarket view helpers", () => {
  it("formats Brazilian currency", () => {
    expect(formatMarketCurrency(1234.5)).toContain("1.234,50");
  });

  it("uses plain-language financial labels", () => {
    expect(marketStatusLabel("good")).toBe("Em dia");
    expect(marketStatusLabel("overdue")).toBe("Em atraso");
  });

  it("falls back to overview for unknown tabs", () => {
    expect(normalizeMarketTab("devices")).toBe("devices");
    expect(normalizeMarketTab("payroll")).toBe("overview");
  });
});
