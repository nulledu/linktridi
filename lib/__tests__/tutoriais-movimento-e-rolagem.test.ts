import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A área de tutoriais tem CSS PRÓPRIO: a página pública não carrega o
// globals.css da plataforma, então as regras de movimento não chegam nela por
// herança — e é fácil escrever um número cru aqui sem ninguém notar.
// Comentário fora: o texto que EXPLICA a regra ("7 × 40 passa dos 300ms",
// "nunca translateY(0)") casaria com a própria regra e o teste acusaria a si
// mesmo.
const semComentario = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const publico = semComentario(readFileSync("app/p/[slug]/central-tutoriais.css", "utf8"));
const leitura = semComentario(readFileSync("app/p/[slug]/[tutorial]/tutorial.css", "utf8"));
const rolagem = readFileSync("app/p/[slug]/rolagem.ts", "utf8");

const arquivos: [string, string][] = [
  ["central-tutoriais.css", publico],
  ["tutorial.css", leitura],
];

describe("movimento da área de tutoriais", () => {
  it("duração e curva saem da escala, não de números soltos", () => {
    for (const [nome, css] of arquivos) {
      // Duração literal só é aceita como FALLBACK de var() — nunca sozinha.
      const soltas = [...css.matchAll(/(?<!\(|,\s?)\b\d{2,4}ms\b/g)]
        .filter((m) => !css.slice(Math.max(0, m.index! - 60), m.index!).includes("var(--"));
      expect(soltas.map((m) => m[0]), nome).toEqual([]);
      const curvas = [...css.matchAll(/cubic-bezier\([^)]*\)/g)]
        .filter((m) => !css.slice(Math.max(0, m.index! - 40), m.index!).includes("var(--"));
      expect(curvas.map((m) => m[0]), nome).toEqual([]);
    }
  });

  it("nada termina em translateY(0) — transform residual vira bloco de contenção", () => {
    for (const [nome, css] of arquivos) {
      expect(css.includes("translateY(0)"), nome).toBe(false);
      if (css.includes("@keyframes tutCartaoEntra")) expect(css, nome).toContain("to{opacity:1;transform:none");
    }
  });

  it("toda animação tem a saída para quem pediu menos movimento", () => {
    for (const [nome, css] of arquivos) {
      const anima = /animation:|transition:/.test(css);
      expect(anima && css.includes("prefers-reduced-motion"), nome).toBe(true);
    }
  });

  // `behavior: "smooth"` cru ignora o prefers-reduced-motion do sistema.
  it("rolagem programática respeita quem pediu menos movimento", () => {
    expect(rolagem).toContain("prefers-reduced-motion: reduce");
    for (const [nome, arquivo] of [["CentralTutoriais.tsx", readFileSync("app/p/[slug]/CentralTutoriais.tsx", "utf8")],
                                   ["BarraAtalhos.tsx", readFileSync("app/p/[slug]/BarraAtalhos.tsx", "utf8")],
                                   ["ProgressoLeitura.tsx", readFileSync("app/p/[slug]/[tutorial]/ProgressoLeitura.tsx", "utf8")]] as const) {
      expect(arquivo.includes('behavior: "smooth"'), nome).toBe(false);
    }
  });

  // Stagger total sob ~300ms: 40ms × 7 já faz o último cartão parecer atrasado.
  it("a cascata dos cartões é capada", () => {
    expect(publico).toContain("var(--duration-stagger,40ms)");
    expect(readFileSync("app/p/[slug]/CentralTutoriais.tsx", "utf8")).toContain("Math.min(i, 6)");
  });
});
