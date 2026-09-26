// ── O `"use client"` não pode arrastar o servidor pro navegador ──────────────
//
// POR QUE ESTE TESTE EXISTE
//
// `/atividades/historico` nasceu quebrada e subiu assim. O componente de tela
// (`"use client"`) pedia uma constante de `lib/atividades-tempo-consulta`, que
// importa `createSupabaseAdminClient`, que importa `next/headers`. Isso põe o
// cliente do Supabase dentro do pacote do NAVEGADOR, e o build morre com:
//
//   You're importing a module that depends on "next/headers".
//
// Uma linha de import. E as duas travas do projeto passaram verdes:
//
//   · `npx tsc --noEmit` passa — os TIPOS estão todos certos, a regra é do
//     empacotador;
//   · `npm test` passa — Vitest carrega módulo por módulo e nunca monta o
//     grafo do cliente.
//
// Ou seja: a tela inteira estava fora do ar e nada avisava até alguém rodar
// `next build` ou abrir a página. É exatamente o formato de falha que este
// repositório já conhece de outro assunto (o orçamento de execução): entra como
// uma linha só, num arquivo sobre outra coisa, e só aparece longe dali.
//
// A REGRA: de um arquivo `"use client"`, seguindo só imports de VALOR, não pode
// haver caminho até `next/headers`, `next/server`, `server-only` ou
// `lib/supabase/server`. `import type` é apagado pelo compilador e por isso não
// conta — um tipo pode vir de qualquer lugar.
//
// Se este teste quebrou, a pergunta certa não é "como faço exceção": é "que
// parte disto é PURA?". A correção é mover a constante/o tipo pro módulo sem
// banco (foi o que `lib/atividades-tempo.ts` recebeu) e deixar o módulo de
// consulta só com a consulta.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const RAIZ = resolve(__dirname, "..", "..");

/** Só existem no servidor. Chegar em qualquer um destes pelo cliente é o bug. */
const PROIBIDOS = ["next/headers", "next/server", "server-only", "lib/supabase/server"];

const IGNORAR_PASTAS = new Set(["node_modules", ".next", ".git", "android", "estoque-app", "tv-app", "tv-central", "tridimarket-app", "supabase"]);

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR_PASTAS.has(nome)) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, saida);
    else if (/\.(ts|tsx)$/.test(nome) && !/\.d\.ts$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

/**
 * Os alvos de import de VALOR de um arquivo.
 *
 * Fica de fora, de propósito:
 *  · `import type { X } from "m"` — apagado pelo compilador, não existe em
 *    tempo de execução;
 *  · `import { type A, type B } from "m"` — idem, quando TODO especificador é
 *    de tipo. Basta um especificador de valor pra o módulo inteiro entrar.
 */
function importsDeValor(fonte: string): string[] {
  const alvos: string[] = [];
  const semComentarios = fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  // `[^;]*?` é o que segura o casamento DENTRO de uma declaração só. Sem isso,
  // um `export const X = {...};` no meio da lista de imports (acontece em
  // `trafego/FontesView.tsx`) faz o casamento preguiçoso atravessar o `;` e
  // colar o `export const` no `from` do `import type` seguinte — o tipo passa a
  // contar como valor e o teste acusa um arquivo que está certo.
  const re = /(?:^|\n)[ \t]*(?:import|export)(?![\w$])([^;]*?)\sfrom\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(semComentarios))) {
    const clausula = m[1].trim();
    const alvo = m[2];
    // `import type ...` / `export type ...`: some no build.
    if (/^type\b/.test(clausula)) continue;
    // `{ type A, type B }` inteiro de tipos: idem. Com `X, { type A }` (padrão
    // ou namespace junto) o módulo entra, então só o caso de chaves puras sai.
    const soChaves = clausula.match(/^\{([\s\S]*)\}$/);
    if (soChaves) {
      const partes = soChaves[1].split(",").map((p) => p.trim()).filter(Boolean);
      if (partes.length && partes.every((p) => /^type\s/.test(p))) continue;
    }
    alvos.push(alvo);
  }

  // `import "modulo"` (efeito colateral) também carrega o módulo.
  const efeito = /(?:^|\n)[ \t]*import\s*["']([^"']+)["']/g;
  while ((m = efeito.exec(semComentarios))) alvos.push(m[1]);

  return alvos;
}

/** Resolve `@/x` e `./x` num caminho de arquivo. `null` = pacote do npm. */
function resolver(deQuem: string, alvo: string): string | null {
  let base: string;
  if (alvo.startsWith("@/")) base = join(RAIZ, alvo.slice(2));
  else if (alvo.startsWith(".")) base = resolve(dirname(deQuem), alvo);
  else return null;

  for (const sufixo of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const tentativa = base + sufixo;
    if (existsSync(tentativa) && statSync(tentativa).isFile()) return tentativa;
  }
  return null;
}

const ehProibido = (alvo: string) =>
  PROIBIDOS.some((p) => alvo === p || alvo === `@/${p}` || alvo.endsWith(`/${p}`));

/** O caminho do cliente até o servidor, ou `null` quando não existe. */
function caminhoAteOServidor(entrada: string): string[] | null {
  const vistos = new Set<string>([entrada]);
  const fila: { arquivo: string; trilha: string[] }[] = [
    { arquivo: entrada, trilha: [relative(RAIZ, entrada)] },
  ];

  while (fila.length) {
    const { arquivo, trilha } = fila.shift()!;
    let fonte: string;
    try { fonte = readFileSync(arquivo, "utf8"); } catch { continue; }

    for (const alvo of importsDeValor(fonte)) {
      if (ehProibido(alvo)) return [...trilha, alvo];
      const proximo = resolver(arquivo, alvo);
      if (!proximo || vistos.has(proximo)) continue;
      vistos.add(proximo);
      fila.push({ arquivo: proximo, trilha: [...trilha, relative(RAIZ, proximo)] });
    }
  }
  return null;
}

describe("componente de cliente não arrasta o servidor pro navegador", () => {
  const clientes = arquivos(join(RAIZ, "app"))
    .filter((a) => /^\s*(["']use client["'])/m.test(readFileSync(a, "utf8").slice(0, 4000)));

  it("existem componentes de cliente pra vigiar (senão o teste não prova nada)", () => {
    expect(clientes.length).toBeGreaterThan(20);
  });

  it("nenhum chega em next/headers, next/server, server-only ou lib/supabase/server", () => {
    const quebrados = clientes
      .map((a) => ({ arquivo: relative(RAIZ, a), caminho: caminhoAteOServidor(a) }))
      .filter((r) => r.caminho !== null);

    const relato = quebrados
      .map((q) => `\n  ${q.arquivo}\n    ${q.caminho!.join("\n    → ")}`)
      .join("");

    expect(
      quebrados,
      "Componente de cliente com caminho de VALOR até um módulo de servidor. " +
      "O build do Next quebra ('You're importing a module that depends on next/headers') " +
      "mesmo com tsc e vitest verdes. Mova a constante/o tipo pro módulo puro." + relato,
    ).toEqual([]);
  });
});
