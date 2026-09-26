import { describe, it, expect } from "vitest";
import { calcBanco, inicioDaPessoa, INICIO_BANCO } from "@/lib/banco-horas";

describe("banco começa no cadastro da pessoa", () => {
  it("usa o maior entre o início do banco e o cadastro (dia de SP)", () => {
    expect(inicioDaPessoa(null)).toBe(INICIO_BANCO);
    expect(inicioDaPessoa("2026-07-01T12:00:00Z")).toBe(INICIO_BANCO);
    expect(inicioDaPessoa("2026-09-10T02:00:00Z")).toBe("2026-09-09");
  });

  it("funcionário novo não nasce devendo os dias antes de entrar", () => {
    const p = { id: "x", nome: "Novo", fotoUrl: null, jornadaMin: 480, createdAt: "2026-09-21T12:00:00Z" };
    const b = calcBanco(p, [], { de: "2026-09-01", ate: "2026-09-22" }, "2026-09-22", new Map(), [], 480, [], "23:59");
    expect(b.dias.filter((d) => d.dia < "2026-09-21").every((d) => d.classe === "pre")).toBe(true);
    expect(b.ledger.desde).toBe("2026-09-21");
    expect(b.ledger.saldoMin).toBe(-480);   // só 21/09 conta (22 é hoje)
  });
});
