import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Resposta ao toque SEM afundar (set/2026).
 *
 * O usuário pediu pra tirar o "afunda e volta" (`scale(.97)` no `:active`).
 * Só que tirar a pressão e não pôr nada no lugar deixa botão morto no
 * pointer-down. A fundação responde por sombra interna — e NUNCA por
 * `transform`, `filter` ou `opacity`, que criam contexto de empilhamento e
 * já derrubaram popover (ver popover-em-faixa.test.ts).
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

function regras(css: string): { sel: string; corpo: string }[] {
  const semComentario = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: { sel: string; corpo: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(semComentario))) out.push({ sel: m[1].trim(), corpo: m[2] });
  return out;
}

describe("Toque responde sem afundar", () => {
  it("nenhum :active da plataforma aplica scale/translate", () => {
    const culpados: string[] = [];
    for (const arquivo of cssDaPlataforma()) {
      for (const r of regras(readFileSync(join(RAIZ, arquivo), "utf8"))) {
        if (!r.sel.includes(":active")) continue;
        // Exceções deliberadas: o tique do checkbox e a seta que empurra 2px
        // não são "afundar" — são a peça se mexendo, não o alvo inteiro.
        if (/\.ct-check-alvo:active \.ct-check|\.mt-seta:active|\.tf-scope button:active/.test(r.sel)) continue;
        if (/transform:\s*(scale|translate)/.test(r.corpo)) culpados.push(`${arquivo}: ${r.sel}`);
      }
    }
    expect(culpados, "afundar voltou — a resposta ao toque é por sombra interna, não por transform").toEqual([]);
  });

  it("a fundação responde ao pointer-down por sombra interna, sem transform/filter/opacity", () => {
    const base = regras(readFileSync(join(RAIZ, "app/globals.css"), "utf8"))
      .find((r) => r.sel.includes("button:not(:disabled):active") && /box-shadow:\s*inset/.test(r.corpo));
    expect(base, "falta a resposta ao toque de `button:not(:disabled):active` (box-shadow inset)").toBeTruthy();
    expect(base!.corpo).not.toMatch(/transform|filter|opacity/);
    expect(base!.corpo).toMatch(/transition-duration:\s*0s/);
  });
});
