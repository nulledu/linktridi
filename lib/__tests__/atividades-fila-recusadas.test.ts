import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { liberadaAgora } from "@/lib/device";

// Fila de recusadas (23/09/2026): a ordem devolvida no tablet sai da fila de
// todo tablet até um supervisor devolvê-la — no lugar do cooldown de 40 min.
describe("fila de recusadas", () => {
  it("recusada (impedida) não é oferecida a nenhum tablet, sem prazo", () => {
    expect(liberadaAgora({ impedida: true })).toBe(false);
    expect(liberadaAgora({ impedida: true, liberada_apos: "2000-01-01T00:00:00Z" })).toBe(false);
  });

  it("devolvida pelo supervisor volta na hora", () => {
    expect(liberadaAgora({ impedida: false })).toBe(true);
    expect(liberadaAgora({})).toBe(true);
  });

  it("o devolver não grava mais prazo de 40 min", () => {
    const push = readFileSync("app/api/device/push/route.ts", "utf8");
    expect(push).not.toMatch(/COOLDOWN_DEVOLUCAO_MIN/);
    expect(push).toMatch(/patch\.liberada_apos = null/);
  });

  it("pull e claim filtram pela mesma regra", () => {
    for (const f of ["app/api/device/pull/route.ts", "app/api/device/claim/route.ts"]) {
      expect(readFileSync(f, "utf8")).toMatch(/liberadaAgora\(a as \{ liberada_apos\?: string \| null; impedida\?: boolean \| null \}\)/);
    }
  });
});
