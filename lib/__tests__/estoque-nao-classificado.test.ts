import { describe, it, expect } from "vitest";
import {
  HIERARQUIAS, LABEL_SEM_HIERARQUIA, SEM_HIERARQUIA,
  abaDoItem, isHierarquia, naoClassificado, podeCompor,
} from "../estoque-hierarquia";
import { GRUPOS_DO_GALPAO, sugestoesDeCategoria } from "../estoque-categoria";

// Item com `hierarquia` nula não aparecia em NENHUMA das oito abas do catálogo:
// existia no banco e não existia na tela. Como a planilha do galpão entra com
// 81 itens assim, "sem hierarquia" precisava deixar de ser um buraco e virar um
// lugar com nome. Estes testes travam as duas metades disso: o balde reconhece
// todos os jeitos de estar fora, e ele NÃO vira uma nona hierarquia.

describe("O estado 'sem hierarquia'", () => {
  it("reconhece nulo, vazio e valor fora da lista — os três somem da tela igual", () => {
    expect(naoClassificado(null)).toBe(true);
    expect(naoClassificado(undefined)).toBe(true);
    expect(naoClassificado("")).toBe(true);
    // Linha legada com um dos eixos mortos (`classe`) escrita na coluna nova:
    // não casa com aba nenhuma, então pertence ao mesmo balde.
    expect(naoClassificado("acabado")).toBe(true);
    expect(naoClassificado("peca")).toBe(false);
  });

  it("todas as oito hierarquias de verdade são classificadas", () => {
    for (const h of HIERARQUIAS) expect(naoClassificado(h)).toBe(false);
  });

  it("a aba do item é a hierarquia dele, ou o balde — nunca undefined", () => {
    expect(abaDoItem("produto")).toBe("produto");
    expect(abaDoItem(null)).toBe(SEM_HIERARQUIA);
    expect(abaDoItem("lixo")).toBe(SEM_HIERARQUIA);
  });

  it("NÃO é uma nona hierarquia: a matriz de composição não a conhece", () => {
    // Se a chave do balde vazasse pra `HIERARQUIAS`, a API aceitaria gravar
    // "sem_hierarquia" na coluna e o item ficaria invisível com um valor que
    // parece válido — pior que o nulo, porque some do próprio balde.
    expect(isHierarquia(SEM_HIERARQUIA)).toBe(false);
    expect((HIERARQUIAS as readonly string[]).includes(SEM_HIERARQUIA)).toBe(false);
    expect(podeCompor("peca", SEM_HIERARQUIA)).toBe(false);
    expect(podeCompor(SEM_HIERARQUIA, "componente")).toBe(false);
    expect(LABEL_SEM_HIERARQUIA.length).toBeGreaterThan(0);
  });
});

describe("Categoria — o outro eixo", () => {
  it("sugere primeiro os grupos que o galpão já usa falando", () => {
    const s = sugestoesDeCategoria([]);
    expect(s.slice(0, GRUPOS_DO_GALPAO.length)).toEqual([...GRUPOS_DO_GALPAO]);
  });

  it("junta o que o catálogo já tem, em ordem, sem repetir", () => {
    const s = sugestoesDeCategoria(["Tintas", "Almofadas", "Tintas", null, "  ", undefined]);
    expect(s).toContain("Almofadas");
    expect(s).toContain("Tintas");
    expect(s.filter((c) => c === "Tintas")).toHaveLength(1);
    expect(s.indexOf("Almofadas")).toBeLessThan(s.indexOf("Tintas"));
    expect(s).not.toContain("");
  });

  it("não ensina a criar categoria duplicada por causa de caixa ou espaço", () => {
    const s = sugestoesDeCategoria([" logística ", "LOGÍSTICA", "Máquinas"]);
    expect(s.filter((c) => c.toLocaleLowerCase("pt-BR").trim() === "logística")).toHaveLength(1);
    expect(s.filter((c) => c === "Máquinas")).toHaveLength(1);
  });
});
