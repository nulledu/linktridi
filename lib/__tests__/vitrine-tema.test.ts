import { describe, it, expect } from "vitest";
import {
  adicionarBloco, adicionarSecao, ajustarSecao, alternarSecao, blocosDaSecao,
  moverBloco, moverSecao, normalizarTema, removerSecao, secoesDoTemplate, temaVazio,
} from "@/lib/vitrine/tema";
import { comAlfa, escurecer, luminosidade, rgbTexto, textoSobre } from "@/lib/vitrine/cor";
import { variaveisDoTema } from "@/lib/vitrine/variaveis";
import { colecoesDaLoja, produtosDaColecao } from "@/lib/vitrine/colecoes";
import type { Produto } from "@/lib/lojas";

// ── Trava do motor de tema ───────────────────────────────────────────────────
// O tema é jsonb de loja PUBLICADA. Isso muda o que precisa de teste: não é a
// tela, é o dado velho. Um tema salvo mês passado não conhece a seção que
// nasceu ontem, e um tema mexido à mão pode apontar pra seção que não existe
// mais — os dois casos chegam na vitrine do visitante, não no editor.
//
// Por isso a normalização é o que mais se testa aqui: ela é a única defesa
// entre um JSON velho e uma loja em branco na cara de quem ia comprar.

const produto = (id: string, categorias: string[]): Produto => ({
  id, lojaId: "l1", titulo: `Produto ${id}`, descricao: "",
  imagens: [{ id: `${id}-1`, url: `/f/${id}.png`, alt: "" }],
  preco: 100, precoPromocional: null, custo: null, estoque: 5,
  venderSemEstoque: false, sku: "", codigoBarras: "", categorias,
  status: "ativo", atualizadoEm: "2026-08-01T00:00:00Z",
});

describe("normalizarTema", () => {
  it("devolve tema utilizável a partir de lixo", () => {
    for (const entrada of [null, undefined, 0, "tema", [], { secoes: 3 }]) {
      const t = normalizarTema(entrada);
      expect(t.versao).toBe(1);
      expect(t.ordem.inicio).toEqual([]);
      // Ajuste global sem valor guardado nasce com o padrão, senão a variável
      // CSS sai vazia e a loja abre preta no branco.
      expect(t.ajustes.background).toBe("#f7f7f7");
    }
  });

  it("descarta seção de tipo que não existe mais, e a tira da ordem", () => {
    const t = normalizarTema({
      versao: 1, modelo: "warehouse", ajustes: {},
      secoes: {
        viva: { tipo: "rich-text", ajustes: { title: "Oi" } },
        morta: { tipo: "secao-que-nao-existe", ajustes: {} },
      },
      fixas: { topo: [], rodape: [] },
      ordem: { inicio: ["morta", "viva"] },
    });
    expect(Object.keys(t.secoes)).toEqual(["viva"]);
    // A ordem não pode ficar apontando pro fantasma: a vitrine renderiza por
    // ela, e um id sem seção é o `undefined` que derruba a página inteira.
    expect(t.ordem.inicio).toEqual(["viva"]);
  });

  it("dá à seção velha os ajustes que o schema ganhou depois", () => {
    const t = normalizarTema({
      secoes: { s: { tipo: "featured-collection", ajustes: { title: "Mais vendidos" } } },
      ordem: { inicio: ["s"] },
    });
    expect(t.secoes.s.ajustes.title).toBe("Mais vendidos");
    expect(t.secoes.s.ajustes.products_count).toBe(12);
    expect(t.secoes.s.ajustes.layout).toBe("vertical");
  });

  it("não deixa seção fixa entrar na ordem de um template", () => {
    const t = normalizarTema({
      secoes: { h: { tipo: "header", ajustes: {} } },
      fixas: { topo: ["h"], rodape: ["h"] },
      ordem: { inicio: ["h"] },
    });
    expect(t.fixas.topo).toEqual(["h"]);
    expect(t.fixas.rodape).toEqual([]); // o cabeçalho é da faixa de cima
    expect(t.ordem.inicio).toEqual([]);
  });

  it("põe no fim o bloco que ficou fora da ordem, em vez de sumir com ele", () => {
    const t = normalizarTema({
      secoes: {
        s: {
          tipo: "slideshow", ajustes: {},
          blocos: { a: { tipo: "image", ajustes: {} }, b: { tipo: "image", ajustes: {} } },
          ordemBlocos: ["b"],
        },
      },
      ordem: { inicio: ["s"] },
    });
    expect(t.secoes.s.ordemBlocos).toEqual(["b", "a"]);
  });
});

describe("operações do editor", () => {
  it("não muta o tema recebido", () => {
    const t = adicionarSecao(temaVazio(), "rich-text", "inicio");
    const antes = JSON.stringify(t);
    ajustarSecao(t, t.ordem.inicio[0], "title", "outro");
    moverSecao(t, "inicio", 0, 1);
    removerSecao(t, t.ordem.inicio[0]);
    // Mutar faria o React não repintar a prévia — o defeito mais chato de achar
    // num editor, porque o dado está certo e a tela está velha.
    expect(JSON.stringify(t)).toBe(antes);
  });

  it("adiciona, reordena e remove seção", () => {
    let t = temaVazio();
    t = adicionarSecao(t, "slideshow", "inicio");
    t = adicionarSecao(t, "rich-text", "inicio");
    t = adicionarSecao(t, "featured-collection", "inicio", 0);
    expect(t.ordem.inicio.map((id) => t.secoes[id].tipo))
      .toEqual(["featured-collection", "slideshow", "rich-text"]);

    t = moverSecao(t, "inicio", 0, 2);
    expect(t.ordem.inicio.map((id) => t.secoes[id].tipo))
      .toEqual(["slideshow", "rich-text", "featured-collection"]);

    const alvo = t.ordem.inicio[1];
    t = removerSecao(t, alvo);
    expect(t.secoes[alvo]).toBeUndefined();
    expect(t.ordem.inicio).toHaveLength(2);
  });

  it("recusa seção presa a outro template e seção fixa", () => {
    const t = temaVazio();
    expect(adicionarSecao(t, "product-template", "inicio").ordem.inicio).toEqual([]);
    expect(adicionarSecao(t, "header", "inicio").ordem.inicio).toEqual([]);
  });

  it("respeita o teto de blocos da seção", () => {
    let t = adicionarSecao(temaVazio(), "doublebanner", "inicio");
    const id = t.ordem.inicio[0];
    expect(t.secoes[id].ordemBlocos).toHaveLength(2); // nasce com os dois
    t = adicionarBloco(t, id, "banner");
    expect(t.secoes[id].ordemBlocos).toHaveLength(2); // o teto é 2
  });

  it("reordena bloco dentro da seção", () => {
    let t = adicionarSecao(temaVazio(), "slideshow", "inicio");
    const id = t.ordem.inicio[0];
    t = adicionarBloco(t, id, "image");
    const [a, b] = t.secoes[id].ordemBlocos!;
    t = moverBloco(t, id, 0, 1);
    expect(t.secoes[id].ordemBlocos).toEqual([b, a]);
  });

  it("seção desativada some da vitrine mas continua no tema", () => {
    let t = adicionarSecao(temaVazio(), "rich-text", "inicio");
    const id = t.ordem.inicio[0];
    t = alternarSecao(t, id);
    expect(secoesDoTemplate(t, "inicio")).toEqual([]);
    expect(t.secoes[id]).toBeDefined();
    expect(blocosDaSecao(t.secoes[id])).toEqual([]);
  });
});

describe("cor, do jeito que o Liquid faz", () => {
  it("lê hex de 3 e de 6, e rgb()", () => {
    expect(rgbTexto("#fff")).toBe("255, 255, 255");
    expect(rgbTexto("#9207ff")).toBe("146, 7, 255");
    expect(rgbTexto("rgb(1, 2, 3)")).toBe("1, 2, 3");
  });

  it("escurece em pontos de luminosidade, não em RGB", () => {
    expect(luminosidade("#808080")).toBe(50);
    expect(luminosidade(escurecer("#808080", 10))).toBe(40);
    expect(escurecer("#000000", 20)).toBe("#000000"); // não passa do chão
  });

  it("alfa vira rgba, que é o que o theme.css espera", () => {
    expect(comAlfa("#00d864", 0.11)).toBe("rgba(0, 216, 100, 0.11)");
  });

  it("texto sobre fundo colorido segue o corte de 65 do tema", () => {
    // Não é contraste calculado: é a regra do Liquid, e copiar o
    // COMPORTAMENTO é o ponto — inclusive onde ele erraria.
    expect(luminosidade("#00d864")).toBe(42);
    expect(textoSobre("#00d864")).toBe("#ffffff"); // 42 < 65 → escreve em branco
    expect(luminosidade("#ffb647")).toBe(64);
    expect(textoSobre("#ffb647")).toBe("#ffffff"); // 64 ainda está abaixo do corte
    expect(textoSobre("#e7e7e7")).toBe("#000000");
    expect(textoSobre("#1e2d7d")).toBe("#ffffff");
    expect(textoSobre("#ffffff")).toBe("#000000");
  });
});

describe("variáveis do tema", () => {
  it("escreve os nomes que o theme.css procura", () => {
    const css = variaveisDoTema(normalizarTema({ ajustes: { accent_color: "#a18fff" } }));
    for (const nome of [
      "--text-color", "--heading-color", "--accent-color-rgb", "--form-border-color",
      "--primary-button-background", "--header-background", "--footer-background",
      "--product-cor-do-preco", "--mobile-container-gutter",
    ]) {
      // Renomear qualquer uma pra algo mais bonito faz a regra do theme.css
      // não achar valor — e a loja abre sem cor nenhuma.
      expect(css).toContain(nome);
    }
    expect(css).toContain("--accent-color:#a18fff");
    expect(css).toContain("--accent-background:rgba(161, 143, 255, 0.08)");
  });
});

describe("coleção é categoria", () => {
  const catalogo = [
    produto("a", ["Carimbos", "Mais vendidos"]),
    produto("b", ["Chancela"]),
    produto("c", ["Carimbos"]),
    produto("d", []),
  ];

  it("deduz as coleções do catálogo, em ordem estável", () => {
    const cs = colecoesDaLoja(catalogo);
    expect(cs.map((c) => c.handle)).toEqual(["carimbos", "chancela", "mais-vendidos"]);
    expect(cs[0].quantidade).toBe(2);
    expect(cs[0].capa).toBe("/f/a.png");
  });

  it("filtra por handle e devolve tudo quando não há filtro", () => {
    expect(produtosDaColecao(catalogo, "carimbos").map((p) => p.id)).toEqual(["a", "c"]);
    expect(produtosDaColecao(catalogo, "")).toHaveLength(4);
    expect(produtosDaColecao(catalogo, "todos-os-produtos")).toHaveLength(4);
    expect(produtosDaColecao(catalogo, "inexistente")).toEqual([]);
  });
});
