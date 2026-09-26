import { describe, it, expect } from "vitest";
import {
  HIERARQUIAS, COMPOSICAO, podeCompor, filhosPermitidos, nivelDaHierarquia,
  isHierarquia, hierarquiaLabel, validarFicha,
} from "../estoque-hierarquia";

describe("estoque-hierarquia", () => {
  it("tem exatamente as 8 hierarquias do pedido", () => {
    expect([...HIERARQUIAS]).toEqual([
      "materia_prima", "insumo_direto", "insumo_indireto", "embalagem",
      "mp_processada", "componente", "peca", "produto",
    ]);
  });

  it("toda hierarquia tem entrada na matriz de composição", () => {
    // Sem isto, um tipo novo entra na lista e `COMPOSICAO[tipo]` volta undefined
    // — `podeCompor` estoura em vez de recusar.
    for (const h of HIERARQUIAS) expect(COMPOSICAO[h]).toBeDefined();
  });

  // ── A escada ───────────────────────────────────────────────────────────────
  // A regra é uma frase: composto pelo meu nível pra baixo, nunca por algo
  // acima. Testar a frase (e não a lista degrau a degrau) é o que impede a
  // matriz de voltar a ser escrita à mão e divergir da tela.
  it("aceita tudo do próprio nível pra baixo e recusa o que está acima", () => {
    for (const pai of HIERARQUIAS) {
      for (const filho of HIERARQUIAS) {
        const abaixoOuIgual = nivelDaHierarquia(filho) <= nivelDaHierarquia(pai);
        expect(podeCompor(pai, filho)).toBe(abaixoOuIgual);
      }
    }
  });

  it("o caso que estava barrado: produto direto da matéria-prima", () => {
    // "Às vezes um produto usa matéria-prima e já vira produto" — a matriz
    // antiga exigia passar por componente, e as 21 peças do catálogo ficaram
    // sem ficha nenhuma por causa disso.
    expect(podeCompor("produto", "materia_prima")).toBe(true);
    expect(podeCompor("peca", "materia_prima")).toBe(true);
    expect(podeCompor("peca", "insumo_direto")).toBe(true);
    expect(podeCompor("peca", "mp_processada")).toBe(true);
    expect(podeCompor("produto", "peca")).toBe(true);
  });

  it("não sobe a escada", () => {
    expect(podeCompor("materia_prima", "produto")).toBe(false);
    expect(podeCompor("componente", "peca")).toBe(false);
    expect(podeCompor("mp_processada", "componente")).toBe(false);
    expect(podeCompor("insumo_direto", "embalagem")).toBe(false);
  });

  it("mesmo nível é permitido — a caixa que leva o saco", () => {
    // Duas embalagens, uma dentro da outra, já existem no catálogo. Quem
    // impede o ciclo é a checagem por ITEM em /api/ficha-tecnica: hierarquia
    // não sabe distinguir dois itens do mesmo degrau, e fingir que sabia era
    // o que barrava o caso legítimo.
    for (const h of HIERARQUIAS) expect(podeCompor(h, h)).toBe(true);
  });

  it("Insumo Indireto entra em toda composição, menos abaixo dele", () => {
    // É a regra "presente em todas as composições": ele é o terceiro degrau,
    // então só matéria-prima e insumo direto ficam de fora — e esses dois
    // estão ABAIXO dele, não acima.
    for (const h of HIERARQUIAS) {
      const esperado = nivelDaHierarquia(h) >= nivelDaHierarquia("insumo_indireto");
      expect(podeCompor(h, "insumo_indireto")).toBe(esperado);
    }
  });

  it("recusa entrada que não é hierarquia, em vez de estourar", () => {
    expect(podeCompor("produto", "banana")).toBe(false);
    expect(podeCompor(null, "peca")).toBe(false);
    expect(podeCompor(undefined, undefined)).toBe(false);
    expect(isHierarquia("produto")).toBe(true);
    expect(isHierarquia("acabado")).toBe(false); // classe antiga não cola
  });

  it("filhosPermitidos alimenta o seletor da tela", () => {
    expect([...filhosPermitidos("peca")]).toEqual([
      "materia_prima", "insumo_direto", "insumo_indireto", "embalagem",
      "mp_processada", "componente", "peca",
    ]);
    expect([...filhosPermitidos("materia_prima")]).toEqual(["materia_prima"]);
    expect([...filhosPermitidos("qualquer coisa")]).toEqual([]);
  });

  it("hierarquiaLabel devolve travessão pro desconhecido", () => {
    expect(hierarquiaLabel("peca")).toBe("Peça");
    expect(hierarquiaLabel(null)).toBe("—");
  });

  describe("validarFicha", () => {
    it("aceita ficha inteira válida", () => {
      const r = validarFicha("produto", [
        { nome: "Peça A", hierarquia: "peca" },
        { nome: "Caixa M", hierarquia: "embalagem" },
        { nome: "MDF 6mm", hierarquia: "materia_prima" },
      ]);
      expect(r.ok).toBe(true);
      expect(r.invalidos).toEqual([]);
    });

    it("aponta NOMINALMENTE quem não pode entrar", () => {
      // A API devolve isso pro usuário: "Mesa Pronta não pode entrar em
      // Componente" é acionável; "composição inválida" manda a pessoa
      // adivinhar qual linha.
      const r = validarFicha("componente", [
        { nome: "MDF 6mm", hierarquia: "materia_prima" },
        { nome: "Mesa Pronta", hierarquia: "produto" },
      ]);
      expect(r.ok).toBe(false);
      expect(r.invalidos).toEqual([{ nome: "Mesa Pronta", hierarquia: "produto" }]);
    });

    it("matéria-prima não aceita nada acima dela", () => {
      const r = validarFicha("materia_prima", [{ nome: "Cola", hierarquia: "insumo_direto" }]);
      expect(r.ok).toBe(false);
    });

    it("ficha vazia é sempre válida (item comprado pronto)", () => {
      expect(validarFicha("produto", []).ok).toBe(true);
      expect(validarFicha("materia_prima", []).ok).toBe(true);
    });

    it("componente sem hierarquia definida é recusado, não ignorado", () => {
      // Item legado sem `hierarquia` migrada entraria calado numa ficha proibida.
      const r = validarFicha("produto", [{ nome: "Legado", hierarquia: null }]);
      expect(r.ok).toBe(false);
      expect(r.invalidos).toHaveLength(1);
    });
  });
});
