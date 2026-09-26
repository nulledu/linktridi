import { describe, expect, it } from "vitest";
import { pct, progressMap, newlyAchieved } from "../goal-detect";
import { MOCK_SNAPSHOT } from "../datasource/mock-data";

describe("pct", () => {
  it("calcula percentual", () => {
    expect(pct(50, 100)).toBe(50);
  });
  it("trata meta zero", () => {
    expect(pct(50, 0)).toBe(0);
  });
});

describe("newlyAchieved", () => {
  it("detecta cruzamento de 100%", () => {
    const prev = { a: 80, b: 105 };
    const next = { a: 101, b: 110 };
    expect(newlyAchieved(prev, next)).toEqual(["a"]);
  });
  it("não dispara se já estava acima", () => {
    expect(newlyAchieved({ a: 101 }, { a: 120 })).toEqual([]);
  });
  it("trata id novo sem histórico", () => {
    expect(newlyAchieved({}, { a: 150 })).toEqual(["a"]);
  });
});

describe("progressMap", () => {
  it("achata vendedores e equipes", () => {
    const m = progressMap(MOCK_SNAPSHOT);
    expect(m["team:comercial"]).toBeGreaterThan(100);
    expect(Object.keys(m).length).toBe(
      MOCK_SNAPSHOT.salespeople.length + MOCK_SNAPSHOT.teams.length
    );
  });
});
