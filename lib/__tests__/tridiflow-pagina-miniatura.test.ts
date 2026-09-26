import { describe, expect, it } from "vitest";
import { miniaturaDaPagina } from "../tridiflow-pagina-miniatura";
import { PAGINA_VAZIA, novoBloco, novaSecao, type Bloco, type PaginaDoc } from "../tridiflow-pagina";
import { TEMPLATES_PAGINA } from "../tridiflow-pagina-templates";

function pagina(blocos: Bloco[]): PaginaDoc {
  const s = novaSecao();
  s.blocos = blocos;
  return { ...PAGINA_VAZIA, secoes: [s] };
}
const b = (tipo: Bloco["tipo"], patch: Partial<Bloco> = {}) => ({ ...novoBloco(tipo), ...patch });

describe("miniatura da página", () => {
  it("traduz cada bloco no traço certo, na ordem", () => {
    expect(miniaturaDaPagina(pagina([b("titulo"), b("video"), b("formulario")])).tracos)
      .toEqual(["titulo", "midia", "campos"]);
  });

  it("não desenha o que não vai pro ar", () => {
    expect(miniaturaDaPagina(pagina([b("titulo", { oculto: true }), b("botao")])).tracos).toEqual(["acao"]);
    const doc = pagina([b("titulo")]);
    doc.secoes[0].oculto = true;
    expect(miniaturaDaPagina(doc).tracos).toEqual([]);
  });

  it("entra em container e colunas — quem desenha é o filho", () => {
    const dentro = b("container", { blocos: [b("titulo"), b("texto")] });
    const lado = b("colunas", { colunas: [{ id: "c1", blocos: [b("imagem")] }, { id: "c2", blocos: [b("botao")] }] });
    expect(miniaturaDaPagina(pagina([dentro, lado])).tracos).toEqual(["titulo", "texto", "midia", "acao"]);
  });

  it("limita os traços mas conta os blocos de verdade", () => {
    const m = miniaturaDaPagina(pagina(Array.from({ length: 20 }, () => b("texto"))));
    expect(m.tracos).toHaveLength(12);
    expect(m.blocos).toBe(20);
  });

  it("usa as cores da página e cai no padrão quando não há", () => {
    const doc = pagina([b("titulo")]);
    doc.config = { ...doc.config, corFundo: "#101014", corPrimaria: "#00ff88" };
    const m = miniaturaDaPagina(doc);
    expect([m.corFundo, m.corPrimaria]).toEqual(["#101014", "#00ff88"]);
    expect(miniaturaDaPagina(PAGINA_VAZIA).corFundo).toBe("#ffffff");
  });

  // A listagem cai no ícone da marca quando a silhueta é vazia. Só o template
  // "branco" pode depender desse fallback — ele nasce sem bloco de propósito.
  it("todo template com conteúdo gera silhueta; o branco fica vazio", () => {
    for (const t of TEMPLATES_PAGINA) {
      const m = miniaturaDaPagina(t.doc);
      if (t.id === "branco") { expect(m.blocos, t.id).toBe(0); continue; }
      expect(m.tracos.length, t.id).toBeGreaterThan(0);
      expect(m.blocos, t.id).toBeGreaterThan(0);
    }
  });
});
