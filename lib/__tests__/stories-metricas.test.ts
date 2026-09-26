import { describe, it, expect } from "vitest";
import {
  conversao, formatarConversao, formatarInteiro, leituraDaComparacao, maisCliques, melhorConversao,
  melhorPorVendas, ordenar, porSemana, porTipo, posicaoNo, resumir,
} from "../marketing-stories/metricas";
import type { Story } from "../marketing-stories/tipos";

/**
 * Os números que o time calculava olhando o Miro. O que este arquivo trava:
 *  1. conversão = vendas ÷ cliques, escrita como o time lê (14,5% e 5,06%);
 *  2. três pódios diferentes — vendas, cliques, conversão — e o de conversão
 *     com amostra mínima (1 clique e 1 venda não é "100% de conversão");
 *  3. empate vai pra quem publicou primeiro, e a ordem é estável.
 */

const S = (p: Partial<Story> & { id: string }): Story => ({
  publicadoEm: "2026-09-10T15:00:00.000Z", status: "publicado", midiaUrl: null, midiaTipo: null, capaUrl: null,
  largura: null, altura: null, duracao: null, hashVisual: null, produtoId: null, tipo: null, campanha: null,
  tema: null, cta: null, linkUrl: null, cliques: 0, vendas: 0, observacoes: null, criadorNome: null,
  createdAt: "", updatedAt: "", ...p,
});

describe("conversão", () => {
  it("é vendas ÷ cliques × 100, com duas casas", () => {
    expect(conversao(124, 18)).toBe(14.52);
    expect(conversao(310, 12)).toBe(3.87);
    expect(conversao(0, 5)).toBeNull();
  });

  it("sai escrita como o time lê", () => {
    expect(formatarConversao(14.52)).toBe("14,5%");
    expect(formatarConversao(5.06)).toBe("5,06%");
    expect(formatarConversao(3.87)).toBe("3,87%");
    expect(formatarConversao(0)).toBe("0%");
    expect(formatarConversao(null)).toBe("—");
  });

  it("inteiro com ponto de milhar", () => {
    expect(formatarInteiro(8420)).toBe("8.420");
  });
});

describe("resumo", () => {
  it("planejado não conta como publicado, mas os números somam", () => {
    const r = resumir([S({ id: "a", cliques: 100, vendas: 5 }), S({ id: "b", cliques: 50, vendas: 5 }), S({ id: "c", status: "planejado" })]);
    expect(r).toEqual({ stories: 3, publicados: 2, cliques: 150, vendas: 10, conversao: 6.67 });
  });
});

describe("ranking", () => {
  const a = S({ id: "a", cliques: 124, vendas: 18, publicadoEm: "2026-09-02T12:00:00.000Z" });
  const b = S({ id: "b", cliques: 310, vendas: 12, publicadoEm: "2026-09-03T12:00:00.000Z" });
  const c = S({ id: "c", cliques: 1, vendas: 1, publicadoEm: "2026-09-04T12:00:00.000Z" });

  it("cada pergunta tem o seu vencedor", () => {
    expect(melhorPorVendas([a, b, c])?.id).toBe("a");
    expect(maisCliques([a, b, c])?.id).toBe("b");
  });

  it("1 clique e 1 venda (100%) não ganha a conversão de quem tem amostra", () => {
    expect(melhorConversao([a, b, c])?.id).toBe("a");
    expect(ordenar([c, b, a], "conversao").map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("empate vai pra quem publicou primeiro", () => {
    const x = S({ id: "x", vendas: 5, cliques: 50, publicadoEm: "2026-09-05T00:00:00.000Z" });
    const y = S({ id: "y", vendas: 5, cliques: 50, publicadoEm: "2026-09-01T00:00:00.000Z" });
    expect(melhorPorVendas([x, y])?.id).toBe("y");
    expect(ordenar([x, y], "vendas").map((s) => s.id)).toEqual(ordenar([y, x], "vendas").map((s) => s.id));
  });

  it("sem venda não há melhor da semana; sem clique, não há mais clicado", () => {
    expect(melhorPorVendas([S({ id: "z", cliques: 10 })])).toBeNull();
    expect(maisCliques([S({ id: "z" })])).toBeNull();
    expect(melhorConversao([S({ id: "z", cliques: 5, vendas: 5 })])).toBeNull();
  });

  it("posição só entre quem tem o número", () => {
    expect(posicaoNo([a, b, c], "b", "vendas")).toBe(2);
    expect(posicaoNo([a, b, c], "c", "conversao")).toBeNull();
  });
});

describe("agrupamentos", () => {
  it("por semana: usa o dia de Brasília e semana vazia continua existindo", () => {
    const g = porSemana([
      S({ id: "a", publicadoEm: "2026-09-07T02:00:00.000Z", vendas: 3 }), // 06/09 23h em Brasília
      S({ id: "b", publicadoEm: "2026-09-15T15:00:00.000Z" }),
      S({ id: "fora", publicadoEm: "2026-10-02T15:00:00.000Z" }),
    ], "2026-09");
    expect(g).toHaveLength(5);
    expect(g[0].stories.map((s) => s.id)).toEqual(["a"]);
    expect(g[0].resumo.vendas).toBe(3);
    expect(g[1].stories).toHaveLength(0);
    expect(g[2].stories.map((s) => s.id)).toEqual(["b"]);
  });

  it("por tipo: do que mais vende pro que menos", () => {
    const t = porTipo([
      S({ id: "a", tipo: "oferta", vendas: 10, cliques: 100 }),
      S({ id: "b", tipo: "depoimento", vendas: 2, cliques: 80 }),
      S({ id: "c", tipo: "oferta", vendas: 5, cliques: 50 }),
    ]);
    expect(t[0]).toEqual({ tipo: "oferta", stories: 2, cliques: 150, vendas: 15, conversao: 10 });
    expect(t[1].tipo).toBe("depoimento");
  });
});

describe("leitura da comparação", () => {
  const letra = (s: Story) => s.id.toUpperCase();

  it("mais clique não é mais venda", () => {
    const a = S({ id: "a", cliques: 124, vendas: 18 });
    const b = S({ id: "b", cliques: 310, vendas: 12 });
    expect(leituraDaComparacao([a, b], letra)).toBe("B teve 2,5× mais cliques, mas A vendeu 50% mais. Mais clique não é mais venda.");
  });

  it("quando o mesmo ganha nas duas pontas, diz isso", () => {
    const a = S({ id: "a", cliques: 300, vendas: 20 });
    const b = S({ id: "b", cliques: 100, vendas: 5 });
    expect(leituraDaComparacao([a, b], letra)).toBe("A ganhou nas duas pontas: mais cliques e mais vendas.");
  });

  it("sem número anotado não inventa leitura", () => {
    expect(leituraDaComparacao([S({ id: "a" }), S({ id: "b" })], letra)).toMatch(/Nenhum/);
    expect(leituraDaComparacao([S({ id: "a" })], letra)).toBeNull();
  });
});
