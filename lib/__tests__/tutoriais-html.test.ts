import { describe, expect, it } from "vitest";
import { limparConteudoDoTutorial, limparHtmlTutorial } from "@/lib/tridiflow-tutoriais-html";
import { htmlDoConteudo, normalizarCentralTutoriais, normalizarTutorial } from "@/lib/tridiflow-tutoriais";
import { aplicarOperacao } from "@/lib/tridiflow-tutoriais-operacoes";

// O texto do tutorial é HTML de VOCABULÁRIO FECHADO: parágrafo, quebra,
// negrito, itálico, listas e link. É o que o editor produz e o que a página
// sabe desenhar — e é o que sobra de qualquer coisa colada do Word, do Google
// Docs ou de um site (estilo, fonte, classe, título, tabela).
describe("lista de permissão do texto do tutorial", () => {
  it("negrito e itálico do navegador viram strong e em", () => {
    expect(limparHtmlTutorial("<p>Oi <b>você</b> e <i>ela</i></p>")).toBe("<p>Oi <strong>você</strong> e <em>ela</em></p>");
  });

  it("bloco que não é parágrafo vira parágrafo — sem parágrafo dentro de parágrafo", () => {
    expect(limparHtmlTutorial("<div>Linha</div><h2>Título</h2>")).toBe("<p>Linha</p><p>Título</p>");
    expect(limparHtmlTutorial("<div><p>dentro</p></div>")).toBe("<p>dentro</p>");
  });

  it("estilo, classe e span colados somem; o texto fica", () => {
    expect(limparHtmlTutorial('<p style="color:red" class="x">Texto <span style="font-weight:bold">vermelho</span></p>')).toBe("<p>Texto vermelho</p>");
  });

  it("link guarda só o destino, e destino perigoso deixa só o texto", () => {
    // Texto solto no nível de cima entra num parágrafo — como o editor faria.
    expect(limparHtmlTutorial('<a href="https://loja.com" target="_blank" rel="x" onclick="y()">loja</a>')).toBe('<p><a href="https://loja.com">loja</a></p>');
    expect(limparHtmlTutorial('<a href="javascript:alert(1)">clique</a>')).toBe("<p>clique</p>");
    expect(limparHtmlTutorial('<a href="https://x.com/?a=1&amp;b=2">x</a>')).toBe('<p><a href="https://x.com/?a=1&amp;b=2">x</a></p>');
  });

  it("script, imagem e afins saem inteiros", () => {
    expect(limparHtmlTutorial("<script>alert(1)</script><p>ok</p>")).toBe("<p>ok</p>");
    expect(limparHtmlTutorial('<img src=x onerror=alert(1)><p>ok</p>')).toBe("<p>ok</p>");
  });

  // Aninhar `<` fazia um `<img onerror>` sobreviver: a tag `<x>` de dentro saía,
  // o `<` que vinha antes colava no que vinha depois e formava a tag de novo na
  // passada seguinte. Salvar e desenhar não podem devolver uma tag VIVA pra
  // nenhum k — o `<` do texto perigoso fica escapado (`&lt;img`), texto inerte.
  it("tag recusada não recompõe outra ao aninhar `<` (XSS armazenado)", () => {
    for (let k = 1; k <= 6; k++) {
      const bruto = "<" + "<".repeat(k) + "x>".repeat(k) + "img src=x onerror=alert(1)>";
      const salvo = limparHtmlTutorial(bruto);
      const desenhado = htmlDoConteudo(salvo);
      for (const saida of [salvo, desenhado]) {
        expect(saida).not.toMatch(/<img\b/i);
        expect(saida).not.toMatch(/<[a-z][^>]*\son\w+=/i);
      }
    }
  });

  it("lista do editor (item com parágrafo dentro) passa como está", () => {
    expect(limparHtmlTutorial("<ul><li><p>um</p></li><li>dois</li></ul>")).toBe("<ul><li><p>um</p></li><li>dois</li></ul>");
  });

  it("parágrafo vazio sai; conteúdo só de vazios vira nada", () => {
    expect(limparHtmlTutorial("<p></p><p><br></p><p>&nbsp;</p>")).toBe("");
    expect(limparHtmlTutorial("<p>a</p><p></p><p>b</p>")).toBe("<p>a</p><p>b</p>");
  });

  it("texto puro vira parágrafo; <br/> é normalizado", () => {
    expect(limparHtmlTutorial("Texto puro\ncom quebra")).toBe("<p>Texto puro<br>com quebra</p>");
    expect(limparHtmlTutorial("<p>a<br/>b</p>")).toBe("<p>a<br>b</p>");
  });
});

describe("salvar limpa o texto de todos os blocos", () => {
  it("texto, passo, aviso e 'deu errado?' passam pela lista de permissão", () => {
    const t = limparConteudoDoTutorial(normalizarTutorial({
      id: "a", titulo: "Guia", blocos: [
        { id: "1", tipo: "texto", conteudo: "<b>forte</b>" },
        { id: "2", tipo: "passo", titulo: "P", conteudo: '<p style="x">passo</p>' },
        { id: "3", tipo: "aviso", estilo: "atencao", conteudo: "<h3>Quente</h3>" },
        { id: "4", tipo: "problemas", itens: [{ sintoma: "Borrou", solucao: "<script>x</script>Menos tinta" }] },
      ],
    }));
    expect(t.blocos.map((b) => ("conteudo" in b ? b.conteudo : "itens" in b ? b.itens[0].solucao : ""))).toEqual([
      "<p><strong>forte</strong></p>", "<p>passo</p>", "<p>Quente</p>", "<p>Menos tinta</p>",
    ]);
  });

  it("a operação de salvar tutorial grava o texto já limpo", () => {
    const d = aplicarOperacao(normalizarCentralTutoriais({}), { op: "salvarTutorial", tutorial: normalizarTutorial({
      id: "a", titulo: "Guia", blocos: [{ id: "1", tipo: "texto", conteudo: '<p onclick="x()">oi<script>y()</script></p>' }],
    }) });
    expect(d.tutoriais[0].blocos[0]).toMatchObject({ conteudo: "<p>oi</p>" });
  });
});
