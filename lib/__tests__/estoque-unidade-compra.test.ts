import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  UNIDADES_COMPRA,
  UNIDADE_PADRAO,
  normalizarUnidade,
  opcoesUnidade,
  rotuloUnidade,
  unidadeConhecida,
} from "../estoque-unidade-compra";

describe("unidade de compra da planilha do galpão", () => {
  it("as cinco que a planilha usa entram no vocabulário", () => {
    // UNIDADE, ROLO, GALÃO, PARES e PCT são as unidades da
    // "CONTROLE DE ESTOQUE TRIDI.xlsx". Antes disso, GALÃO e PARES não
    // existiam em lugar nenhum do sistema.
    expect(normalizarUnidade("UNIDADE")).toBe("un");
    expect(normalizarUnidade("ROLO")).toBe("rolo");
    expect(normalizarUnidade("GALÃO")).toBe("galao");
    expect(normalizarUnidade("PARES")).toBe("par");
    expect(normalizarUnidade("PCT")).toBe("pct");
  });

  it("a mesma unidade escrita de seis jeitos vira uma só", () => {
    for (const t of ["un", "UN", "Un.", "und", "unidade", "UNIDADES", "peças", "pc"]) {
      expect(normalizarUnidade(t)).toBe("un");
    }
    for (const t of ["galao", "GALÃO", "galões", "gal", "gl"]) {
      expect(normalizarUnidade(t)).toBe("galao");
    }
  });

  it("não engole o que não conhece — só apara", () => {
    expect(normalizarUnidade("  Bisnaga  ")).toBe("bisnaga");
    expect(unidadeConhecida("bisnaga")).toBe(false);
  });

  it("vazio é vazio; quem chama decide o padrão", () => {
    expect(normalizarUnidade("")).toBe("");
    expect(normalizarUnidade(null)).toBe("");
    expect(normalizarUnidade(undefined)).toBe("");
    expect(UNIDADE_PADRAO).toBe("un");
  });

  it("litro fica em L maiúsculo — 'l' colado no número lê como 1", () => {
    expect(normalizarUnidade("litros")).toBe("L");
    expect(normalizarUnidade("l")).toBe("L");
    expect(normalizarUnidade("L")).toBe("L");
  });

  it("normalizar duas vezes dá o mesmo — o banco não muda sozinho", () => {
    for (const u of UNIDADES_COMPRA) {
      expect(normalizarUnidade(u.codigo)).toBe(u.codigo);
      expect(normalizarUnidade(normalizarUnidade(u.rotulo))).toBe(u.codigo);
    }
  });

  it("nenhum sinônimo puxa duas unidades diferentes", () => {
    const dono = new Map<string, string>();
    for (const u of UNIDADES_COMPRA) {
      for (const s of [u.codigo, u.rotulo, u.plural, ...u.sinonimos]) {
        const k = s.toLowerCase();
        const antes = dono.get(k);
        expect(antes === undefined || antes === u.codigo,
          `"${s}" é sinônimo de ${antes} e de ${u.codigo} ao mesmo tempo`).toBe(true);
        dono.set(k, u.codigo);
      }
    }
  });
});

describe("nome por extenso", () => {
  it("concorda no plural", () => {
    expect(rotuloUnidade("rolo", 1)).toBe("rolo");
    expect(rotuloUnidade("rolo", 3)).toBe("rolos");
    expect(rotuloUnidade("galao", 2)).toBe("galões");
    expect(rotuloUnidade("par", 1)).toBe("par");
    expect(rotuloUnidade("par", 4)).toBe("pares");
  });

  it("sem número, é o rótulo do seletor", () => {
    expect(rotuloUnidade("pct")).toBe("Pacote");
    expect(rotuloUnidade("ch")).toBe("Chapa");
  });

  it("unidade desconhecida volta como veio", () => {
    expect(rotuloUnidade("bisnaga", 3)).toBe("bisnaga");
  });
});

describe("seletor", () => {
  it("mostra código e nome — 'ch' sozinho ninguém sabe o que é", () => {
    const o = opcoesUnidade("un");
    expect(o.find((x) => x.value === "ch")?.label).toBe("Chapa (ch)");
    expect(o.find((x) => x.value === "galao")?.label).toBe("Galão (galao)");
  });

  it("item legado com unidade fora da lista não perde a unidade ao abrir", () => {
    const o = opcoesUnidade("bisnaga");
    expect(o[0]).toEqual({ value: "bisnaga", label: "bisnaga (fora da lista)" });
    expect(o.filter((x) => x.value === "bisnaga")).toHaveLength(1);
  });

  it("não duplica quando a unidade atual já está na lista", () => {
    expect(opcoesUnidade("rolo").filter((x) => x.value === "rolo")).toHaveLength(1);
    expect(opcoesUnidade("").length).toBe(UNIDADES_COMPRA.length);
  });
});

describe("uma lista só, não duas", () => {
  // O Recebimento tinha a lista fixa dele, o editor de item tinha texto livre.
  // Duas listas viram duas verdades no primeiro item que alguém cadastrar.
  const raiz = join(__dirname, "..", "..");
  const ler = (p: string) => readFileSync(join(raiz, p), "utf8");

  it("Recebimento e editor de item leem o vocabulário, não uma cópia", () => {
    for (const arq of [
      "app/(plataforma)/estoque/RecebimentoPanel.tsx",
      "app/(plataforma)/estoque/ItemEditor.tsx",
    ]) {
      const src = ler(arq);
      expect(src, `${arq} deveria importar de lib/estoque-unidade-compra`)
        .toMatch(/estoque-unidade-compra/);
    }
  });

  it("ninguém guarda uma lista de unidades própria", () => {
    const src = ler("app/(plataforma)/estoque/RecebimentoPanel.tsx");
    expect(src).not.toMatch(/\[\s*"un"\s*,\s*"cx"/);
  });

  it("o servidor normaliza antes de gravar — o seletor não é o único portão", () => {
    // A importação da planilha escreve pela API, não pela tela: se a
    // normalização morasse só no <select>, "UNIDADE" e "PARES" entrariam
    // crus e o filtro do catálogo passaria a ter duas unidades pra mesma
    // coisa.
    const src = ler("app/api/estoque-itens/route.ts");
    expect(src).toMatch(/normalizarUnidade/);
    expect(src, "unidade ainda entra como texto cru").not.toMatch(/String\(b\.unidade\)\.trim\(\)/);
  });
});

// Regressão da revisão: célula de planilha que diz "não se aplica" com um
// traço não pode virar uma unidade chamada "-". A importação escreve direto em
// estoque_itens e gravava esse traço por cima da unidade certa do item.
describe("célula sem letra nem número é vazio, não unidade", () => {
  for (const cru of ["-", "—", "–", "/", "  ", "..."]) {
    it(`${JSON.stringify(cru)} → ""`, () => {
      expect(normalizarUnidade(cru)).toBe("");
    });
  }

  it("o que TEM letra ou número continua passando", () => {
    expect(normalizarUnidade("m2")).toBe("m2");
    expect(normalizarUnidade("m²")).toBe("m2");
    expect(normalizarUnidade("GALÃO")).toBe("galao");
  });
});
