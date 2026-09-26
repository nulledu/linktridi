import { describe, expect, it } from "vitest";
import { periodForPreset } from "../creative-intelligence/period";

describe("período da apresentação criativa", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");

  it.each([
    ["today", "2026-09-08", "2026-09-08"],
    ["yesterday", "2026-09-07", "2026-09-07"],
    ["7", "2026-09-02", "2026-09-08"],
    ["14", "2026-08-26", "2026-09-08"],
    ["30", "2026-08-10", "2026-09-08"],
  ] as const)("resolve %s em São Paulo sem deslocar um dia", (preset, since, until) => {
    expect(periodForPreset(preset, now)).toEqual({ since, until });
  });

  it("ainda usa o dia de São Paulo antes da meia-noite local", () => {
    expect(periodForPreset("today", new Date("2026-09-08T02:30:00.000Z"))).toEqual({
      since: "2026-09-07",
      until: "2026-09-07",
    });
  });
});
