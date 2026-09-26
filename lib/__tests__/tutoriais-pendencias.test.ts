import { describe, expect, it } from "vitest";
import { normalizarTutorial, type Tutorial } from "@/lib/tridiflow-tutoriais";
import { pendenciasDoTutorial } from "@/lib/tridiflow-tutoriais-pendencias";

// Pendências: o que falta pro tutorial ficar bom, dito ANTES de ir pro ar e
// com o caminho até o campo. Só título e endereço impedem salvar — o resto é
// aviso, porque um guia sem capa ainda é melhor que guia nenhum.
const base = (extra: Record<string, unknown> = {}): Tutorial => normalizarTutorial({
  id: "t1", titulo: "Carimbo em papel", handle: "carimbo-em-papel", descricao: "Como carimbar papel sem borrar.",
  capaUrl: "https://cdn/capa.webp", categoriaId: "c1", status: "publicado", blocos: [
    { id: "p1", tipo: "passo", titulo: "Prepare a almofada", conteudo: "<p>Espalhe a tinta.</p>" },
  ], ...extra,
});
const ctx = { handlesOutros: ["limpeza"], temCategorias: true };
const chaves = (t: Tutorial, c = ctx) => pendenciasDoTutorial(t, c).map((p) => p.chave);

describe("pendências do tutorial", () => {
  it("tutorial completo não tem pendência", () => {
    expect(pendenciasDoTutorial(base(), ctx)).toEqual([]);
  });

  it("título vazio e endereço repetido bloqueiam; o resto só avisa", () => {
    const p = pendenciasDoTutorial(base({ titulo: "", handle: "limpeza" }), ctx);
    expect(p.filter((x) => x.nivel === "bloqueia").map((x) => x.alvo)).toEqual(["titulo", "endereco"]);
  });

  it("bloqueios vêm antes dos avisos", () => {
    const p = pendenciasDoTutorial(base({ titulo: "", capaUrl: "" }), ctx);
    expect(p[0].nivel).toBe("bloqueia");
    expect(p.at(-1)?.nivel).toBe("aviso");
  });

  it("sem capa, sem descrição, descrição longa e sem categoria avisam", () => {
    expect(chaves(base({ capaUrl: "" }))).toEqual(["sem-capa"]);
    expect(chaves(base({ descricao: "" }))).toEqual(["sem-descricao"]);
    expect(chaves(base({ descricao: "x".repeat(200) }))).toEqual(["descricao-longa"]);
    expect(chaves(base({ categoriaId: null }))).toEqual(["sem-categoria"]);
    // Central sem categorias: ninguém precisa escolher uma.
    expect(chaves(base({ categoriaId: null }), { ...ctx, temCategorias: false })).toEqual([]);
  });

  it("sem conteúdo avisa", () => {
    expect(chaves(base({ blocos: [] }))).toEqual(["sem-conteudo"]);
  });

  it("passo vazio, sem título e foto sem descrição apontam pro bloco, com o número do passo", () => {
    const t = base({ blocos: [
      { id: "p1", tipo: "passo", titulo: "Ok", conteudo: "<p>x</p>" },
      { id: "p2", tipo: "passo", titulo: "", conteudo: "" },
      { id: "p3", tipo: "passo", titulo: "Com foto", conteudo: "", imagemUrl: "https://cdn/f.webp", imagemAlt: "" },
    ] });
    const p = pendenciasDoTutorial(t, ctx);
    expect(p.map((x) => [x.chave, x.alvo])).toEqual([
      ["passo-sem-titulo", "bloco:p2"], ["passo-vazio", "bloco:p2"], ["foto-sem-descricao", "bloco:p3"],
    ]);
    expect(p[0].texto).toContain("Passo 2");
  });

  it("link pra tutorial que não existe e link sem destino avisam", () => {
    const t = base({ blocos: [
      { id: "p1", tipo: "passo", titulo: "Ok", conteudo: "<p>x</p>" },
      { id: "l1", tipo: "link", titulo: "Limpeza", tutorial: "sumiu", url: "" },
      { id: "l2", tipo: "link", titulo: "Site", url: "javascript:alert(1)" },
      { id: "l3", tipo: "link", titulo: "Ok", tutorial: "limpeza" },
    ] });
    expect(chaves(t)).toEqual(["link-tutorial-inexistente", "link-sem-destino"]);
  });

  it("vídeo, imagem, aviso e 'deu errado?' vazios avisam", () => {
    const t = base({ blocos: [
      { id: "p1", tipo: "passo", titulo: "Ok", conteudo: "<p>x</p>" },
      { id: "v1", tipo: "video", url: "nao-e-link" },
      { id: "i1", tipo: "imagem", url: "" },
      { id: "i2", tipo: "imagem", url: "https://cdn/f.webp", alt: "" },
      { id: "a1", tipo: "aviso", estilo: "atencao", conteudo: "" },
      { id: "d1", tipo: "problemas", itens: [] },
    ] });
    expect(chaves(t)).toEqual(["video-sem-link", "imagem-sem-foto", "foto-sem-descricao", "aviso-vazio", "problemas-vazio"]);
  });
});
