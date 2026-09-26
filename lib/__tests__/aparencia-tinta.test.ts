import { describe, expect, it } from "vitest";
import { corDeAcao, corDeTexto, TEMAS, tintaSobre } from "../aparencia";

// Fundos de página reais dos dois temas.
const BG_CLARO = "#f2f2f7";
const BG_ESCURO = "#000000";

// Luminância relativa da WCAG — repetida aqui de propósito. Se o teste
// importasse a mesma função que está sendo testada, um erro na fórmula passaria
// batido: o teste concordaria com o bug.
function contraste(hex: string, tinta: string): number {
  const lum = (h: string) => {
    const v = h.replace("#", "");
    const c = (i: number) => {
      const x = parseInt(v.slice(i * 2, i * 2 + 2), 16) / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * c(0) + 0.7152 * c(1) + 0.0722 * c(2);
  };
  const a = lum(hex), b = lum(tinta);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("tinta sobre a cor de destaque", () => {
  // 4.5:1 é o piso da WCAG AA para texto normal. O rótulo de um botão é texto
  // normal — não vale usar a régua frouxa de "texto grande" aqui.
  it.each(TEMAS.map((t) => [t.nome, t.cor] as const))(
    "%s (%s): o botão primário passa em 4.5:1",
    (_nome, cor) => {
      expect(contraste(corDeAcao(cor), tintaSobre(cor))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("a cor da marca só é ajustada quando precisa", () => {
    // Violeta da casa já passa com branco — tem que sair intocado.
    expect(corDeAcao("#7C3AED")).toBe("#7c3aed");
    // Carmim empaca em 4.46:1 com a melhor tinta pura: ganha um tom próprio.
    expect(corDeAcao("#E0304F")).not.toBe("#e0304f");
  });

  it("o ajuste não desfigura a cor — mesmo canal dominante", () => {
    for (const t of TEMAS) {
      const [r0, g0, b0] = [1, 3, 5].map((i) => parseInt(t.cor.slice(i, i + 2), 16));
      const a = corDeAcao(t.cor);
      const [r1, g1, b1] = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
      const dom = (r: number, g: number, b: number) => (r >= g && r >= b ? "r" : g >= b ? "g" : "b");
      expect(dom(r1, g1, b1), `${t.nome} mudou de cara`).toBe(dom(r0, g0, b0));
    }
  });

  it("escolhe preto no claro e branco no escuro", () => {
    expect(tintaSobre("#F67EA4")).toBe("#1d1d1f"); // Rosé: branco dava 2.4:1
    expect(tintaSobre("#E8890C")).toBe("#1d1d1f"); // Âmbar
    expect(tintaSobre("#7C3AED")).toBe("#ffffff"); // violeta da casa
    expect(tintaSobre("#000000")).toBe("#ffffff");
    expect(tintaSobre("#ffffff")).toBe("#1d1d1f");
  });

  it("cor inválida não derruba a interface — cai no branco", () => {
    expect(tintaSobre("nao-e-cor")).toBe("#ffffff");
    expect(tintaSobre("")).toBe("#ffffff");
  });
});

// A marca como TEXTO é outro problema: aqui a cor é a tinta, e quem manda é o
// fundo da página. "+ Criar nova tarefa" em Carmim sobre o fundo claro dava
// 4,46 — passava perto e reprovava.
describe("marca usada como texto", () => {
  it.each(TEMAS.map((t) => [t.nome, t.cor] as const))(
    "%s (%s) passa em 4.5:1 nos DOIS fundos",
    (_nome, cor) => {
      expect(contraste(corDeTexto(cor, "claro"), BG_CLARO)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(corDeTexto(cor, "escuro"), BG_ESCURO)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("o violeta da casa passa folgado e sai intocado no claro", () => {
    expect(corDeTexto("#7C3AED", "claro")).toBe("#7c3aed");
  });

  it("escurece no fundo claro e clareia no escuro", () => {
    const claro = corDeTexto("#E0304F", "claro");
    const escuro = corDeTexto("#F67EA4", "escuro");
    expect(contraste(claro, BG_CLARO)).toBeGreaterThanOrEqual(4.5);
    // Rosé sobre preto já é clarinho: não precisa mexer.
    expect(contraste(escuro, BG_ESCURO)).toBeGreaterThanOrEqual(4.5);
  });

  it("não desfigura a cor — mantém o canal dominante", () => {
    for (const t of TEMAS) {
      const dom = (h: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return r >= g && r >= b ? "r" : g >= b ? "g" : "b"; };
      expect(dom(corDeTexto(t.cor, "claro")), `${t.nome} mudou de cara`).toBe(dom(t.cor));
    }
  });

  it("cor inválida passa reto em vez de virar lixo", () => {
    expect(corDeTexto("nao-e-cor", "claro")).toBe("nao-e-cor");
  });
});
