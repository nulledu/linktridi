import { describe, it, expect } from "vitest";
import {
  codigoDeTexto, expandirFaixa, separarLocal, triarListaLocais,
} from "@/lib/estoque-locais-lote";

// A aba Localização abre com zero lugares e o galpão tem dezenas. O que este
// arquivo trava: colar a lista tem que produzir EXATAMENTE o que a tela mostra
// (o código vai impresso na prateleira — surpresa aqui é etiqueta errada), e a
// faixa "A1..A6" tem que ser faixa só quando é mesmo uma faixa.

describe("código derivado do texto", () => {
  it("é maiúsculo, sem acento e sem espaço", () => {
    expect(codigoDeTexto("Prateleira B2")).toBe("PRATELEIRA-B2");
    expect(codigoDeTexto("Depósito")).toBe("DEPOSITO");
    expect(codigoDeTexto(" a1 ")).toBe("A1");
  });
});

describe("uma linha vira código + nome", () => {
  it("separa quando a pessoa escreveu os dois", () => {
    expect(separarLocal("B2 · Prateleira do fundo")).toEqual({ codigo: "B2", nome: "Prateleira do fundo" });
    expect(separarLocal("B2\tPrateleira do fundo")).toEqual({ codigo: "B2", nome: "Prateleira do fundo" });
    expect(separarLocal("B2 - Prateleira do fundo")).toEqual({ codigo: "B2", nome: "Prateleira do fundo" });
    expect(separarLocal("B2, Prateleira do fundo")).toEqual({ codigo: "B2", nome: "Prateleira do fundo" });
  });

  it("sem separador, a linha é as duas coisas", () => {
    expect(separarLocal("A1")).toEqual({ codigo: "A1", nome: "A1" });
    expect(separarLocal("Sala de tintas")).toEqual({ codigo: "SALA-DE-TINTAS", nome: "Sala de tintas" });
  });

  it("tira marcador de lista e numeração da planilha", () => {
    expect(separarLocal("- A1")).toEqual({ codigo: "A1", nome: "A1" });
    expect(separarLocal("3) B2 · Prateleira")).toEqual({ codigo: "B2", nome: "Prateleira" });
  });
});

describe("faixa A1..A6", () => {
  it("expande mantendo o prefixo e o zero à esquerda", () => {
    expect(expandirFaixa("A1..A6")).toEqual(["A1", "A2", "A3", "A4", "A5", "A6"]);
    expect(expandirFaixa("A01 .. A03")).toEqual(["A01", "A02", "A03"]);
  });

  it("não inventa lugar quando não é faixa", () => {
    expect(expandirFaixa("B2..FUNDO")).toBeNull();      // prefixos diferentes
    expect(expandirFaixa("A6..A1")).toBeNull();          // de trás pra frente
    expect(expandirFaixa("Prateleira do fundo")).toBeNull();
    expect(expandirFaixa("A1..A500")).toBeNull();        // acima do teto de uma faixa
  });
});

describe("triagem da colagem", () => {
  it("um corredor inteiro sai de uma linha só", () => {
    const t = triarListaLocais("A1..A6", []);
    expect(t.novos).toBe(6);
    expect(t.linhas.map((l) => l.codigo)).toEqual(["A1", "A2", "A3", "A4", "A5", "A6"]);
  });

  it("o que já existe não entra de novo — e diz com que nome", () => {
    const t = triarListaLocais("B2 · Prateleira do fundo\nB3 · Prateleira do meio", [{ codigo: "b2", nome: "Fundo" }]);
    expect(t.linhas[0].situacao).toBe("existente");
    expect(t.linhas[0].aviso).toContain("Fundo");
    expect(t.linhas[1].situacao).toBe("novo");
    expect(t.novos).toBe(1);
  });

  it("código repetido na própria colagem entra uma vez só", () => {
    const t = triarListaLocais("A1\na1\nA2", []);
    expect(t.linhas.map((l) => l.situacao)).toEqual(["novo", "repetido", "novo"]);
    expect(t.novos).toBe(2);
  });

  it("cabeçalho de planilha nasce desmarcado, sem sumir", () => {
    const t = triarListaLocais("Código\nA1", []);
    expect(t.linhas[0].situacao).toBe("suspeito");
    expect(t.linhas[0].marcar).toBe(false);
    expect(t.novos).toBe(1);
  });

  it("avisa quando o código não caberia numa etiqueta de prateleira", () => {
    const t = triarListaLocais("Prateleira do fundo do corredor A", []);
    expect(t.linhas[0].situacao).toBe("novo");
    expect(t.linhas[0].aviso).toContain("Código comprido");
  });

  it("não estoura o teto quando alguém cola a coluna inteira", () => {
    const t = triarListaLocais(Array.from({ length: 400 }, (_, i) => `L${i}`).join("\n"), []);
    expect(t.linhas.length).toBeLessThanOrEqual(200);
  });
});
