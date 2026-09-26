import { describe, it, expect } from "vitest";
import { aplicarTolerancia } from "@/lib/banco-horas";

// Menos de 5 min devendo no dia não cobra — nem com uma marcação estourada.
describe("dívida mínima do dia", () => {
  const base = { entradaPrevista: "08:00", saidaPrevista: "17:00", entradaReal: "08:12", saidaReal: "17:08" };
  it("−4 min com a entrada 12 min atrasada: zera", () => {
    expect(aplicarTolerancia({ saldoBruto: -4, ...base })).toBe(0);
  });
  it("−5 min já conta (marcação estourada)", () => {
    expect(aplicarTolerancia({ saldoBruto: -5, ...base })).toBe(-5);
  });
});
