import { describe, it, expect } from "vitest";
import { higienizar, semTags } from "@/lib/vitrine/higienizar";

// ── Trava do HTML do lojista ─────────────────────────────────────────────────
// Este é o único lugar da vitrine onde texto escrito no painel vira marcação
// numa página pública. A vitrine antiga se recusava a abrir essa porta de
// propósito; ela abre agora porque sem texto rico não há rodapé de tema
// nenhum — e o preço de abrir é este arquivo de teste.
//
// Os casos abaixo não são hipóteses: são as formas conhecidas de driblar
// filtro por prefixo.

describe("higienizar", () => {
  it("mantém o que o rodapé do tema precisa", () => {
    const html = "<p><strong>E-mail:</strong> sac@tridixp.com.br<br/></p><ul><li>Seg-Sex</li></ul>";
    const limpo = higienizar(html);
    expect(limpo).toContain("<strong>");
    expect(limpo).toContain("<br>");
    expect(limpo).toContain("<li>Seg-Sex</li>");
  });

  it("apaga script com o miolo junto", () => {
    expect(higienizar("<p>oi</p><script>alert(1)</script>")).toBe("<p>oi</p>");
    expect(higienizar("<style>body{display:none}</style>ok")).toBe("ok");
    expect(higienizar("<iframe src='https://x'></iframe>")).toBe("");
  });

  it("descarta atributo de evento e style", () => {
    const limpo = higienizar('<p onclick="roubar()" style="position:fixed">x</p>');
    expect(limpo).toBe("<p>x</p>");
    // `img` fora da lista: some inteira, com o `onerror` junto.
    expect(higienizar('<img src=x onerror="alert(1)">')).toBe("");
  });

  it("deixa passar link http, relativo e mailto", () => {
    expect(higienizar('<a href="https://tridixp.com.br">x</a>'))
      .toBe('<a href="https://tridixp.com.br" rel="noopener nofollow">x</a>');
    expect(higienizar('<a href="/l/loja">x</a>')).toContain('href="/l/loja"');
    expect(higienizar('<a href="mailto:sac@x.com">x</a>')).toContain("mailto:");
  });

  it("recusa href executável, inclusive disfarçado", () => {
    for (const mau of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\tscript:alert(1)",
      "java script:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox",
    ]) {
      const limpo = higienizar(`<a href="${mau}">clique</a>`);
      expect(limpo, mau).toBe("<a>clique</a>");
    }
  });

  it("escapa aspas dentro do valor que sobrevive", () => {
    const limpo = higienizar('<a href="/x" title=\'ok "sim"\'>t</a>');
    expect(limpo).toContain("&quot;");
    expect(limpo).not.toMatch(/title="ok "sim""/);
  });

  it("semTags devolve texto limpo pra alt e meta", () => {
    expect(semTags("<p>Olá <strong>mundo</strong></p>\n<p>de novo</p>")).toBe("Olá mundo de novo");
    expect(semTags("<script>alert(1)</script>puro")).toBe("puro");
  });
});
