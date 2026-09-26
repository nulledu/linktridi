import { describe, expect, it } from "vitest";
import { contrasteEntre, legivelSobre, piorContraste } from "@/lib/vitrine/cor";

// O caso real: o modelo importado do Carimbos pinta o cabeçalho com um degradê
// de roxo pra BRANCO e escreve em branco. Cada valor sozinho é válido; juntos,
// "Carrinho" desaparece na metade direita da faixa.
const DEGRADE_DO_CARIMBOS = ["#a18fff", "#ffffff"];

describe("contraste da vitrine", () => {
  it("preto no branco é 21 e cor consigo mesma é 1", () => {
    expect(contrasteEntre("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrasteEntre("#a18fff", "#a18fff")).toBeCloseTo(1, 5);
  });

  it("o pior contraste é o da ponta pior, não a média", () => {
    // Branco lê bem no roxo e nada no branco. A média mentiria.
    expect(piorContraste("#ffffff", DEGRADE_DO_CARIMBOS)).toBeCloseTo(1, 2);
  });

  it("respeita a cor escolhida quando ela é legível nas duas pontas", () => {
    expect(legivelSobre("#ffffff", ["#1e2d7d", "#2a3a95"])).toBe("#ffffff");
  });

  it("troca a cor quando ela é ilegível em ALGUMA ponta", () => {
    const tinta = legivelSobre("#ffffff", DEGRADE_DO_CARIMBOS);
    expect(tinta).not.toBe("#ffffff");
    expect(piorContraste(tinta, DEGRADE_DO_CARIMBOS)).toBeGreaterThanOrEqual(4.5);
  });

  it("em fundo escuro chapado devolve branco", () => {
    expect(legivelSobre("#333333", ["#101010", "#101010"])).toBe("#ffffff");
  });

  it("não mexe quando o fundo é uma variável CSS (não dá pra medir)", () => {
    expect(legivelSobre("#ffffff", ["var(--footer-background)"])).toBe("#ffffff");
  });
});
