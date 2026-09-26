import { describe, it, expect } from "vitest";
import { motivoValido, classificarSituacaoBaixa, LOTE_MAXIMO_BAIXA } from "../estoque-baixa";

describe("baixa de unidades — regras puras", () => {
  describe("motivoValido", () => {
    it("aceita os motivos de MOTIVOS_BAIXA", () => {
      expect(motivoValido("consumido")).toBe(true);
      expect(motivoValido("expedido")).toBe(true);
      expect(motivoValido("perdido")).toBe(true);
      expect(motivoValido("devolvido")).toBe(true);
    });
    it("recusa motivo desconhecido — inclusive 'em_estoque', que é status inicial, não baixa", () => {
      expect(motivoValido("em_estoque")).toBe(false);
      expect(motivoValido("qualquer_coisa")).toBe(false);
      expect(motivoValido("")).toBe(false);
    });
  });

  describe("classificarSituacaoBaixa", () => {
    it("código que não foi encontrado é 'desconhecida'", () => {
      expect(classificarSituacaoBaixa(undefined)).toBe("desconhecida");
    });
    it("código em_estoque é 'baixada' (vai ser baixado)", () => {
      expect(classificarSituacaoBaixa({ status: "em_estoque" })).toBe("baixada");
    });
    it("código já baixado (qualquer motivo) é 'ja_baixada', não 'baixada' de novo", () => {
      expect(classificarSituacaoBaixa({ status: "consumido" })).toBe("ja_baixada");
      expect(classificarSituacaoBaixa({ status: "expedido" })).toBe("ja_baixada");
      expect(classificarSituacaoBaixa({ status: "perdido" })).toBe("ja_baixada");
    });
  });

  it("o teto de lote é 200 — mesmo cap do PATCH /api/estoque/unidades", () => {
    expect(LOTE_MAXIMO_BAIXA).toBe(200);
  });
});
