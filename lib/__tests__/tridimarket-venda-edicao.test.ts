import { describe, expect, it } from "vitest";
import { planoDeQuantidade, totalDosItens } from "../tridimarket/venda-edicao";

const linha = (id: number, quantidade: number, precoUnit = 12.99) => ({ id, quantidade, precoUnit });

describe("editar a quantidade de um item da venda", () => {
  // O caso do print: "Pringles original 104g ×2" é UMA linha com quantidade 2.
  // Clicar em "−" mandava alvo=1, que batia com linhas.length=1 na versão
  // antiga e não caía em ramo nenhum — nada acontecia.
  it("baixar de 2 pra 1 mexe na linha que existe", () => {
    const p = planoDeQuantidade([linha(7, 2)], 1);
    expect(p.manter).toBe(7);
    expect(p.novaQuantidade).toBe(1);
    expect(p.remover).toEqual([]);
  });

  it("subir de 2 pra 3 também mexe na linha, não cria linha nova", () => {
    const p = planoDeQuantidade([linha(7, 2)], 3);
    expect(p).toEqual({ manter: 7, novaQuantidade: 3, remover: [] });
  });

  it("zerar apaga a linha", () => {
    expect(planoDeQuantidade([linha(7, 2)], 0)).toEqual({ manter: null, novaQuantidade: 0, remover: [7] });
  });

  it("quantidade negativa é tratada como zero", () => {
    expect(planoDeQuantidade([linha(7, 2)], -3).remover).toEqual([7]);
  });

  it("mesmo produto repartido em várias linhas consolida numa só", () => {
    // Sem consolidar, a tela mostraria 4 e a venda cobraria as duas sobras.
    const p = planoDeQuantidade([linha(9, 1), linha(7, 2), linha(8, 1)], 4);
    expect(p.manter).toBe(7);          // menor id = a mais antiga
    expect(p.novaQuantidade).toBe(4);
    expect(p.remover).toEqual([8, 9]);
  });

  it("sem linha nenhuma não inventa nada", () => {
    expect(planoDeQuantidade([], 3)).toEqual({ manter: null, novaQuantidade: 0, remover: [] });
  });
});

describe("total da venda a partir das linhas", () => {
  it("soma quantidade × preço", () => {
    expect(totalDosItens([linha(1, 2, 12.99), linha(2, 1, 3.65)])).toBe(29.63);
  });

  it("não carrega erro de ponto flutuante", () => {
    expect(totalDosItens([linha(1, 3, 0.1)])).toBe(0.3);
  });

  it("venda sem item vale zero", () => {
    expect(totalDosItens([])).toBe(0);
  });
});
