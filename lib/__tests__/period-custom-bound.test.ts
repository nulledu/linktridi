import { describe, expect, it } from "vitest";
import { resolvePeriod } from "@/lib/period";

// M4 da auditoria (docs/seguranca-auditoria.md): resolvePeriod monta a lista de
// dias com um laço dia-a-dia. from/to vêm da querystring (dezenas de rotas de
// API), sem teto de largura. `?from=0001-01-01&to=9999-12-31` gerava ~milhões de
// iterações + heap por requisição — CPU cara por request, vetor de Denial of
// Wallet na Vercel. O intervalo custom agora tem teto.

describe("resolvePeriod — teto do intervalo custom (M4)", () => {
  it("intervalo absurdo não estoura: a lista de dias fica limitada", () => {
    const r = resolvePeriod("custom", "0001-01-01", "9999-12-31");
    // Sem o teto isto seria ~3,6M; com o teto fica na casa de 2 anos.
    expect(r.days.length).toBeGreaterThan(0);
    expect(r.days.length).toBeLessThanOrEqual(732);
  });

  it("from/to invertidos também são limitados", () => {
    const r = resolvePeriod("custom", "9999-12-31", "0001-01-01");
    expect(r.days.length).toBeLessThanOrEqual(732);
  });

  it("intervalo normal continua exato (não corta o que é legítimo)", () => {
    const r = resolvePeriod("custom", "2026-08-01", "2026-08-07");
    expect(r.days.length).toBe(7);
    expect(r.fromDate).toBe("2026-08-01");
    expect(r.toDate).toBe("2026-08-07");
    expect(r.days[0]).toBe("2026-08-01");
    expect(r.days[6]).toBe("2026-08-07");
  });

  it("um ano inteiro está abaixo do teto e passa intocado", () => {
    const r = resolvePeriod("custom", "2025-01-01", "2025-12-31");
    expect(r.days.length).toBe(365);
    expect(r.toDate).toBe("2025-12-31");
  });
});
