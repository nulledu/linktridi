import { describe, it, expect } from "vitest";
import { planoDeEtiquetas, problemaDoPlano, MAX_ETIQUETAS } from "../estoque-plano-de-etiquetas";

/**
 * Quantas etiquetas, e cada uma valendo quanto.
 *
 * Relato do dono: "se é por caixa ele tem que gerar etiqueta por caixa". A
 * geração fazia UMA etiqueta por peça sempre — 400 folhas viravam 400 papéis,
 * quando o galpão guarda 8 caixas de 50.
 *
 * O que se trava aqui é a soma: a trigger do banco conta PEÇA, não papel. Um
 * plano cuja soma não bate com o pedido faz o saldo mentir.
 */

describe("sem caixa, nada muda", () => {
  it("uma peça por etiqueta é um lote só", () => {
    const p = planoDeEtiquetas(3, 1);
    expect(p.lotes).toEqual([{ etiquetas: 3, pecas: 1 }]);
    expect(p.frase).toBe("3 etiquetas, 1 peça cada.");
  });

  it("o padrão é 1 — quem não usa caixa não vê diferença", () => {
    expect(planoDeEtiquetas(5)).toEqual(planoDeEtiquetas(5, 1));
  });

  it("singular", () => {
    expect(planoDeEtiquetas(1, 1).frase).toBe("1 etiqueta, 1 peça.");
  });
});

describe("caixa exata", () => {
  it("400 peças em caixas de 50 são 8 papéis, não 400", () => {
    const p = planoDeEtiquetas(400, 50);
    expect(p.lotes).toEqual([{ etiquetas: 8, pecas: 50 }]);
    expect(p.totalEtiquetas).toBe(8);
    expect(p.totalPecas).toBe(400);
    expect(p.temSobra).toBe(false);
    expect(p.frase).toBe("8 caixas de 50 — 8 etiquetas para 400 peças.");
  });

  it("uma caixa só fala no singular", () => {
    expect(planoDeEtiquetas(50, 50).frase).toBe("1 caixa de 50 — 1 etiqueta para 50 peças.");
  });
});

describe("a caixa que sobra — a decisão que este arquivo toma", () => {
  it("410 em caixas de 50 são 8 de 50 MAIS uma de 10", () => {
    // A última etiqueta tem de dizer 10. Dissesse 50, a soma das etiquetas
    // passaria a mentir sobre a prateleira — e é a soma que vira o saldo.
    const p = planoDeEtiquetas(410, 50);
    expect(p.lotes).toEqual([{ etiquetas: 8, pecas: 50 }, { etiquetas: 1, pecas: 10 }]);
    expect(p.temSobra).toBe(true);
    expect(p.frase).toBe("8 caixas de 50 + 1 de 10 — 9 etiquetas para 410 peças.");
  });

  it("menos que uma caixa vira uma caixa parcial", () => {
    const p = planoDeEtiquetas(10, 50);
    expect(p.lotes).toEqual([{ etiquetas: 1, pecas: 10 }]);
    expect(p.frase).toBe("1 de 10 — 1 etiqueta para 10 peças.");
  });

  it("A SOMA SEMPRE FECHA — é o invariante que protege o saldo", () => {
    for (const total of [1, 7, 10, 49, 50, 51, 99, 100, 137, 400, 410, 999]) {
      for (const caixa of [1, 2, 6, 12, 50, 144]) {
        const p = planoDeEtiquetas(total, caixa);
        const soma = p.lotes.reduce((s, l) => s + l.etiquetas * l.pecas, 0);
        expect(soma, `${total} em caixas de ${caixa}`).toBe(total);
        expect(p.totalPecas).toBe(total);
      }
    }
  });
});

describe("entrada torta não vira etiqueta torta", () => {
  it("zero e negativo não geram nada", () => {
    expect(planoDeEtiquetas(0, 50).lotes).toEqual([]);
    expect(planoDeEtiquetas(-5, 50).lotes).toEqual([]);
    expect(planoDeEtiquetas(0, 50).frase).toBe("Nada a gerar.");
  });

  it("caixa de zero ou negativa cai em 1 — nunca divide por zero", () => {
    expect(planoDeEtiquetas(5, 0).lotes).toEqual([{ etiquetas: 5, pecas: 1 }]);
    expect(planoDeEtiquetas(5, -3).lotes).toEqual([{ etiquetas: 5, pecas: 1 }]);
  });

  it("fração é truncada — a coluna do banco é int com check(> 0)", () => {
    expect(planoDeEtiquetas(10.9, 2.7).lotes).toEqual([{ etiquetas: 5, pecas: 2 }]);
  });

  it("lixo não estoura", () => {
    expect(planoDeEtiquetas(NaN as number, 50).lotes).toEqual([]);
    expect(planoDeEtiquetas(10, NaN as number).lotes).toEqual([{ etiquetas: 10, pecas: 1 }]);
  });
});

describe("o teto conta PAPEL, não peça", () => {
  it("mil peças avulsas não passam", () => {
    expect(problemaDoPlano(planoDeEtiquetas(1000, 1))).toMatch(/limite é 500/);
  });

  it("as MESMAS mil peças em caixas de 50 passam folgado", () => {
    // É o ganho da caixa: vinte papéis em vez de mil.
    const p = planoDeEtiquetas(1000, 50);
    expect(p.totalEtiquetas).toBe(20);
    expect(problemaDoPlano(p)).toBeNull();
  });

  it("no teto ainda passa; um a mais é recusado com o que fazer", () => {
    expect(problemaDoPlano(planoDeEtiquetas(MAX_ETIQUETAS, 1))).toBeNull();
    expect(problemaDoPlano(planoDeEtiquetas(MAX_ETIQUETAS + 1, 1))).toMatch(/Aumente as peças por caixa/);
  });

  it("plano vazio pede o número em vez de falar de limite", () => {
    expect(problemaDoPlano(planoDeEtiquetas(0))).toMatch(/quantas peças/);
  });
});
