import { describe, it, expect } from "vitest";
import { padraoDeNomeExato, mesmoNome, umItemPeloNome, ErroNomeAmbiguo } from "../estoque-nome";

/**
 * O item é resolvido pelo NOME em quase todo o módulo de Estoque (a atividade
 * guarda `produto_nome`, não `item_id`). O jeito antigo — `.ilike("nome", nome)`
 * com o nome cru — passava o nome como PADRÃO de LIKE: "ADESIVO 100% PP" virava
 * "ADESIVO 100" + qualquer coisa, e `_` casava um caractere qualquer. A
 * aprovação da conferência dava entrada no primeiro item que casasse.
 */
describe("padraoDeNomeExato", () => {
  it("escapa o coringa de porcentagem", () => {
    expect(padraoDeNomeExato("ADESIVO 100% PP")).toBe("ADESIVO 100\\% PP");
  });

  it("escapa o coringa de um caractere", () => {
    expect(padraoDeNomeExato("ROLO_KRAFT")).toBe("ROLO\\_KRAFT");
  });

  it("escapa a própria barra invertida ANTES dos outros — senão ela escaparia o escape", () => {
    expect(padraoDeNomeExato("A\\%B")).toBe("A\\\\\\%B");
  });

  it("nome comum passa intacto", () => {
    expect(padraoDeNomeExato("Alavanca montada")).toBe("Alavanca montada");
  });
});

describe("mesmoNome", () => {
  it("ignora caixa e espaço nas pontas — é como o galpão escreve", () => {
    expect(mesmoNome("Alavanca Montada", "  alavanca montada ")).toBe(true);
  });

  it("nome vazio nunca casa com nada, nem com outro vazio", () => {
    expect(mesmoNome("", "")).toBe(false);
    expect(mesmoNome(null, undefined)).toBe(false);
  });

  it("nome parecido NÃO casa — é justamente o que o LIKE deixava passar", () => {
    expect(mesmoNome("ADESIVO 100 GRAMAS", "ADESIVO 100% PP")).toBe(false);
  });
});

describe("umItemPeloNome", () => {
  it("descarta o vizinho que o LIKE trouxe por engano", () => {
    const achado = umItemPeloNome(
      [{ id: "1", nome: "ADESIVO 100 GRAMAS" }, { id: "2", nome: "ADESIVO 100% PP" }],
      "ADESIVO 100% PP",
    );
    expect(achado?.id).toBe("2");
  });

  it("nenhum casa: null (quem chama decide se isso é erro)", () => {
    expect(umItemPeloNome([{ nome: "Outro" }], "Alavanca")).toBeNull();
  });

  it("DOIS itens com o mesmo nome não são sorteados: é erro com nome próprio", () => {
    // Não há UNIQUE em `estoque_itens.nome`. Escolher em silêncio fazia o mesmo
    // produto abastecer um item hoje e outro amanhã, sem nada acusar.
    expect(() => umItemPeloNome(
      [{ id: "1", nome: "Alavanca" }, { id: "2", nome: "ALAVANCA" }],
      "alavanca",
    )).toThrow(ErroNomeAmbiguo);
  });

  it("lista vazia ou ausente: null, sem estourar", () => {
    expect(umItemPeloNome([], "X")).toBeNull();
    expect(umItemPeloNome(null, "X")).toBeNull();
  });
});
