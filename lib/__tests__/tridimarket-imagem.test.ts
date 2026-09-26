import { describe, expect, it } from "vitest";
import { encaixarNoQuadrado, LADO_PADRAO } from "../tridimarket/imagem";

describe("encaixarNoQuadrado", () => {
  it("deixa a imagem inteira dentro do quadrado — nada de corte", () => {
    // Retrato 2:3, o formato de vitrine que mais aparecia cortado.
    const e = encaixarNoQuadrado(1000, 1500);
    expect(e.altura).toBe(LADO_PADRAO);
    expect(e.largura).toBeLessThanOrEqual(LADO_PADRAO);
    expect(e.largura).toBe(667);
  });

  it("centraliza a sobra dos dois lados", () => {
    const e = encaixarNoQuadrado(1500, 1000);
    expect(e.largura).toBe(LADO_PADRAO);
    expect(e.x).toBe(0);
    expect(e.y).toBe(Math.round((LADO_PADRAO - e.altura) / 2));
    expect(e.y).toBeGreaterThan(0);
  });

  it("quadrada grande vira exatamente o lado padrão", () => {
    expect(encaixarNoQuadrado(2400, 2400)).toEqual({ largura: 1000, altura: 1000, x: 0, y: 0 });
  });

  it("não amplia imagem pequena — ampliar só entrega borrão", () => {
    const e = encaixarNoQuadrado(300, 200);
    expect(e.largura).toBe(300);
    expect(e.altura).toBe(200);
    expect(e.x).toBe(350);
    expect(e.y).toBe(400);
  });

  it("dimensão inválida não quebra a tela", () => {
    expect(encaixarNoQuadrado(0, 500)).toEqual({ largura: 0, altura: 0, x: 0, y: 0 });
    expect(encaixarNoQuadrado(500, Number.NaN)).toEqual({ largura: 0, altura: 0, x: 0, y: 0 });
  });
});
