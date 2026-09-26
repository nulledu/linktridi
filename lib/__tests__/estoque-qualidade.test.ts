import { describe, it, expect } from "vitest";
import {
  RESULTADOS, DEFEITOS, resultadoValido, defeitoValido, scoreDe, rotuloDaTaxa,
} from "../estoque-qualidade";

describe("qualidade da produção — regras puras", () => {
  describe("resultadoValido", () => {
    it("aceita as DUAS chaves, e são só duas", () => {
      expect(RESULTADOS.map((r) => r.key)).toEqual(["certo", "errado"]);
      for (const r of RESULTADOS) expect(resultadoValido(r.key)).toBe(true);
    });
    it("recusa o que não está no catálogo — inclusive as notas antigas", () => {
      expect(resultadoValido("mediano")).toBe(false);
      expect(resultadoValido("excelente")).toBe(false);
      expect(resultadoValido("")).toBe(false);
      expect(resultadoValido(undefined)).toBe(false);
      expect(resultadoValido(true)).toBe(false);
    });
  });

  describe("defeitoValido", () => {
    it("aceita as 7 chaves de DEFEITOS — elas sobreviveram à conferência binária", () => {
      expect(DEFEITOS).toHaveLength(7);
      for (const d of DEFEITOS) expect(defeitoValido(d.key)).toBe(true);
    });
    it("recusa defeito fora do catálogo fechado — texto livre não vira estatística", () => {
      expect(defeitoValido("risco na tinta")).toBe(false);
      expect(defeitoValido("")).toBe(false);
    });
  });

  describe("scoreDe", () => {
    it("sem conferência nenhuma: taxaAcerto é null (não zero — zero é 'errou tudo')", () => {
      // A distinção que a ficha da pessoa depende: `null` escreve "Sem
      // conferências"; `0` pinta 0% de vermelho em quem nunca foi conferido.
      const s = scoreDe([]);
      expect(s.taxaAcerto).toBeNull();
      expect(s.total).toBe(0);
      expect(s.certos).toBe(0);
      expect(s.errados).toBe(0);
      expect(s.defeitosMaisComuns).toEqual([]);
    });

    it("uma conferência certa: taxa 1", () => {
      const s = scoreDe([{ resultado: "certo", defeitos: [] }]);
      expect(s.taxaAcerto).toBe(1);
      expect(s.certos).toBe(1);
      expect(s.errados).toBe(0);
      expect(s.total).toBe(1);
    });

    it("uma conferência errada: taxa 0 — aqui zero é a verdade", () => {
      const s = scoreDe([{ resultado: "errado", defeitos: ["avaria"] }]);
      expect(s.taxaAcerto).toBe(0);
      expect(s.errados).toBe(1);
      expect(s.total).toBe(1);
    });

    it("três certos e um errado: 75%", () => {
      const s = scoreDe([
        { resultado: "certo", defeitos: [] },
        { resultado: "certo", defeitos: [] },
        { resultado: "errado", defeitos: ["peca_suja"] },
        { resultado: "certo", defeitos: [] },
      ]);
      expect(s.taxaAcerto).toBe(0.75);
      expect(s.certos).toBe(3);
      expect(s.errados).toBe(1);
      expect(s.total).toBe(4);
    });

    it("cada conferência pesa igual — errar uma caixa grande não é pior que errar uma pequena", () => {
      // A caixa é aprovada ou reprovada INTEIRA; o que a taxa mede é quantas
      // vezes o trabalho voltou pra bancada, não quantas peças havia dentro.
      const s = scoreDe([
        { resultado: "certo", defeitos: [] },
        { resultado: "errado", defeitos: ["medida_errada"] },
      ]);
      expect(s.taxaAcerto).toBe(0.5);
    });

    it("linha com resultado desconhecido não conta pra lado nenhum", () => {
      // Formato antigo sobrevivendo num banco de teste: melhor um total menor
      // que uma taxa mentirosa.
      const s = scoreDe([
        { resultado: "certo", defeitos: [] },
        { resultado: "mediano", defeitos: [] },
      ]);
      expect(s.total).toBe(1);
      expect(s.taxaAcerto).toBe(1);
    });

    it("defeitosMaisComuns: só o que apareceu, do mais pro menos comum, com `vezes`", () => {
      const s = scoreDe([
        { resultado: "errado", defeitos: ["peca_suja", "avaria"] },
        { resultado: "errado", defeitos: ["peca_suja"] },
        { resultado: "errado", defeitos: ["peca_suja"] },
        { resultado: "certo", defeitos: [] },
      ]);
      expect(s.defeitosMaisComuns[0]).toEqual({ key: "peca_suja", label: "Peça suja", vezes: 3 });
      expect(s.defeitosMaisComuns[1]).toEqual({ key: "avaria", label: "Avaria / quebrado", vezes: 1 });
      expect(s.defeitosMaisComuns).toHaveLength(2); // nenhum defeito com 0 aparece
    });

    it("aguenta `defeitos` ausente sem quebrar", () => {
      const s = scoreDe([{ resultado: "certo" } as { resultado: string; defeitos: string[] }]);
      expect(s.taxaAcerto).toBe(1);
      expect(s.defeitosMaisComuns).toEqual([]);
    });
  });

  describe("rotuloDaTaxa", () => {
    it("null vira 'Sem conferências' — não 'Péssimo'", () => {
      expect(rotuloDaTaxa(null)).toBe("Sem conferências");
    });
    it("bandas", () => {
      expect(rotuloDaTaxa(1)).toBe("Excelente");
      expect(rotuloDaTaxa(0.95)).toBe("Excelente");
      expect(rotuloDaTaxa(0.94)).toBe("Bom");
      expect(rotuloDaTaxa(0.85)).toBe("Bom");
      expect(rotuloDaTaxa(0.84)).toBe("Mediano");
      expect(rotuloDaTaxa(0.7)).toBe("Mediano");
      expect(rotuloDaTaxa(0.69)).toBe("Ruim");
      expect(rotuloDaTaxa(0.5)).toBe("Ruim");
      expect(rotuloDaTaxa(0.49)).toBe("Péssimo");
      expect(rotuloDaTaxa(0)).toBe("Péssimo");
    });
  });
});
