import { describe, it, expect } from "vitest";
import {
  estadoDeEtiqueta,
  UNIDADES_CONTAVEIS,
  UNIDADES_GRANEL,
  unidadeEhContavel,
} from "../estoque-etiquetavel";
import { UNIDADES_COMPRA } from "../estoque-unidade-compra";

/**
 * Aprovar uma atividade como "certo" só cunha a caixa lacrada quando o item é
 * `serializado`. Nenhum item de produção tinha essa flag, então todo "certo"
 * caía no ramo que apenas soma peças em `estoque_itens.quantidade` — e nunca
 * nascia etiqueta.
 *
 * Ligar a flag na marra é pior que o buraco. Duas coisas se perdem em silêncio:
 *
 *   - `estoque_itens.quantidade` é `numeric` (item a granel tem 1,5 kg);
 *     `estoque_unidades.quantidade` é `int > 0`. Converter fracionário TRUNCA
 *     e o saldo some pra sempre.
 *   - virar uma PILHA solta que já existe (191 peças) numa caixa única de 191
 *     cria um fantasma: a baixa é tudo-ou-nada, a guarda do banco passa a
 *     recusar digitar a quantidade e não existe papel colado em nada pra bipar.
 *
 * Este módulo é a decisão pura de "o que dá pra fazer com este item", antes de
 * qualquer escrita. Sem banco, sem permissão, sem efeito: só o estado e a frase
 * que a pessoa lê.
 */

describe("estadoDeEtiqueta", () => {
  describe("já etiquetado", () => {
    it("item serializado é o caso normal: cunha a caixa", () => {
      const r = estadoDeEtiqueta({ serializado: true, quantidade: 12, unidade: "un" });
      expect(r.estado).toBe("ja_etiquetado");
      expect(r.motivo).toMatch(/etiqueta/i);
    });

    it("serializado manda mesmo com unidade a granel ou saldo quebrado", () => {
      // Item já etiquetado não converte nada: a caixa nasce da quantidade
      // CONFERIDA, não do saldo da linha. Não há truncamento a evitar aqui, e
      // rebaixar um item que já tem papel colado quebraria a produção que
      // funciona hoje.
      expect(estadoDeEtiqueta({ serializado: true, quantidade: 1.5, unidade: "kg" }).estado).toBe("ja_etiquetado");
    });
  });

  describe("converter agora", () => {
    it("saldo zero e unidade contável: liga a flag e cunha", () => {
      const r = estadoDeEtiqueta({ serializado: false, quantidade: 0, unidade: "un" });
      expect(r.estado).toBe("converter_agora");
      expect(r.motivo).toMatch(/etiqueta/i);
    });

    it("unidade nula ou vazia conta como 'un' — é o default do banco", () => {
      expect(estadoDeEtiqueta({ serializado: false, quantidade: 0, unidade: null }).estado).toBe("converter_agora");
      expect(estadoDeEtiqueta({ serializado: false, quantidade: 0, unidade: "" }).estado).toBe("converter_agora");
      expect(estadoDeEtiqueta({ serializado: false, quantidade: 0, unidade: "   " }).estado).toBe("converter_agora");
    });

    it("quantidade nula conta como saldo zero", () => {
      expect(estadoDeEtiqueta({ serializado: false, quantidade: null, unidade: "cx" }).estado).toBe("converter_agora");
    });

    it("a unidade entra pelo vocabulário, não pela grafia", () => {
      // "PARES", "Caixa", "und" são a mesma coisa que 'par', 'cx', 'un'.
      expect(estadoDeEtiqueta({ serializado: false, quantidade: 0, unidade: "PARES" }).estado).toBe("converter_agora");
      expect(estadoDeEtiqueta({ serializado: false, quantidade: 0, unidade: "Caixa" }).estado).toBe("converter_agora");
      expect(estadoDeEtiqueta({ serializado: false, quantidade: 0, unidade: "und" }).estado).toBe("converter_agora");
    });
  });

  describe("precisa de preparo", () => {
    it("pilha antiga com saldo inteiro não converte sozinha", () => {
      const r = estadoDeEtiqueta({ serializado: false, quantidade: 191, unidade: "un" });
      expect(r.estado).toBe("precisa_preparo");
      // A frase tem que dizer o tamanho da pilha e o que fazer com ela.
      expect(r.motivo).toContain("191");
      expect(r.motivo).toMatch(/prepar/i);
    });

    it("vale pra qualquer unidade contável", () => {
      expect(estadoDeEtiqueta({ serializado: false, quantidade: 3, unidade: "ch" }).estado).toBe("precisa_preparo");
      expect(estadoDeEtiqueta({ serializado: false, quantidade: 1, unidade: "rolo" }).estado).toBe("precisa_preparo");
      expect(estadoDeEtiqueta({ serializado: false, quantidade: 7, unidade: null }).estado).toBe("precisa_preparo");
    });
  });

  describe("não etiquetável", () => {
    it("granel nunca vira etiqueta, nem com saldo zero", () => {
      for (const u of ["kg", "g", "L", "ml", "m", "m2", "galao"]) {
        const r = estadoDeEtiqueta({ serializado: false, quantidade: 0, unidade: u });
        expect(r.estado, `unidade ${u}`).toBe("nao_etiquetavel");
        expect(r.motivo.length).toBeGreaterThan(10);
      }
    });

    it("granel com saldo também: soma na contagem e explica por quê", () => {
      const r = estadoDeEtiqueta({ serializado: false, quantidade: 12.5, unidade: "kg" });
      expect(r.estado).toBe("nao_etiquetavel");
      expect(r.motivo).toMatch(/quilo/i);
    });

    it("fração derruba a etiqueta mesmo com unidade contável", () => {
      // A caixa é `int > 0`. 2,5 caixas viraria 2 e meia caixa sumiria calada.
      const r = estadoDeEtiqueta({ serializado: false, quantidade: 2.5, unidade: "un" });
      expect(r.estado).toBe("nao_etiquetavel");
      expect(r.motivo).toContain("2,5");
    });

    it("saldo negativo é acerto de contagem, não etiqueta", () => {
      const r = estadoDeEtiqueta({ serializado: false, quantidade: -4, unidade: "un" });
      expect(r.estado).toBe("nao_etiquetavel");
      expect(r.motivo).toMatch(/negativ/i);
    });

    it("quantidade sem número (NaN) não vira decisão de conversão", () => {
      const r = estadoDeEtiqueta({ serializado: false, quantidade: Number.NaN, unidade: "un" });
      expect(r.estado).toBe("nao_etiquetavel");
    });

    it("unidade fora do vocabulário não é chutada como contável", () => {
      // Unidade que ninguém cadastrou pode ser peso, volume ou comprimento. Na
      // dúvida não se converte: o caminho é arrumar a unidade primeiro.
      const r = estadoDeEtiqueta({ serializado: false, quantidade: 0, unidade: "bombona" });
      expect(r.estado).toBe("nao_etiquetavel");
      expect(r.motivo).toContain("bombona");
    });
  });

  describe("o motivo é uma frase que a pessoa lê", () => {
    it("nunca volta vazio, nunca tem código cru de estado", () => {
      const casos = [
        { serializado: true, quantidade: 1, unidade: "un" },
        { serializado: false, quantidade: 0, unidade: "un" },
        { serializado: false, quantidade: 191, unidade: "un" },
        { serializado: false, quantidade: 1.5, unidade: "kg" },
      ];
      for (const c of casos) {
        const { motivo } = estadoDeEtiqueta(c);
        expect(motivo.trim().length).toBeGreaterThan(15);
        expect(motivo).not.toMatch(/nao_etiquetavel|precisa_preparo|converter_agora|ja_etiquetado/);
      }
    });
  });
});

describe("vocabulário: contável × granel", () => {
  it("granel é exatamente peso, volume e comprimento", () => {
    expect([...UNIDADES_GRANEL].sort()).toEqual(["L", "g", "galao", "kg", "m", "m2", "ml"].sort());
  });

  it("os dois conjuntos cobrem o vocabulário real, sem sobra nem invenção", () => {
    const codigos = UNIDADES_COMPRA.map((u) => u.codigo).sort();
    expect([...UNIDADES_CONTAVEIS, ...UNIDADES_GRANEL].sort()).toEqual(codigos);
    // Nada em comum entre os dois.
    expect(UNIDADES_CONTAVEIS.filter((c) => UNIDADES_GRANEL.includes(c))).toEqual([]);
  });

  it("unidadeEhContavel entende vazio como 'un' e desconhecido como não", () => {
    expect(unidadeEhContavel("cx")).toBe(true);
    expect(unidadeEhContavel(null)).toBe(true);
    expect(unidadeEhContavel("")).toBe(true);
    expect(unidadeEhContavel("kg")).toBe(false);
    expect(unidadeEhContavel("bombona")).toBe(false);
  });
});
