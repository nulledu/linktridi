import { describe, expect, it } from "vitest";
import {
  cartaoDoTutorial,
  hrefDoLink,
  linkWhatsapp,
  metaDoTutorial,
  minutosDeLeitura,
  normalizarCentralTutoriais,
  normalizarTutorial,
  numeroWhatsapp,
  textoParaHtml,
  type CentralTutoriaisDoc,
  type Tutorial,
} from "@/lib/tridiflow-tutoriais";
import { aplicarOperacao, ErroCentral, lerOperacao, ordenarPorIds } from "@/lib/tridiflow-tutoriais-operacoes";

// Cada mudança do editor é uma OPERAÇÃO aplicada sobre o documento atual — no
// cliente pra tela responder na hora, no servidor pra valer. Antes o editor
// mandava a central INTEIRA a cada clique: duas abas abertas (ou duas pessoas)
// se sobrescreviam, e o último a salvar apagava o tutorial do outro.

const tut = (id: string, titulo: string, extra: Partial<Tutorial> = {}): Tutorial => normalizarTutorial({
  id, titulo, handle: extra.handle ?? id, status: "publicado", ordem: 0, blocos: [], ...extra,
});

const doc = (extra: Partial<CentralTutoriaisDoc> = {}): CentralTutoriaisDoc => normalizarCentralTutoriais({
  titulo: "Central",
  categorias: [
    { id: "c1", nome: "Carimbo", ordem: 0, ativa: true },
    { id: "c2", nome: "Chancela", ordem: 1, ativa: true },
  ],
  tutoriais: [
    tut("a", "Carimbo em papel", { categoriaId: "c1", ordem: 0 }),
    tut("b", "Carimbo em tecido", { categoriaId: "c1", ordem: 1 }),
    tut("c", "Chancela", { categoriaId: "c2", ordem: 2 }),
  ],
  ...extra,
});

describe("operações da central", () => {
  it("tutorial novo entra no FIM, com endereço tirado do título", () => {
    const d = aplicarOperacao(doc(), { op: "salvarTutorial", tutorial: tut("n", "Limpeza do carimbo", { handle: "" }) });
    expect(d.tutoriais.map((t) => t.id)).toEqual(["a", "b", "c", "n"]);
    expect(d.tutoriais[3].handle).toBe("limpeza-do-carimbo");
    expect(d.tutoriais[3].ordem).toBe(3);
  });

  it("editar mantém a posição do tutorial na lista", () => {
    const d = aplicarOperacao(doc(), { op: "salvarTutorial", tutorial: { ...doc().tutoriais[0], titulo: "Papel (novo)", ordem: 99 } });
    expect(d.tutoriais.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(d.tutoriais[0].titulo).toBe("Papel (novo)");
  });

  it("recusa endereço que já é de outro tutorial — o link antigo passaria a abrir outro guia", () => {
    expect(() => aplicarOperacao(doc(), { op: "salvarTutorial", tutorial: tut("n", "Outro", { handle: "b" }) }))
      .toThrow(ErroCentral);
  });

  it("recusa tutorial sem título", () => {
    expect(() => aplicarOperacao(doc(), { op: "salvarTutorial", tutorial: tut("n", "   ") })).toThrow(/título/);
  });

  it("categoria que não existe mais vira 'sem categoria' em vez de sumir com o tutorial", () => {
    const d = aplicarOperacao(doc(), { op: "salvarTutorial", tutorial: tut("n", "Novo", { categoriaId: "fantasma" }) });
    expect(d.tutoriais.find((t) => t.id === "n")?.categoriaId).toBeNull();
  });

  it("excluir tutorial tira só ele", () => {
    const d = aplicarOperacao(doc(), { op: "excluirTutorial", id: "b" });
    expect(d.tutoriais.map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("reordenar segue a lista de ids; quem o cliente não conhecia vai pro fim", () => {
    // O "d" chegou por outra aba depois que esta carregou: não pode sumir.
    const base = aplicarOperacao(doc(), { op: "salvarTutorial", tutorial: tut("d", "Novo de outra aba") });
    const d = aplicarOperacao(base, { op: "ordenarTutoriais", ids: ["c", "a", "b"] });
    expect(d.tutoriais.map((t) => t.id)).toEqual(["c", "a", "b", "d"]);
    expect(d.tutoriais.map((t) => t.ordem)).toEqual([0, 1, 2, 3]);
  });

  it("excluir categoria deixa os tutoriais dela sem categoria", () => {
    const d = aplicarOperacao(doc(), { op: "excluirCategoria", id: "c1" });
    expect(d.categorias.map((c) => c.id)).toEqual(["c2"]);
    expect(d.tutoriais.filter((t) => t.categoriaId === null).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("categoria nova entra no fim; sem nome é recusada", () => {
    const d = aplicarOperacao(doc(), { op: "salvarCategoria", categoria: { id: "c3", nome: "Sinete", imagemUrl: "", ordem: 0, ativa: true } });
    expect(d.categorias.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    expect(() => aplicarOperacao(doc(), { op: "salvarCategoria", categoria: { id: "c4", nome: " ", imagemUrl: "", ordem: 0, ativa: true } })).toThrow(ErroCentral);
  });

  it("reordenar categorias", () => {
    const d = aplicarOperacao(doc(), { op: "ordenarCategorias", ids: ["c2", "c1"] });
    expect(d.categorias.map((c) => c.id)).toEqual(["c2", "c1"]);
  });

  it("configurações passam pela mesma normalização do documento", () => {
    const d = aplicarOperacao(doc(), { op: "salvarConfig", campos: { titulo: "Ajuda Tridi", sobrelinha: "", whatsapp: "(11) 99999-9999", atalhos: [
      { id: "x", rotulo: "Início", icone: "home", acao: "topo", url: "", destaque: false },
      { id: "y", rotulo: "Contato", icone: "brand-whatsapp", acao: "link", url: "wa.me/5511999999999", destaque: true },
    ] } });
    expect(d.titulo).toBe("Ajuda Tridi");
    expect(d.sobrelinha).toBe("");
    expect(d.whatsapp).toBe("5511999999999");
    expect(d.atalhos.map((a) => a.rotulo)).toEqual(["Início", "Contato"]);
    expect(d.tutoriais).toHaveLength(3);
  });

  it("a porta das configurações não mexe em tutorial nem em categoria", () => {
    const d = aplicarOperacao(doc(), { op: "salvarConfig", campos: { titulo: "X", tutoriais: [], categorias: [] } as never });
    expect(d.tutoriais).toHaveLength(3);
    expect(d.categorias).toHaveLength(2);
  });

  it("não muda o documento recebido", () => {
    const original = doc();
    const copia = JSON.stringify(original);
    aplicarOperacao(original, { op: "excluirTutorial", id: "a" });
    aplicarOperacao(original, { op: "ordenarTutoriais", ids: ["c", "b", "a"] });
    aplicarOperacao(original, { op: "excluirCategoria", id: "c1" });
    expect(JSON.stringify(original)).toBe(copia);
  });
});

describe("corpo da operação vindo da rede", () => {
  it("aceita as operações conhecidas", () => {
    expect(lerOperacao({ op: "excluirTutorial", id: "a" })).toEqual({ op: "excluirTutorial", id: "a" });
    expect(lerOperacao({ op: "ordenarTutoriais", ids: ["a", 3, "b"] })).toEqual({ op: "ordenarTutoriais", ids: ["a", "b"] });
  });

  it("recusa operação desconhecida ou malformada", () => {
    expect(() => lerOperacao({ op: "apagarTudo" })).toThrow(ErroCentral);
    expect(() => lerOperacao({ op: "salvarTutorial", tutorial: "x" })).toThrow(ErroCentral);
    expect(() => lerOperacao(null)).toThrow(ErroCentral);
  });
});

describe("ordenarPorIds", () => {
  it("ignora id desconhecido e reatribui a ordem", () => {
    const r = ordenarPorIds([{ id: "a", ordem: 0 }, { id: "b", ordem: 1 }], ["zzz", "b", "a"]);
    expect(r).toEqual([{ id: "b", ordem: 0 }, { id: "a", ordem: 1 }]);
  });
});

describe("resumo do cartão", () => {
  const passo = (id: string, conteudo = "") => ({ id, tipo: "passo" as const, titulo: `Passo ${id}`, conteudo, imagemUrl: "", imagemAlt: "", videoUrl: "", videoCapaUrl: "" });

  it("conta os passos do CONTEÚDO — ninguém precisa digitar 'quantidade de etapas'", () => {
    const t = tut("a", "Guia", { blocos: [passo("1"), passo("2"), passo("3"), passo("4")] });
    expect(metaDoTutorial(t)).toMatchObject({ icone: "list-numbers", texto: expect.stringContaining("4 passos") });
  });

  it("o tempo digitado vale mais que a estimativa", () => {
    const t = tut("a", "Guia", { duracaoMinutos: 12, blocos: [passo("1"), passo("2")] });
    expect(metaDoTutorial(t).texto).toBe("2 passos · 12 min");
  });

  it("vídeo ganha o ícone de play", () => {
    const t = tut("a", "Guia", { blocos: [{ id: "v", tipo: "video", origem: "link", url: "https://youtu.be/aqz-KE-bpKQ", capaUrl: "", legenda: "" }] });
    expect(metaDoTutorial(t).icone).toBe("player-play");
  });

  it("tempo de leitura: nunca zero, e cresce com o texto", () => {
    const curto = tut("a", "Guia", { blocos: [{ id: "t", tipo: "texto", titulo: "", conteudo: "<p>Uma frase.</p>" }] });
    const longo = tut("b", "Guia", { blocos: [{ id: "t", tipo: "texto", titulo: "", conteudo: `<p>${"palavra ".repeat(900)}</p>` }] });
    expect(minutosDeLeitura(curto)).toBe(1);
    expect(minutosDeLeitura(longo)).toBeGreaterThanOrEqual(4);
  });

  it("o cartão da listagem não carrega o conteúdo do tutorial", () => {
    const t = tut("a", "Guia", { blocos: [passo("1", "<p>texto enorme</p>")] });
    const c = cartaoDoTutorial(t);
    expect(c).not.toHaveProperty("blocos");
    expect(c).toMatchObject({ id: "a", titulo: "Guia", handle: "a" });
  });
});

describe("modelo novo do tutorial", () => {
  it("aviso só aceita os três sentidos fixos; problema vazio sai", () => {
    const t = normalizarTutorial({ id: "a", titulo: "x", blocos: [
      { id: "1", tipo: "aviso", estilo: "perigo-inventado", conteudo: "<p>Cera quente</p>" },
      { id: "2", tipo: "problemas", itens: [{ sintoma: "Saiu borrado", solucao: "Menos tinta" }, { sintoma: "", solucao: "" }] },
    ] });
    expect(t.blocos[0]).toMatchObject({ tipo: "aviso", estilo: "dica" });
    expect(t.blocos[1]).toMatchObject({ tipo: "problemas", titulo: "Deu errado?" });
    expect((t.blocos[1] as { itens: unknown[] }).itens).toHaveLength(1);
  });

  it("'Você vai precisar' guarda nome e, se houver, o produto", () => {
    const t = normalizarTutorial({ id: "a", titulo: "x", dificuldade: "facil", materiais: [{ nome: "Almofada", produtoId: "p1" }, { nome: "" }] });
    expect(t.dificuldade).toBe("facil");
    expect(t.materiais).toEqual([{ id: expect.any(String), nome: "Almofada", produtoId: "p1" }]);
  });
});

describe("WhatsApp da central", () => {
  it("DDD + número ganha o 55; o link leva a mensagem pronta", () => {
    expect(numeroWhatsapp("(11) 98888-7777")).toBe("5511988887777");
    expect(numeroWhatsapp("+55 11 98888-7777")).toBe("5511988887777");
    expect(linkWhatsapp("11988887777", "Tutorial: Carimbo em papel")).toBe("https://wa.me/5511988887777?text=Tutorial%3A%20Carimbo%20em%20papel");
    expect(linkWhatsapp("")).toBe("");
  });
});

describe("texto do tutorial", () => {
  it("texto puro vira parágrafos — Enter deixa de sumir na página publicada", () => {
    expect(textoParaHtml("Primeira linha\nsegunda linha\n\nOutro parágrafo")).toBe("<p>Primeira linha<br>segunda linha</p><p>Outro parágrafo</p>");
  });

  it("escapa o que parece marcação sem ser", () => {
    expect(textoParaHtml("5 < 7 & 8 > 2")).toBe("<p>5 &lt; 7 &amp; 8 &gt; 2</p>");
  });

  it("HTML já formatado passa como está", () => {
    expect(textoParaHtml("<p>Oi <strong>você</strong></p>")).toBe("<p>Oi <strong>você</strong></p>");
  });
});

describe("link para outro tutorial", () => {
  it("guarda o endereço do tutorial e resolve contra a central de quem está vendo", () => {
    const [bloco] = normalizarTutorial({ id: "a", titulo: "x", blocos: [{ id: "l", tipo: "link", titulo: "Limpeza", tutorial: "Limpeza-do-Carimbo", url: "/p/antiga/limpeza-do-carimbo" }] }).blocos;
    expect(bloco).toMatchObject({ tipo: "link", tutorial: "limpeza-do-carimbo" });
    // Na prévia a raiz é outra — o link continua dentro do rascunho.
    expect(hrefDoLink(bloco as Extract<typeof bloco, { tipo: "link" }>, "/previa/tutoriais/b1")).toBe("/previa/tutoriais/b1/limpeza-do-carimbo");
  });

  it("endereço externo sem https ganha https; esquema perigoso some", () => {
    expect(hrefDoLink({ tutorial: "", url: "loja.com.br/x" }, "/p/c")).toBe("https://loja.com.br/x");
    expect(hrefDoLink({ tutorial: "", url: "javascript:alert(1)" }, "/p/c")).toBe("");
    expect(hrefDoLink({ tutorial: "", url: "//outro.site/x" }, "/p/c")).toBe("");
  });
});
