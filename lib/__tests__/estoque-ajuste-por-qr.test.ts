import { describe, it, expect } from "vitest";
import {
  motivosDoAjuste, motivoValidoNoAjuste, problemaDoAjuste, saldoDepoisDoAjuste,
  motivoParaHistorico, fraseDoAjuste, MAX_POR_AJUSTE, type ItemDoAjuste,
} from "../estoque-ajuste-por-qr";
import { MOTIVOS_BAIXA } from "../estoque-unidades";
import { MOTIVOS_DE_ENTRADA } from "../estoque-entrada";

/**
 * Ajustar estoque pelo QR da prateleira.
 *
 * Estar de pé na frente da prateleira é o momento em que se descobre que o
 * número está errado — e ter que voltar ao computador é o que faz ninguém
 * corrigir. O que este arquivo trava é que a correção não crie problemas
 * piores que o erro que ela conserta.
 */

const ALMOFADA: ItemDoAjuste = { id: "i1", nome: "Almofada 22x22", quantidade: 12, unidade: "un", serializado: false };
const CAIXA: ItemDoAjuste = { id: "i2", nome: "Folha de alavanca", quantidade: 191, unidade: "un", serializado: true };

const ok = (over: Partial<Parameters<typeof problemaDoAjuste>[0]> = {}) =>
  problemaDoAjuste({ item: ALMOFADA, sentido: "entrada", quantidade: 5, motivo: "chegou", podeAjustar: true, ...over });

describe("ajuste pelo QR", () => {
  it("reusa o vocabulário que já existe, em vez de inventar um terceiro", () => {
    // Três conjuntos de motivo pro mesmo evento fariam nenhum relatório fechar.
    expect(motivosDoAjuste("entrada").map((m) => m.key)).toEqual(MOTIVOS_DE_ENTRADA.map((m) => m.key));
    expect(motivosDoAjuste("saida").map((m) => m.key)).toEqual(MOTIVOS_BAIXA.map((m) => m.key));
  });

  it("motivo de um sentido não vale no outro", () => {
    expect(motivoValidoNoAjuste("entrada", "chegou")).toBe(true);
    expect(motivoValidoNoAjuste("entrada", "consumido")).toBe(false);
    expect(motivoValidoNoAjuste("saida", "consumido")).toBe(true);
    expect(motivoValidoNoAjuste("saida", "chegou")).toBe(false);
  });

  it("sem permissão, a frase diz QUAL permissão pedir", () => {
    const p = ok({ podeAjustar: false });
    expect(p).toMatch(/Ajustar quantidade/);
  });

  it("item contado por etiqueta é recusado, com o caminho certo nas duas direções", () => {
    const p = problemaDoAjuste({ item: CAIXA, sentido: "saida", quantidade: 1, motivo: "consumido", podeAjustar: true });
    expect(p).toMatch(/bipe a etiqueta/);
    expect(p).toMatch(/gere as etiquetas/);
  });

  it("NÃO deixa o estoque ficar negativo — e ensina a corrigir na ordem certa", () => {
    // Tirar 20 de um item que tem 12 significa que o SALDO está errado, não que
    // saíram 20. Somar a diferença primeiro é o que deixa o histórico verdadeiro.
    const p = problemaDoAjuste({ item: ALMOFADA, sentido: "saida", quantidade: 20, motivo: "consumido", podeAjustar: true });
    expect(p).toMatch(/tem 12 un/);
    expect(p).toMatch(/Achei na prateleira/);
  });

  it("tirar exatamente o que tem é permitido", () => {
    expect(problemaDoAjuste({ item: ALMOFADA, sentido: "saida", quantidade: 12, motivo: "consumido", podeAjustar: true })).toBeNull();
  });

  it("o teto do celular é mais apertado que o do totem", () => {
    // Aqui a pessoa está de pé com o celular; carga entra por Receber.
    expect(ok({ quantidade: MAX_POR_AJUSTE })).toBeNull();
    expect(ok({ quantidade: MAX_POR_AJUSTE + 1 })).toMatch(/Receber|Bipar/);
  });

  it("quantidade quebrada é recusada", () => {
    for (const n of [0, -1, 2.5, NaN]) expect(ok({ quantidade: n }), `${n}`).toBeTruthy();
  });

  it("o saldo soma ou subtrai, e nunca passa de zero pra baixo", () => {
    expect(saldoDepoisDoAjuste(ALMOFADA, "entrada", 8)).toBe(20);
    expect(saldoDepoisDoAjuste(ALMOFADA, "saida", 5)).toBe(7);
    // Cinto e suspensório: a guarda já recusou, mas se alguém chamar direto o
    // resultado é zero, não -8.
    expect(saldoDepoisDoAjuste(ALMOFADA, "saida", 20)).toBe(0);
  });

  it("o histórico registra o sentido, o motivo e que veio do QR", () => {
    // Sem a marca "(qr)" ninguém distingue depois um ajuste feito na prateleira
    // de um lançado no computador — e são confiabilidades diferentes.
    expect(motivoParaHistorico("entrada", "encontrado")).toBe("entrada:encontrado (qr)");
    expect(motivoParaHistorico("saida", "perdido", "caiu da estante")).toBe("saida:perdido (qr) · caiu da estante");
  });

  it("a frase do recibo mostra o sinal e o saldo novo", () => {
    expect(fraseDoAjuste(ALMOFADA, "entrada", 8, 20)).toBe("+8 Almofada 22x22 · agora 20 un");
    expect(fraseDoAjuste(ALMOFADA, "saida", 5, 7)).toBe("−5 Almofada 22x22 · agora 7 un");
  });
});
