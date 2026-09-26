import { describe, it, expect } from "vitest";
import { linhaDoAnuncio, linhaDominante, linhaLabel } from "../marketing-produto";

// Os nomes abaixo são reais (armazém da Meta, agosto/2026). É de propósito: a
// regra existe pra classificar ESSA bagunça, não um padrão idealizado.
describe("linhaDoAnuncio", () => {
  it("lê a tag {CRB} da campanha como carimbo", () => {
    expect(linhaDoAnuncio("CBO VENDAS {TYPE} {CRB}  [11.07] — sem catalogo", "JL 03")).toBe("carimbo");
    expect(linhaDoAnuncio("VEGA ABO TST INTERESSES {CRB} {11.08}", "JN 01")).toBe("carimbo");
  });

  it("lê a tag {CH} e a palavra por extenso como chancela", () => {
    expect(linhaDoAnuncio("[CBO] - [isolando JU 08] - [14.07] - {CH} - teste de publico", "JU 08")).toBe("chancela");
    expect(linhaDoAnuncio("VEGA ABO CHANCELE TST CRIATIVOS {CH} {16.08 }", "CR CH 03")).toBe("chancela");
    expect(linhaDoAnuncio("VEGA CH TST CRIATIVOS [27.07]  PIXEL AJUSTADO", "JU 05")).toBe("chancela");
  });

  it("chancela ganha quando a campanha traz as duas tags", () => {
    // Campanha de chancela herda o nome da de carimbo o tempo todo; a tag
    // específica é a que vale, senão a chancela inteira viraria carimbo.
    expect(linhaDoAnuncio("VEGA CH (FV 07 CH V3 2026  G) {CRB} ABERTO", "FV 07 CH V3 2026  G")).toBe("chancela");
  });

  it("usa o CH do nome do anúncio quando a campanha não marca nada", () => {
    expect(linhaDoAnuncio("[CBO] - [PixelMeta] - [Melhores Conjuntos] - [13.08]", "JL - 06 CH REEL")).toBe("chancela");
    expect(linhaDoAnuncio("[CBO] - [PixelMeta] - [13.08]", "AG - 12 CH 2026 {B}")).toBe("chancela");
  });

  it("TYPE é carimbo — as campanhas escrevem {TYPE} {CRB} juntas", () => {
    expect(linhaDoAnuncio("CBO Type — CR Variados  [15.08] Kit12 {Caio}", "MR 56")).toBe("carimbo");
  });

  it("{MKT} e WhatsApp não são produto", () => {
    expect(linhaDoAnuncio("[CBO - Vendas] - [Wpp mariana 2] - [08.07] - {MKT}", "MA 12")).toBe("outro");
  });

  it("sem marca nenhuma devolve null — nunca chuta", () => {
    expect(linhaDoAnuncio("[CBO] VEGA - [PixelX] - [Aberto - Idades] - [11.05]", "C2 21.01")).toBeNull();
    expect(linhaDoAnuncio("", "")).toBeNull();
    expect(linhaDoAnuncio(null, null)).toBeNull();
  });

  it("não confunde CH no meio de uma palavra", () => {
    // "CHECKOUT", "MICHELE": só a palavra CH isolada marca chancela.
    expect(linhaDoAnuncio("CBO CHECKOUT NOVO {CRB} [01.08]", "JL 03")).toBe("carimbo");
  });
});

describe("linhaDominante", () => {
  it("devolve a linha com maior peso", () => {
    expect(linhaDominante(new Map([["carimbo", 10], ["chancela", 3]]))).toBe("carimbo");
  });

  it("com piso, conta misturada não é carimbada", () => {
    const misto = new Map<"carimbo" | "chancela", number>([["carimbo", 6], ["chancela", 4]]);
    expect(linhaDominante(misto, 0.7)).toBeNull();
    expect(linhaDominante(new Map([["carimbo", 9], ["chancela", 1]]), 0.7)).toBe("carimbo");
  });

  it("sem peso nenhum devolve null", () => {
    expect(linhaDominante(new Map())).toBeNull();
    expect(linhaDominante(new Map([["carimbo", 0]]))).toBeNull();
  });
});

describe("linhaLabel", () => {
  it("null vira 'Sem marca' — é o que a tela mostra no chip", () => {
    expect(linhaLabel(null)).toBe("Sem marca");
    expect(linhaLabel("chancela")).toBe("Chancela");
  });
});
