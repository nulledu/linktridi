import { describe, it, expect } from "vitest";
import { curvaDeMola, projetarParada, velocidadeDaSoltura } from "@/lib/mola";

/**
 * A física da soltura do arraste (lib/mola.ts). São as duas metades da regra
 * da Apple pra soltar: projetar pra onde o gesto IA (não onde o dedo largou) e
 * entregar a velocidade do dedo à mola do assentar.
 *
 * A trava existe porque os dois têm versão errada tentadora: a projeção "de
 * livro" (v²/2a) e a mola que ignora v0 — as duas compilam, animam, e só se
 * percebe no dedo.
 */
describe("mola · projeção e velocidade", () => {
  it("projeta pela desaceleração exponencial da Apple, não pela de livro", () => {
    // (v/1000)·d/(1−d): a 1000 px/s com taxa 0.998, o gesto ainda anda 499px.
    expect(projetarParada(1000)).toBeCloseTo(499, 0);
    expect(projetarParada(-1000)).toBeCloseTo(-499, 0);
    expect(projetarParada(0)).toBe(0);
    // Taxa menor = mais atrito = para antes.
    expect(Math.abs(projetarParada(1000, 0.99))).toBeLessThan(Math.abs(projetarParada(1000, 0.998)));
  });

  it("a velocidade sai de uma JANELA de 100ms, não das duas últimas amostras", () => {
    // 300px em 100ms = 3000 px/s, medido do conjunto — não do último parzinho
    // de 4ms, que amplificaria ruído de um pixel.
    const h = [0, 25, 50, 75, 100].map((t) => ({ t, x: t * 3, y: 0 }));
    expect(velocidadeDaSoltura(h, 100).x).toBeCloseTo(3000, 0);
    // Dedo PAROU no fim (amostras velhas demais pra janela): não é peteleco.
    const parado = [{ t: 0, x: 0, y: 0 }, { t: 40, x: 300, y: 0 }];
    expect(velocidadeDaSoltura(parado, 400)).toEqual({ x: 0, y: 0 });
    // Uma amostra só não deriva nada.
    expect(velocidadeDaSoltura([{ t: 95, x: 10, y: 10 }], 100)).toEqual({ x: 0, y: 0 });
  });

  it("a curva de mola sai do zero, assenta em 1 e aceita passar do ponto", () => {
    const { easing, duration } = curvaDeMola();
    expect(easing.startsWith("linear(0.0000")).toBe(true);
    expect(easing.endsWith("1.0000)")).toBe(true);
    expect(duration).toBeGreaterThanOrEqual(150);
    const pontos = easing.slice("linear(".length, -1).split(", ").map(Number);
    // Amortecimento < 1: em algum momento a curva passa de 1 e volta.
    expect(Math.max(...pontos)).toBeGreaterThan(1);
    expect(pontos.every(Number.isFinite)).toBe(true);
  });

  it("v0 positivo faz a curva NASCER andando — é a costura com o dedo", () => {
    const parada = curvaDeMola({ v0: 0 });
    const arremesso = curvaDeMola({ v0: 4 });
    const p = (c: { easing: string }) => c.easing.slice("linear(".length, -1).split(", ").map(Number);
    // Na mesma amostra inicial (~1/60s), quem chegou com velocidade já saiu do
    // lugar; quem largou parado ainda está acelerando do zero.
    expect(p(arremesso)[1]).toBeGreaterThan(p(parada)[1] * 1.5);
  });
});
