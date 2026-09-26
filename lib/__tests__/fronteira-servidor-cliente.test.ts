import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

/**
 * FUNÇÃO NÃO ATRAVESSA A FRONTEIRA SERVIDOR→CLIENTE.
 *
 * Um Server Component pode passar dados para um Client Component; não pode
 * passar função. O React serializa as props para montar o pacote RSC, chega
 * numa função e quebra com "Functions cannot be passed directly to Client
 * Components unless you explicitly expose it by marking it with 'use server'".
 *
 * ESTE TESTE EXISTE PORQUE O DEFEITO É INVISÍVEL DE TODOS OS OUTROS ÂNGULOS:
 *
 *  · o `tsc` não vê — é regra do empacotador, não de tipo;
 *  · o `next build` não vê — compila e publica sem reclamar;
 *  · teste que renderiza a árvore com `renderToStaticMarkup` não vê — não
 *    existe fronteira dentro de um render de React comum;
 *  · e o pior: em produção o HTML do servidor sai INTEIRO. A tela aparece, e só
 *    então a hidratação morre com o pacote RSC corrompido. Quem está na frente
 *    do computador vê "Não conseguimos abrir esta tela" numa página que o
 *    servidor renderizou sem um erro sequer.
 *
 * Foi assim que o Financeiro inteiro ficou inacessível em 17/08/2026: a Visão
 * Geral passava `celula` e `chaveDe` para a `<Tabela>`, que é Client Component.
 * A correção é sempre a mesma — a página lê e passa DADOS, e quem define função
 * é o lado cliente (ver `ProximosCompromissos.tsx` e `BlocosDaDireita.tsx`).
 */

const RAIZ = resolve(__dirname, "..", "..");
const APP = join(RAIZ, "app");

function arquivos(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, out);
    else if (nome.endsWith(".tsx") && !nome.includes(".test.")) out.push(caminho);
  }
  return out;
}

const ehCliente = (fonte: string) => /^\s*["']use client["']/.test(fonte);

/** Resolve um import relativo ou "@/..." para o arquivo no disco. */
function resolver(deQuem: string, especificador: string): string | null {
  let base: string;
  if (especificador.startsWith("@/")) base = join(RAIZ, especificador.slice(2));
  else if (especificador.startsWith(".")) base = resolve(dirname(deQuem), especificador);
  else return null;
  for (const sufixo of [".tsx", ".ts", "/index.tsx", "/index.ts", ""]) {
    try {
      const c = base + sufixo;
      if (statSync(c).isFile()) return c;
    } catch { /* segue */ }
  }
  return null;
}

/**
 * Devolve o texto da TAG DE ABERTURA de cada `<Componente ...>` do arquivo.
 * Anda caractere a caractere contando `{}` para não parar no `>` de uma arrow
 * function dentro de uma prop — que é exatamente onde os defeitos moram.
 */
function tagsDeAbertura(fonte: string, componente: string): string[] {
  const achados: string[] = [];
  const marca = new RegExp(`<${componente}(?=[\\s/>])`, "g");
  let m: RegExpExecArray | null;
  while ((m = marca.exec(fonte))) {
    let i = m.index + m[0].length;
    let chaves = 0, aspas: string | null = null;
    for (; i < fonte.length; i++) {
      const ch = fonte[i];
      if (aspas) { if (ch === aspas && fonte[i - 1] !== "\\") aspas = null; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { aspas = ch; continue; }
      if (ch === "{") chaves++;
      else if (ch === "}") chaves--;
      else if (ch === ">" && chaves === 0) break;
    }
    achados.push(fonte.slice(m.index, i + 1));
  }
  return achados;
}

/**
 * A função tem que SER o valor da prop, não estar dentro dela.
 *
 * `linhas={lista.map((x) => x.nome)}` é inofensivo: a arrow roda no servidor e
 * o que atravessa é o array pronto. O que quebra é a função como valor —
 * `chaveDe={(c) => c.id}` ou, dentro de um objeto, `celula: (c) => …`. Sem essa
 * distinção a varredura acusa metade do repositório e vira ruído que ninguém lê.
 */
const ARROW = String.raw`(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>`;
const PROP_E_FUNCAO = new RegExp(String.raw`\b[a-zA-Z_$][\w$]*=\{\s*(?:${ARROW}|(?:async\s+)?function\b)`);
const CAMPO_E_FUNCAO = new RegExp(String.raw`[a-zA-Z_$][\w$]*\s*:\s*(?:${ARROW}|(?:async\s+)?function\b)`);

const passaFuncao = (tag: string) => PROP_E_FUNCAO.test(tag) || CAMPO_E_FUNCAO.test(tag);

interface Achado { arquivo: string; componente: string; trecho: string }

function varrer(): Achado[] {
  const fontes = new Map<string, string>();
  const ler = (p: string) => {
    if (!fontes.has(p)) fontes.set(p, readFileSync(p, "utf8"));
    return fontes.get(p)!;
  };

  const achados: Achado[] = [];
  for (const arquivo of arquivos(APP)) {
    const fonte = ler(arquivo);
    if (ehCliente(fonte)) continue;             // cliente→cliente é permitido
    if (fonte.includes('"use server"')) continue; // Server Action pode atravessar

    // Componentes importados de módulos que SÃO client components.
    for (const m of fonte.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+"([^"]+)"/g)) {
      const alvo = resolver(arquivo, m[2]);
      if (!alvo || !alvo.endsWith(".tsx")) continue;
      if (!ehCliente(ler(alvo))) continue;

      for (const bruto of m[1].split(",")) {
        const nome = bruto.trim().split(/\s+as\s+/).pop()?.trim();
        if (!nome || !/^[A-Z]/.test(nome)) continue;   // só componentes
        for (const tag of tagsDeAbertura(fonte, nome)) {
          if (passaFuncao(tag)) {
            achados.push({ arquivo: arquivo.slice(RAIZ.length + 1), componente: nome, trecho: tag.slice(0, 120) });
          }
        }
      }
    }
  }
  return achados;
}

describe("fronteira servidor → cliente", () => {
  it("nenhum Server Component passa função para um Client Component", () => {
    const achados = varrer();
    const relato = achados.map((a) => `${a.arquivo} → <${a.componente}>\n    ${a.trecho.replace(/\s+/g, " ")}`);
    expect(relato, relato.join("\n")).toEqual([]);
  });

  it("a varredura enxerga o defeito quando ele existe", () => {
    // Sem este caso, um erro na varredura passaria como "está tudo limpo".
    const comDefeito = `<Tabela linhas={x} colunas={[{ chave: "a", celula: (c) => c.nome }]} />`;
    const tag = tagsDeAbertura(comDefeito, "Tabela");
    expect(tag).toHaveLength(1);              // não parou no `>` da arrow
    expect(passaFuncao(tag[0])).toBe(true);

    // Função como valor DIRETO da prop.
    expect(passaFuncao(`<T chaveDe={(c) => c.id} />`)).toBe(true);

    // E o que NÃO pode acusar: arrow que só roda no servidor e devolve dados.
    expect(passaFuncao(`<C empresas={lista.map((e) => ({ id: e.id }))} />`)).toBe(false);
    expect(passaFuncao(`<C itens={xs.filter((x) => x.ativo).sort((a, b) => a.n - b.n)} />`)).toBe(false);
    // E não confunde `>` de comparação com o fim da tag.
    expect(tagsDeAbertura(`<Kpi valor={a > b ? "x" : "y"} />`, "Kpi")[0]).toContain("/>");
  });
});
