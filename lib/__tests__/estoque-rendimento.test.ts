import { describe, it, expect } from "vitest";
import {
  consumoPorPeca, rendimentoDe, fraseDoRendimento, fraseDoConsumo,
} from "../estoque-rendimento";

/**
 * "Quantas peças saem de UMA chapa".
 *
 * Relato do dono: "uma chapa de mdf gera muitos produtos/peças, e não
 * necessariamente 1 chapa = 1 produto". A ficha pedia o CONSUMO POR PEÇA
 * (0,125 chapa), que obriga a dividir de cabeça — e errar essa divisão sai como
 * custo e necessidade de compra errados, sem sintoma nenhum.
 */

describe("as duas formas de dizer a mesma coisa", () => {
  it("1 chapa rende 8 peças ⇄ cada peça consome 0,125", () => {
    expect(consumoPorPeca(8)).toBe(0.125);
    expect(rendimentoDe(0.125)).toBe(8);
  });

  it("rendimento 1 é o caso comum: 1 componente por peça", () => {
    expect(consumoPorPeca(1)).toBe(1);
    expect(rendimentoDe(1)).toBe(1);
  });

  it("ida e volta preserva os rendimentos que o galpão usa", () => {
    for (const r of [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 25, 40, 50, 100]) {
      expect(rendimentoDe(consumoPorPeca(r)), `rendimento ${r}`).toBe(r);
    }
  });
});

describe("o arredondamento não pode virar número quebrado na tela", () => {
  it("1/6 volta 6 mesmo com a dízima", () => {
    // 0,1666… não tem representação exata. A volta encosta no inteiro em vez
    // de mostrar 5,99 — que leria como defeito, não como arredondamento.
    expect(consumoPorPeca(6)).toBe(0.166667);
    expect(rendimentoDe(0.166667)).toBe(6);
    // E o valor ANTIGO, gravado com 3 casas, continua voltando redondo.
    expect(rendimentoDe(0.167)).toBe(6);
  });

  it("rendimento ALTO agora fecha — era o caso do pedido", () => {
    // Com 3 casas, 1/16 virava 0,063 e voltava 15,87. "Uma chapa gera muitos"
    // é exatamente a faixa que não cabia.
    expect(consumoPorPeca(16)).toBe(0.0625);
    expect(rendimentoDe(0.0625)).toBe(16);
    expect(rendimentoDe(consumoPorPeca(24))).toBe(24);
    expect(rendimentoDe(consumoPorPeca(64))).toBe(64);
  });

  it("1/3 volta 3", () => {
    expect(rendimentoDe(consumoPorPeca(3))).toBe(3);
  });

  it("rendimento de VERDADE fracionário não é falsificado pra inteiro", () => {
    // 0,4 são 2,5 peças por unidade. Arredondar pra 3 seria mentir sobre a
    // conta de alguém.
    expect(rendimentoDe(0.4)).toBe(2.5);
  });
});

describe("entrada torta não envenena o custo", () => {
  it("zero e negativo devolvem 0, nunca Infinity", () => {
    // Um Infinity gravado envenena toda multiplicação de custo depois.
    expect(consumoPorPeca(0)).toBe(0);
    expect(consumoPorPeca(-4)).toBe(0);
    expect(rendimentoDe(0)).toBe(0);
    expect(rendimentoDe(-1)).toBe(0);
  });

  it("lixo devolve 0", () => {
    expect(consumoPorPeca(NaN)).toBe(0);
    expect(consumoPorPeca(Infinity)).toBe(0);
    expect(rendimentoDe(NaN)).toBe(0);
  });
});

describe("as frases confirmam o que foi entendido", () => {
  it("rendimento, com a unidade do componente", () => {
    expect(fraseDoRendimento(8, "ch")).toBe("1 ch rende 8 peças.");
    expect(fraseDoRendimento(1, "ch")).toBe("1 ch rende 1 peça.");
  });

  it("fracionário sai com vírgula, não ponto", () => {
    expect(fraseDoRendimento(2.5, "ch")).toBe("1 ch rende 2,5 peças.");
  });

  it("sem rendimento, pede o número", () => {
    expect(fraseDoRendimento(0, "ch")).toMatch(/quantas peças/);
  });

  it("o espelho do consumo, pra quem confere a conta", () => {
    expect(fraseDoConsumo(0.125, "ch")).toBe("cada peça consome 0,125 ch");
    expect(fraseDoConsumo(0, "ch")).toBe("Nada consumido.");
  });
});
