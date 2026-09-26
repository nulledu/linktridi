import { describe, expect, it } from "vitest";
import { clipDoTrapezio, corDaFaixa, recuoDaFaixa, trapeziosDoFunil } from "../funil-forma";

describe("funil clássico", () => {
  it("as faixas se emendam em linha reta: o fundo de uma é o topo da de baixo", () => {
    const f = trapeziosDoFunil(5);
    expect(f[0].topo).toBe(1);
    for (let i = 0; i < f.length - 1; i += 1) expect(f[i].fundo).toBeCloseTo(f[i + 1].topo, 10);
    expect(f[f.length - 1].fundo).toBeCloseTo(0.34, 10);
  });

  it("sem cantos é o trapézio seco centrado (apresentação)", () => {
    expect(clipDoTrapezio(1, 0.5)).toBe("polygon(0.00% 0, 100.00% 0, 75.00% 100%, 25.00% 100%)");
  });

  it("com cantos, os quatro arredondam (5 pontos por canto)", () => {
    const c = clipDoTrapezio(0.8, 0.6, { raio: 10, raioFundo: 18, alturaPx: 64 });
    expect(c.split("calc(").length - 1).toBeGreaterThanOrEqual(20);
    // o canto de cima-esquerda termina 10px pra dentro, colado no topo
    expect(c).toContain("calc(10.00% + 10.00px) 0.00px");
    // o bico usa o raio próprio
    expect(c).toContain("calc(20.00% + 18.00px) calc(100% - 0.00px)");
  });

  it("topo escuro, fundo mais claro, sempre na cor da pessoa", () => {
    expect(corDaFaixa(0, 5)).toContain("#000 60%");
    expect(corDaFaixa(4, 5)).toContain("#000 14%");
    expect(corDaFaixa(0, 5)).toContain("var(--graf-1");
  });

  it("o recuo mede pela aresta mais estreita, senão a pílula sai pela lateral", () => {
    const f = trapeziosDoFunil(5);
    const ultima = f[4];
    // o meio da última faixa é bem mais largo que o bico: recuar pelo meio
    // deixava a linha do número passar da lateral inclinada e ser cortada.
    const meio = (ultima.topo + ultima.fundo) / 2;
    expect(recuoDaFaixa(ultima.topo, ultima.fundo)).toBe(
      `calc(${(((1 - ultima.fundo) / 2) * 100).toFixed(2)}% + 10px)`,
    );
    expect((1 - ultima.fundo) / 2).toBeGreaterThan((1 - meio) / 2);
    // a primeira faixa nasce na largura toda e mesmo assim recua pelo fundo
    expect(recuoDaFaixa(f[0].topo, f[0].fundo)).toBe(
      `calc(${(((1 - f[0].fundo) / 2) * 100).toFixed(2)}% + 10px)`,
    );
  });

  it("sem etapas não quebra", () => {
    expect(trapeziosDoFunil(0)).toEqual([]);
  });
});
