import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { extensoesTexto, htmlDoEditor } from "../editor/extensoesTexto";

// O ESQUEMA do editor é o contrato de saída do texto do tutorial. Estes testes
// usam a mesma lista de extensões do componente (editor/extensoesTexto.ts):
// se alguém acrescentar título ou imagem ali, é aqui que quebra.
const abertos: Editor[] = [];
const editor = (content: string) => { const e = new Editor({ extensions: extensoesTexto(), content }); abertos.push(e); return e; };
afterEach(() => { while (abertos.length) abertos.pop()?.destroy(); });

describe("texto do tutorial no editor", () => {
  it("o que vem colado do Word ou de um site sai no vocabulário fechado", () => {
    const html = editor('<h2>Título</h2><p style="color:red"><span class="x">oi</span> <b>forte</b></p><img src="x.png"><table><tr><td>célula</td></tr></table>').getHTML();
    expect(html).toContain("<strong>forte</strong>");
    expect(html).toContain("Título");
    expect(html).toContain("célula");
    for (const proibido of ["<h2", "style=", "class=", "<img", "<table", "<span"]) expect(html).not.toContain(proibido);
  });

  it("lista sai como lista (com o parágrafo do item)", () => {
    expect(editor("<ul><li>um</li><li>dois</li></ul>").getHTML()).toBe("<ul><li><p>um</p></li><li><p>dois</p></li></ul>");
  });

  it("link guarda só o destino — sem target nem rel no documento", () => {
    const html = editor('<p><a href="https://loja.com.br" target="_blank" rel="noopener">loja</a></p>').getHTML();
    expect(html).toBe('<p><a href="https://loja.com.br">loja</a></p>');
  });

  it("link com javascript: não entra", () => {
    expect(editor('<p><a href="javascript:alert(1)">x</a></p>').getHTML()).toBe("<p>x</p>");
  });

  it("campo vazio grava vazio, não <p></p>", () => {
    expect(htmlDoEditor(editor(""))).toBe("");
    expect(htmlDoEditor(editor("<p>oi</p>"))).toBe("<p>oi</p>");
  });
});
