import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Foco pelo teclado sai de UMA regra (set/2026).
 *
 * O botão do kit ganhava borda dupla no Tab: `button:focus-visible` pintava um
 * anel INTERNO (box-shadow inset) e `.ui-btn:focus-visible` um EXTERNO
 * (outline). E o `:focus-visible` global forçava `border-radius: 8px` em tudo
 * que recebia foco — pílula virava retângulo, o "quadrado sobrando".
 */
const RAIZ = process.cwd();

function cssDaPlataforma(): string[] {
  const out: string[] = ["app/globals.css"];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) andar(p);
      else if (nome.endsWith(".css")) out.push(p.replace(`${RAIZ}/`, ""));
    }
  };
  andar(join(RAIZ, "app/(plataforma)"));
  return out;
}

function regrasDeFoco(css: string): { sel: string; corpo: string }[] {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: { sel: string; corpo: string }[] = [];
  for (const m of limpo.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (sel.includes(":focus-visible")) out.push({ sel, corpo: m[2] });
  }
  return out;
}

describe("foco único", () => {
  const arquivos = cssDaPlataforma().map((f) => ({ f, css: readFileSync(join(RAIZ, f), "utf8") }));

  it("foco não muda o raio do elemento", () => {
    const ruins = arquivos.flatMap(({ f, css }) =>
      regrasDeFoco(css).filter((r) => /border-radius/.test(r.corpo)).map((r) => `${f}: ${r.sel}`));
    expect(ruins).toEqual([]);
  });

  it("botão não ganha anel interno por cima do outline", () => {
    const ruins = arquivos.flatMap(({ f, css }) =>
      regrasDeFoco(css)
        .filter((r) => /(^|,|\s)button:focus-visible/.test(r.sel) && /box-shadow/.test(r.corpo))
        .map((r) => `${f}: ${r.sel}`));
    expect(ruins).toEqual([]);
  });

  it("anel de foco usa os tokens --foco-*, não cor escrita na mão", () => {
    const ruins = arquivos.flatMap(({ f, css }) =>
      regrasDeFoco(css)
        .filter((r) => /outline:\s*\d+px solid/.test(r.corpo))
        .map((r) => `${f}: ${r.sel}`));
    expect(ruins).toEqual([]);
  });
});
