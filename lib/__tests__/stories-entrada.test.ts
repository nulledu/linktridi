import { describe, it, expect } from "vitest";
import { limparStory } from "../marketing-stories/entrada";

/**
 * O que a rota de stories aceita — POST e PATCH passam pela mesma limpeza.
 * O que este arquivo trava: número torto, link `javascript:`, mídia de OUTRA
 * área e campo que a tela não deveria mandar morrem aqui, antes do banco.
 */

const AGORA = new Date("2026-09-14T12:00:00.000Z");
const URL_OK = "/api/arquivos/stories/2026/09/3f1c2a4e-1111-4222-8333-444455556666.webp";

describe("limparStory", () => {
  it("aceita um story completo e arruma o texto", () => {
    const r = limparStory({
      publicadoEm: "2026-09-12T17:30:00.000Z", status: "publicado", tipo: "oferta",
      produtoId: "3F1C2A4E-1111-4222-8333-444455556666", tema: "  Desconto   20% ", cliques: "124", vendas: 18,
      midiaUrl: URL_OK, midiaTipo: "imagem", capaUrl: URL_OK, largura: 1080, altura: 1920,
      hashVisual: "00ff00ff00ff00ff", linkUrl: "https://tridi.com.br/kit", observacoes: "linha 1\nlinha 2",
    }, AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados).toMatchObject({
      tema: "Desconto 20%", cliques: 124, vendas: 18, produtoId: "3f1c2a4e-1111-4222-8333-444455556666",
      largura: 1080, hashVisual: "00ff00ff00ff00ff", observacoes: "linha 1\nlinha 2",
    });
  });

  it("recusa número negativo, quebrado ou absurdo", () => {
    expect(limparStory({ cliques: -1 })).toEqual({ ok: false, erro: "cliques_invalido" });
    expect(limparStory({ vendas: 2.5 })).toEqual({ ok: false, erro: "vendas_invalido" });
    expect(limparStory({ vendas: 1e9 })).toEqual({ ok: false, erro: "vendas_invalido" });
    expect(limparStory({ cliques: "doze" })).toEqual({ ok: false, erro: "cliques_invalido" });
  });

  it("mídia só vale se for da área de stories", () => {
    expect(limparStory({ midiaUrl: "/api/arquivos/criativos/2026/09/abc.jpg", midiaTipo: "imagem" }))
      .toEqual({ ok: false, erro: "midia_invalida" });
    expect(limparStory({ midiaUrl: "https://outro.site/x.jpg", midiaTipo: "imagem" }))
      .toEqual({ ok: false, erro: "midia_invalida" });
  });

  it("mídia sem tipo é recusada; tirar a mídia leva miniatura e medidas junto", () => {
    expect(limparStory({ midiaUrl: URL_OK })).toEqual({ ok: false, erro: "midia_sem_tipo" });
    expect(limparStory({ midiaUrl: null, largura: 1080 })).toEqual({
      ok: true,
      dados: { midiaUrl: null, midiaTipo: null, capaUrl: null, largura: null, altura: null, duracao: null, hashVisual: null },
    });
  });

  it("link só http(s)", () => {
    expect(limparStory({ linkUrl: "javascript:alert(1)" })).toEqual({ ok: false, erro: "link_invalido" });
    expect(limparStory({ linkUrl: "" })).toEqual({ ok: true, dados: { linkUrl: null } });
  });

  it("data fora da faixa ou que não é data", () => {
    expect(limparStory({ publicadoEm: "2015-01-01T00:00:00.000Z" }, AGORA).ok).toBe(false);
    expect(limparStory({ publicadoEm: "2030-01-01T00:00:00.000Z" }, AGORA).ok).toBe(false);
    expect(limparStory({ publicadoEm: "ontem" }, AGORA).ok).toBe(false);
    expect(limparStory({ publicadoEm: "2026-12-24T12:00:00.000Z" }, AGORA).ok).toBe(true); // planejado
  });

  it("tipo, status e produto fora da lista", () => {
    expect(limparStory({ tipo: "meme" })).toEqual({ ok: false, erro: "tipo_invalido" });
    expect(limparStory({ status: "aprovado" })).toEqual({ ok: false, erro: "status_invalido" });
    expect(limparStory({ produtoId: "Carimbo" })).toEqual({ ok: false, erro: "produto_invalido" });
    expect(limparStory({ tipo: "", produtoId: null })).toEqual({ ok: true, dados: { tipo: null, produtoId: null } });
  });

  it("campo que a tela não grava é ignorado (conversão é gerada, autor vem da sessão)", () => {
    expect(limparStory({ id: "x", conversao: 99, criadorNome: "outra pessoa" })).toEqual({ ok: true, dados: {} });
  });

  it("corpo que não é objeto", () => {
    expect(limparStory(null).ok).toBe(false);
    expect(limparStory([1, 2]).ok).toBe(false);
  });
});
