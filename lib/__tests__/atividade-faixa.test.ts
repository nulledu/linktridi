import { describe, it, expect } from "vitest";
import { faixaDoSetorResponsavel, faixaPorPalavraChave, faixaDaAtividade, podeFaixa } from "../atividade-faixa";

describe("faixaDoSetorResponsavel", () => {
  it("Máquinas → maquinas (sem acento/caixa também)", () => {
    expect(faixaDoSetorResponsavel("Máquinas")).toBe("maquinas");
    expect(faixaDoSetorResponsavel("maquina")).toBe("maquinas");
  });
  it("Preparo → preparo", () => {
    expect(faixaDoSetorResponsavel("Preparo")).toBe("preparo");
  });
  it("montagem/estoque/vazio → producao ou null", () => {
    expect(faixaDoSetorResponsavel("Montagem de Peças")).toBe("producao");
    expect(faixaDoSetorResponsavel("Montagem Final")).toBe("producao");
    expect(faixaDoSetorResponsavel("Estoque / Compras")).toBe("producao");
    expect(faixaDoSetorResponsavel(null)).toBeNull();
    expect(faixaDoSetorResponsavel("")).toBeNull();
  });
});

describe("faixaPorPalavraChave", () => {
  it("preparar/chapa/tinta/montar caixa → preparo", () => {
    expect(faixaPorPalavraChave("Preparar chapa MDF")).toBe("preparo");
    expect(faixaPorPalavraChave("Produzir Tinta papel vermelha 30ml")).toBe("preparo");
    expect(faixaPorPalavraChave("Cortar chapa de EVA")).toBe("preparo");
    expect(faixaPorPalavraChave("Montar caixa G")).toBe("preparo");
  });
  it("o resto → producao", () => {
    expect(faixaPorPalavraChave("Produzir Chancela")).toBe("producao");
    expect(faixaPorPalavraChave("Montar alavancas")).toBe("producao");
    expect(faixaPorPalavraChave("")).toBe("producao");
  });
});

describe("faixaDaAtividade", () => {
  it("o item MANDA; palavra-chave só cobre o vazio", () => {
    // item diz maquinas, mesmo que a tarefa tenha 'tinta'
    expect(faixaDaAtividade("Máquinas", "Produzir Tinta X")).toBe("maquinas");
    // item vazio → cai na palavra-chave
    expect(faixaDaAtividade(null, "Preparar chapa")).toBe("preparo");
    expect(faixaDaAtividade(null, "Produzir Chancela")).toBe("producao");
  });
});

describe("podeFaixa", () => {
  it("Máquinas só pega maquinas", () => {
    expect(podeFaixa("Máquinas", "maquinas")).toBe(true);
    expect(podeFaixa("Máquinas", "producao")).toBe(false);
    expect(podeFaixa("Máquinas", "preparo")).toBe(false);
  });
  it("Preparo só pega preparo", () => {
    expect(podeFaixa("Preparo", "preparo")).toBe(true);
    expect(podeFaixa("Preparo", "producao")).toBe(false);
    expect(podeFaixa("Preparo", "maquinas")).toBe(false);
  });
  it("Chancela/Carimbo/Ambos/vazio só pegam producao (nunca maquinas/preparo)", () => {
    for (const e of ["Chancela", "Carimbo", "Ambos", "", null]) {
      expect(podeFaixa(e, "producao")).toBe(true);
      expect(podeFaixa(e, "maquinas")).toBe(false);
      expect(podeFaixa(e, "preparo")).toBe(false);
    }
  });
  it("faixa ausente na atividade conta como producao", () => {
    expect(podeFaixa("Ambos", null)).toBe(true);
    expect(podeFaixa("Máquinas", null)).toBe(false);
  });
});
