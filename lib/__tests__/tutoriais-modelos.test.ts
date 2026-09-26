import { describe, expect, it } from "vitest";
import { MODELOS } from "@/app/(plataforma)/marketing/tutoriais/editor/modelos";
import { pendenciasDoTutorial } from "@/lib/tridiflow-tutoriais-pendencias";

// Modelo é esqueleto, não conteúdo: os títulos vêm prontos e o texto vazio,
// pra o que falta escrever aparecer nas pendências em vez de um exemplo que
// alguém esquece de trocar e vai pro ar.
describe("modelos de tutorial", () => {
  it("todo modelo nasce rascunho, sem título e na posição pedida", () => {
    for (const m of MODELOS) {
      const t = m.montar(7);
      expect(t.status, m.chave).toBe("rascunho");
      expect(t.titulo, m.chave).toBe("");
      expect(t.ordem, m.chave).toBe(7);
    }
  });

  it("cada uso gera ids novos — duas cópias do mesmo modelo não disputam bloco", () => {
    const [a, b] = [MODELOS[0].montar(0), MODELOS[0].montar(1)];
    expect(a.id).not.toBe(b.id);
    const idsA = new Set(a.blocos.map((x) => x.id));
    expect(b.blocos.some((x) => idsA.has(x.id))).toBe(false);
  });

  it("o passo a passo aponta o que falta escrever", () => {
    const t = { ...MODELOS.find((m) => m.chave === "passo-a-passo")!.montar(0), titulo: "Carimbo em papel" };
    const chaves = pendenciasDoTutorial(t, { handlesOutros: [], temCategorias: false }).map((p) => p.chave);
    expect(chaves.filter((c) => c === "passo-vazio")).toHaveLength(3);
    expect(chaves).toContain("aviso-vazio");
  });
});
