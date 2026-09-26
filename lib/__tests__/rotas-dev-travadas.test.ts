import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * As páginas /dev-* precisam das DUAS travas.
 *
 * Está escrito no CLAUDE.md desde que a primeira delas nasceu, e documentação
 * não segura isto: a rota nova entra numa sessão sobre outro assunto, com uma
 * das duas linhas, e não há sintoma nenhum — em desenvolvimento ela funciona
 * exatamente igual.
 *
 * O que cada uma faz, e por que uma sozinha não protege:
 *
 *  1. `DEV_ONLY_PREFIXES` no middleware só torna a rota PÚBLICA fora de
 *     produção. Em produção ela NÃO some — passa a exigir sessão. Sozinha,
 *     qualquer pessoa logada abre o banco de provas em produção.
 *  2. `notFound()` na página é o que a faz sumir. Sozinha ela protege, mas sem
 *     a primeira a rota exige login em desenvolvimento e o banco de provas
 *     perde a razão de existir.
 *
 * O caso que fecha a conta: as rotas /dev-* ficam FORA de `(plataforma)`, então
 * não têm gate de sessão próprio. No fail-open do middleware (env do Supabase
 * ausente) elas sairiam até para anônimos.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;

function rotasDev(): string[] {
  return readdirSync(join(RAIZ, "app"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("dev-"))
    .map((d) => d.name);
}

/** Todo `page.tsx` abaixo desta pasta — a rota pode ser pega-tudo. */
function paginasDe(dir: string): string[] {
  const achados: string[] = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, d.name);
    if (d.isDirectory()) achados.push(...paginasDe(caminho));
    else if (d.name === "page.tsx") achados.push(caminho);
  }
  return achados;
}

describe("rotas /dev-*", () => {
  const rotas = rotasDev();

  it("existem — se a lista vier vazia, o teste não está olhando o lugar certo", () => {
    expect(rotas.length).toBeGreaterThan(5);
  });

  it("toda uma delas está no DEV_ONLY_PREFIXES do middleware", () => {
    const mw = readFileSync(join(RAIZ, "middleware.ts"), "utf8");
    const linha = mw.split("\n").find((l) => l.includes("DEV_ONLY_PREFIXES")) ?? "";
    for (const r of rotas) {
      expect(linha, `/${r} não está no DEV_ONLY_PREFIXES — em desenvolvimento ela vai exigir login`)
        .toContain(`"/${r}"`);
    }
  });

  it("toda uma delas SOME em produção pelo notFound() da própria página", () => {
    for (const r of rotas) {
      // O `page.tsx` nem sempre está na raiz da pasta: /dev-lojas é uma rota
      // pega-tudo (`[[...rota]]/page.tsx`), e procurar só na raiz daria um
      // falso "não existe" numa rota que está corretamente travada.
      const pages = paginasDe(join(RAIZ, "app", r));
      expect(pages.length, `/${r} sem page.tsx em lugar nenhum`).toBeGreaterThan(0);
      const src = pages.map((f) => readFileSync(f, "utf8")).join("\n");
      // A forma exata importa menos que as duas partes estarem na mesma linha
      // de decisão: o teste de produção e o notFound.
      expect(src, `/${r} não some em produção — qualquer pessoa logada abre o banco de provas lá`)
        .toMatch(/NODE_ENV\s*===\s*["']production["'][\s\S]{0,40}notFound\(\)/);
    }
  });
});
