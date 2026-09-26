import { describe, it, expect } from "vitest";
import { ordenarPorRelevancia, pontuarOpcao, normalizarTermo } from "../busca-em-opcoes";

/**
 * Achar a opção certa numa lista longa.
 *
 * Este arquivo nasce de um relato exato do dono: "não to conseguindo colocar
 * localização tipo: A, só o A". O galpão tem 89 lugares e o filtro era
 * `includes` puro — digitar "A" casava com 65 deles e punha a "A · Rua A" em
 * 10º; digitar "E" a punha em 65º. A resposta exata existia e estava
 * inalcançável, o que se lê como "essa opção não existe".
 */

// A forma REAL dos rótulos do galpão: "<código> · <nome>".
const LUGARES = [
  "A · Rua A",
  "A-01 · Estante de Ferramentas",
  "A-01-6 · Nível 6 (o mais alto)",
  "B · Rua B",
  "B-01 · Mesa Preta e Prateleira da Parede",
  "B-01-1 · Embaixo da mesa preta",
  "D-01-1 · Nível 1 (o mais baixo)",
  "E · Rua E · Expedição e Logística",
  "REC · Ponto de Recebimento (paletes no chão)",
];

describe("o código exato ganha de tudo", () => {
  it('digitar "A" põe a Rua A em PRIMEIRO — era o 10º de 65', () => {
    expect(ordenarPorRelevancia(LUGARES, "A", (s) => s)[0]).toBe("A · Rua A");
  });

  it('digitar "E" põe a Rua E em PRIMEIRO — era o 65º de 81', () => {
    expect(ordenarPorRelevancia(LUGARES, "E", (s) => s)[0]).toBe("E · Rua E · Expedição e Logística");
  });

  it("minúscula e maiúscula dão o mesmo resultado", () => {
    expect(ordenarPorRelevancia(LUGARES, "a", (s) => s)[0]).toBe("A · Rua A");
  });
});

describe("nada SOME da lista — só muda a ordem", () => {
  it("o conjunto que casa é o mesmo do `includes` de antes", () => {
    // A correção não podia esconder opção: quem varria a lista com uma letra
    // continua vendo tudo o que via, só que com a resposta exata no topo.
    const antes = LUGARES.filter((s) => s.toLowerCase().includes("a")).sort();
    const depois = [...ordenarPorRelevancia(LUGARES, "a", (s) => s)].sort();
    expect(depois).toEqual(antes);
  });

  it("sem termo, devolve TUDO na ordem original", () => {
    // A lista chega ordenada por `ordem` do banco; reordenar sem busca faria a
    // prateleira 3 aparecer antes da 1.
    expect(ordenarPorRelevancia(LUGARES, "", (s) => s)).toEqual(LUGARES);
    expect(ordenarPorRelevancia(LUGARES, "   ", (s) => s)).toEqual(LUGARES);
  });

  it("termo que não casa com nada devolve vazio", () => {
    expect(ordenarPorRelevancia(LUGARES, "zzz", (s) => s)).toEqual([]);
  });
});

describe("a escada de relevância", () => {
  it("código exato < prefixo de código < palavra < qualquer lugar", () => {
    const exato = pontuarOpcao("A · Rua A", "A")!;
    const prefixo = pontuarOpcao("A-01 · Estante de Ferramentas", "A")!;
    const palavra = pontuarOpcao("B · Rua B", "rua")!;
    const solto = pontuarOpcao("B-01-1 · Embaixo da mesa preta", "a")!;
    expect(exato).toBeLessThan(prefixo);
    expect(prefixo).toBeLessThan(solto);
    expect(palavra).toBeLessThan(solto);
  });

  it('"A-0" acha a estante sem passar na frente da rua "A"', () => {
    const ordem = ordenarPorRelevancia(LUGARES, "A-01", (s) => s);
    expect(ordem[0]).toBe("A-01 · Estante de Ferramentas");
  });

  it("empate mantém a ordem de origem", () => {
    // Duas opções igualmente relevantes não podem trocar de lugar entre
    // digitações — a lista pularia embaixo do dedo.
    const ordem = ordenarPorRelevancia(["X-2 · b", "X-1 · b"], "b", (s) => s);
    expect(ordem).toEqual(["X-2 · b", "X-1 · b"]);
  });

  it("não casa nada devolve null", () => {
    expect(pontuarOpcao("A · Rua A", "zzz")).toBeNull();
  });
});

describe("acento não atrapalha — ninguém digita acento de luva", () => {
  it('"nivel" acha "Nível"', () => {
    expect(ordenarPorRelevancia(LUGARES, "nivel", (s) => s)).toContain("A-01-6 · Nível 6 (o mais alto)");
  });

  it('"expedicao" acha "Expedição"', () => {
    expect(ordenarPorRelevancia(LUGARES, "expedicao", (s) => s)[0]).toBe("E · Rua E · Expedição e Logística");
  });

  it("normalizar tira acento e caixa", () => {
    expect(normalizarTermo("  NÍVEL  ")).toBe("nivel");
  });
});

describe("rótulo sem separador continua funcionando", () => {
  it("nos seletores que não têm código, o rótulo inteiro faz os dois papéis", () => {
    const nomes = ["Papel Cartão", "Papel Sulfite", "Cartão de visita"];
    expect(ordenarPorRelevancia(nomes, "Papel Cartão", (s) => s)[0]).toBe("Papel Cartão");
    expect(ordenarPorRelevancia(nomes, "cartao", (s) => s)[0]).toBe("Cartão de visita");
  });

  it("termo com caractere de regex não estoura", () => {
    // O casamento por palavra monta um RegExp com o termo dentro.
    expect(() => ordenarPorRelevancia(["a (b) c"], "(b)", (s) => s)).not.toThrow();
    expect(ordenarPorRelevancia(["a (b) c"], "(b)", (s) => s)).toEqual(["a (b) c"]);
  });
});
