import { describe, expect, it } from "vitest";
import { erros, avisos, paginaVazia, revisarPagina } from "../tridiflow-pagina-revisao";
import { PAGINA_VAZIA, novoBloco, novaSecao, type Bloco, type PaginaDoc } from "../tridiflow-pagina";
import { TEMPLATES_PAGINA } from "../tridiflow-pagina-templates";

/** Página com um bloco só — o suficiente pra isolar cada regra. */
function comBloco(patch: Partial<Bloco> & { tipo: Bloco["tipo"] }): PaginaDoc {
  const base = novoBloco(patch.tipo);
  const secao = novaSecao();
  secao.blocos = [{ ...base, ...patch }];
  return { ...PAGINA_VAZIA, secoes: [secao] };
}
const textos = (doc: PaginaDoc) => revisarPagina(doc).map((p) => p.texto);

describe("revisão antes de publicar", () => {
  it("botão sem link é ERRO e explica o que fazer", () => {
    const p = erros(revisarPagina(comBloco({ tipo: "botao", url: "" })));
    expect(p).toHaveLength(1);
    expect(p[0].texto).toMatch(/não leva a lugar nenhum/i);
    expect(p[0].comoResolver).toBeTruthy();     // nunca só "Erro"
    expect(p[0].blocoId).toBeTruthy();          // dá pra levar a pessoa até o bloco
  });

  it("link com protocolo perigoso é barrado", () => {
    // eslint-disable-next-line no-script-url
    expect(textos(comBloco({ tipo: "botao", url: "javascript:alert(1)" }))).toEqual([expect.stringMatching(/não é um endereço válido/i)]);
  });

  it("botão com link normal passa", () => {
    expect(revisarPagina(comBloco({ tipo: "botao", url: "https://pay.exemplo.com/x" }))).toEqual([]);
  });

  it("vídeo vazio e vídeo irreconhecível têm mensagens diferentes", () => {
    expect(textos(comBloco({ tipo: "video", video: { fonte: "url", url: "" } }))).toEqual([expect.stringMatching(/está vazio/i)]);
    expect(textos(comBloco({ tipo: "video", video: { fonte: "url", url: "isso não é um vídeo" } })))
      .toEqual([expect.stringMatching(/não reconhecemos/i)]);
  });

  it("YouTube passa", () => {
    expect(revisarPagina(comBloco({ tipo: "video", video: { fonte: "url", url: "https://youtu.be/dQw4w9WgXcQ" } }))).toEqual([]);
  });

  it("oferta sem checkout é erro; sem preço é só aviso", () => {
    const semTudo = revisarPagina(comBloco({ tipo: "oferta", oferta: { produto: "Kit", checkoutUrl: "", preco: "" } }));
    expect(erros(semTudo).map((p) => p.texto)).toEqual([expect.stringMatching(/sem link de compra/i)]);
    expect(avisos(semTudo).map((p) => p.texto)).toEqual([expect.stringMatching(/sem preço/i)]);
  });

  it("formulário: destino faltando vira erro conforme a ação escolhida", () => {
    const campos = [{ id: "c1", tipo: "email" as const, rotulo: "E-mail" }];
    expect(textos(comBloco({ tipo: "formulario", campos, envio: { acao: "redirect", url: "" } })))
      .toEqual([expect.stringMatching(/endereço está vazio/i)]);
    expect(textos(comBloco({ tipo: "formulario", campos, envio: { acao: "whatsapp", telefone: "" } })))
      .toEqual([expect.stringMatching(/não há número/i)]);
    expect(textos(comBloco({ tipo: "formulario", campos, envio: { acao: "fluxo", fluxoSlug: "" } })))
      .toEqual([expect.stringMatching(/nenhum foi escolhido/i)]);
  });

  it("formulário sem campo nenhum é erro", () => {
    const p = erros(revisarPagina(comBloco({ tipo: "formulario", campos: [], envio: { acao: "mensagem", mensagem: "Obrigado!" } })));
    expect(p.map((x) => x.texto)).toEqual([expect.stringMatching(/nenhum campo/i)]);
  });

  it("WhatsApp sem número é erro", () => {
    expect(erros(revisarPagina(comBloco({ tipo: "whatsapp", telefone: "" })))).toHaveLength(1);
  });

  it("bloco OCULTO não é cobrado — ele não vai pro ar", () => {
    expect(revisarPagina(comBloco({ tipo: "botao", url: "", oculto: true }))).toEqual([]);
  });

  it("página sem bloco nenhum é detectada", () => {
    expect(paginaVazia(PAGINA_VAZIA)).toBe(true);
    expect(paginaVazia(comBloco({ tipo: "titulo" }))).toBe(false);
  });

  // O que mais importa: os templates que a equipe usa não podem nascer
  // acusando erro — senão a revisão vira barulho e a pessoa ignora.
  it("template de fábrica só fica devendo DESTINO — nada quebrado", () => {
    // Um template não tem como saber o vídeo, o checkout, o link do botão nem o
    // WhatsApp: são campos de DESTINO, nascem vazios de propósito e a revisão
    // cobra na publicação — que é o papel dela. Já um erro de CONTEÚDO (form sem
    // campo, link inválido, ação sem alvo) seria defeito nosso no template.
    for (const t of TEMPLATES_PAGINA) {
      const quebrado = erros(revisarPagina(t.doc)).filter((p) => p.categoria === "conteudo");
      expect(quebrado, `${t.id}: ${quebrado.map((p) => p.texto).join(" · ")}`).toEqual([]);
    }
  });

  // ── Teste A/B ──────────────────────────────────────────────────────────────
  // Um teste com duas versões idênticas roda, divide o tráfego e enche o
  // placar sem poder ensinar nada. E só se descobre semanas depois, na hora de
  // ler o resultado — que é quando o prejuízo já foi o tempo perdido.
  const comTeste = (doc: PaginaDoc, ativo = true): PaginaDoc =>
    ({ ...doc, config: { ...doc.config, teste: { ativo } } });

  it("teste A/B ligado sem nenhum bloco marcado vira AVISO", () => {
    const doc = comTeste(comBloco({ tipo: "titulo", texto: "Oi" }));
    const p = avisos(revisarPagina(doc)).filter((x) => x.bloco === "Teste A/B");
    expect(p).toHaveLength(1);
    expect(p[0].texto).toMatch(/nenhum bloco/i);
    expect(p[0].comoResolver).toBeTruthy();
  });

  it("não é ERRO — a página funciona, só não ensina nada", () => {
    const doc = comTeste(comBloco({ tipo: "titulo", texto: "Oi" }));
    expect(erros(revisarPagina(doc)).filter((x) => x.bloco === "Teste A/B")).toEqual([]);
  });

  it("com bloco marcado, cala a boca", () => {
    const doc = comTeste(comBloco({ tipo: "titulo", texto: "Oi", teste: "b" }));
    expect(textos(doc).some((t) => /nenhum bloco/i.test(t))).toBe(false);
  });

  it("teste desligado nunca reclama, mesmo sem marca nenhuma", () => {
    const doc = comTeste(comBloco({ tipo: "titulo", texto: "Oi" }), false);
    expect(textos(doc).some((t) => /nenhum bloco/i.test(t))).toBe(false);
  });

  it("teste DESLIGADO com bloco “só B” avisa que ele sumiu", () => {
    // O caminho inverso, e o mais silencioso: desligar o teste faz a variante
    // efetiva virar "a", e todo bloco marcado B para de aparecer. Está certo —
    // B é a variação, não a página — mas ninguém adivinha isso semanas depois.
    const doc = comTeste(comBloco({ tipo: "titulo", texto: "Oi", teste: "b" }), false);
    const p = avisos(revisarPagina(doc)).filter((x) => x.bloco === "Teste A/B");
    expect(p).toHaveLength(1);
    expect(p[0].texto).toMatch(/não vão aparecer/i);
    expect(p[0].texto).toContain("1 bloco");
  });

  it("bloco “só A” com teste desligado NÃO avisa — ele aparece normalmente", () => {
    const doc = comTeste(comBloco({ tipo: "titulo", texto: "Oi", teste: "a" }), false);
    expect(avisos(revisarPagina(doc)).filter((x) => x.bloco === "Teste A/B")).toEqual([]);
  });
});
