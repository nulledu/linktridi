import { describe, it, expect } from "vitest";
import {
  MOTIVOS_DE_ENTRADA, MAX_POR_ENTRADA, motivoDeEntradaValido,
  problemaDaEntrada, saldoDepoisDaEntrada, fraseDaEntrada,
  type ItemDaEntrada,
} from "../estoque-entrada";

/**
 * Entrada por bipagem — a terceira porta.
 *
 * As outras duas exigem papel antes: Recebimento contra uma compra, Conferência
 * contra uma atividade. Faltava a do dia a dia: a peça está na mão e o sistema
 * não sabe dela.
 */

const ALMOFADA: ItemDaEntrada = { id: "i1", nome: "Almofada 22x22", quantidade: 12, unidade: "un", serializado: false };
const CAIXA: ItemDaEntrada = { id: "i2", nome: "Folha de alavanca", quantidade: 191, unidade: "un", serializado: true };

describe("entrada por bipagem", () => {
  it("os três motivos existem e são coisas DIFERENTES", () => {
    // Não é enfeite: chegou é compra (entrou peça no mundo), produzido é
    // produção (o material já saiu antes), encontrado é correção (nada entrou,
    // o número é que estava errado). Escolher um no código seria decidir uma vez
    // o que muda a cada bipe.
    expect(MOTIVOS_DE_ENTRADA.map((m) => m.key)).toEqual(["chegou", "produzido", "encontrado"]);
    for (const m of MOTIVOS_DE_ENTRADA) expect(m.ajuda.length).toBeGreaterThan(30);
  });

  it("motivo desconhecido não passa", () => {
    expect(motivoDeEntradaValido("chegou")).toBe(true);
    expect(motivoDeEntradaValido("achado")).toBe(false);
    expect(motivoDeEntradaValido(null)).toBe(false);
  });

  it("o caminho feliz não tem problema nenhum", () => {
    expect(problemaDaEntrada(ALMOFADA, 10, "chegou")).toBeNull();
  });

  it("código que não acha item diz o que fazer, e distingue os dois tipos de etiqueta", () => {
    const p = problemaDaEntrada(null, 1, "chegou");
    expect(p).toMatch(/etiqueta é de produto/);
    expect(p).toMatch(/Receber|conferência/);
  });

  it("item SERIALIZADO é recusado — lá o número vem da soma das etiquetas", () => {
    // Somar na mão criaria um número que a próxima recontagem por gatilho apaga,
    // sem avisar ninguém. É o pior tipo de erro: silencioso e revertido sozinho.
    const p = problemaDaEntrada(CAIXA, 5, "chegou");
    expect(p).toMatch(/contado por etiqueta/);
    expect(p).toContain("Folha de alavanca");
  });

  it("quantidade tem teto, e o teto é o DEDO num teclado de totem", () => {
    expect(problemaDaEntrada(ALMOFADA, MAX_POR_ENTRADA, "chegou")).toBeNull();
    expect(problemaDaEntrada(ALMOFADA, MAX_POR_ENTRADA + 1, "chegou")).toMatch(/é demais/);
    // Um zero a mais é o erro real: 1000 onde se queria 10 faz o estoque mandar
    // não comprar o que acabou.
    expect(problemaDaEntrada(ALMOFADA, 1000, "chegou")).toMatch(/Receber/);
  });

  it("quantidade quebrada ou zero é recusada com frase", () => {
    for (const n of [0, -2, 1.5, NaN]) {
      expect(problemaDaEntrada(ALMOFADA, n, "chegou"), `${n}`).toBeTruthy();
    }
  });

  it("sem motivo escolhido, a frase pergunta de onde veio", () => {
    expect(problemaDaEntrada(ALMOFADA, 3, "")).toMatch(/de onde esta peça veio/);
  });

  it("SOMA, nunca substitui — nem em 'achei na prateleira'", () => {
    // A tentação é tratar o encontrado como contagem ("passa a ser N"). Duas
    // pessoas conferindo prateleiras diferentes do MESMO item no mesmo dia
    // sobrescreveriam uma à outra, e o galpão perderia metade do que achou.
    expect(saldoDepoisDaEntrada(ALMOFADA, 8)).toBe(20);
    const depoisDeDois = saldoDepoisDaEntrada({ ...ALMOFADA, quantidade: 20 }, 5);
    expect(depoisDeDois, "somar é associativo; substituir não").toBe(25);
  });

  it("item que nunca teve saldo começa do zero, não de nulo", () => {
    expect(saldoDepoisDaEntrada({ ...ALMOFADA, quantidade: null }, 3)).toBe(3);
  });

  it("a frase final diz o que MUDOU, não 'ok'", () => {
    // Quem bipa no galpão não confere no computador depois: a tela é o recibo.
    expect(fraseDaEntrada(ALMOFADA, 8, 20)).toBe("+8 Almofada 22x22 · agora 20 un");
  });
});
