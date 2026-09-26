/**
 * Coluna `grid` dentro de `.duo` não pode esticar as próprias linhas.
 *
 * A ARMADILHA, medida no navegador em 16/09/2026 e vista pelo dono antes disso:
 *
 *   `.duo` é `display: grid` sem `align-items`, então cada coluna ESTICA até a
 *   altura da mais alta. Se essa coluna for ela própria um `grid` de linhas
 *   automáticas, o `align-content: normal` (que vale como `stretch`) reparte a
 *   sobra ENTRE AS LINHAS — não a deixa no fim.
 *
 * No painel de Ponto isso apareceu como um defeito difícil de ler: filtrando
 * por "Presentes" a lista encolhia para uma pessoa, sobravam ~550px, e a
 * fileira de filtros ia de 22px para 207px. Os botões cresciam junto, e a
 * pílula do `Abas` — que se mede por `offsetHeight` do botão ativo — virava um
 * bloco roxo de quase 400px no meio da tela. Ninguém olha para "a coluna
 * esticou"; olha para "o filtro bugou".
 *
 * Por que um teste de FONTE e não de DOM: jsdom não tem layout. `offsetHeight`
 * é sempre 0 lá, então um teste de componente passaria com a tela quebrada —
 * seria verde justamente na regressão que deveria pegar. O navegador mede, mas
 * o painel exige sessão. O que dá para garantir sem mentir é a MECÂNICA: quem
 * escreve `display: "grid"` num filho de `.duo` declara o que fazer com a
 * sobra.
 *
 * `alignItems: "start"` no PRÓPRIO `.duo` também resolve (aí a coluna nem
 * estica) — é o que `ProdutividadeMetas` faz, e o teste aceita os dois.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const DIR = join(RAIZ, "app");

function tsx(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) tsx(full, out);
    else if (nome.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** A tag que começa em `i`, inteira. */
function tagEm(src: string, i: number): string {
  const fim = src.indexOf(">", i);
  return fim === -1 ? src.slice(i, i + 500) : src.slice(i, fim + 1);
}

/**
 * O primeiro ELEMENTO aberto depois da tag que começa em `i`.
 *
 * Pula comentário JSX (`{/* … *\/}`) porque ele não tem `<` dentro, e a janela
 * é larga de propósito: os comentários deste repositório explicam a decisão e
 * passam fácil de mil caracteres — foi o que fez a primeira versão deste
 * scanner não achar o filho e deixar o defeito passar.
 */
function primeiroFilho(src: string, i: number): string | null {
  const fim = src.indexOf(">", i);
  if (fim === -1) return null;
  const resto = src.slice(fim + 1, fim + 4000);
  const m = /<[A-Za-z]/.exec(resto);
  return m ? tagEm(resto, m.index) : null;
}

/**
 * Onde a classe `duo` aparece — em QUALQUER forma de `className`.
 *
 * Casa o literal de string, e não `className="…"`: no painel de Ponto a classe
 * é condicional (`className={comPainel ? "duo duo-lista" : undefined}`), e a
 * primeira versão deste teste, que exigia `className="`, passou verde com o
 * defeito na tela. Um teste que não pega o caso que o motivou é pior que teste
 * nenhum, porque dá confiança.
 */
const LITERAL_DUO = /"(?:[^"\n]*\s)?duo(?:-lista|-eq)?(?:\s[^"\n]*)?"/g;

describe("`.duo`: a coluna não reparte a sobra entre as linhas", () => {
  const suspeitos: string[] = [];

  for (const f of tsx(DIR)) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(LITERAL_DUO)) {
      // O `<div` que carrega a classe começa antes do literal.
      const abre = src.lastIndexOf("<", m.index!);
      if (abre === -1) continue;
      const tag = tagEm(src, abre);
      // Quem trava o stretch no PRÓPRIO `.duo` já está resolvido.
      if (/alignItems:\s*["']start["']/.test(tag)) continue;

      const filho = primeiroFilho(src, abre);
      if (!filho) continue;
      if (!/display:\s*["']grid["']/.test(filho)) continue;      // filho não é grid
      if (/alignContent:/.test(filho)) continue;                  // já declara

      suspeitos.push(`${relative(RAIZ, f)} → ${filho.slice(0, 90).replace(/\s+/g, " ")}`);
    }
  }

  it("todo filho `grid` de um `.duo` diz o que fazer com a sobra de altura", () => {
    expect(
      suspeitos,
      'coluna `grid` dentro de `.duo` sem `alignContent`: quando o irmão for mais alto, ' +
      'a sobra é repartida ENTRE AS LINHAS e os blocos incham (a fileira de abas do Ponto ' +
      'foi de 22px para 207px assim). Ponha `alignContent: "start"` na coluna — ou ' +
      '`alignItems: "start"` no próprio `.duo`, que impede o stretch na origem.',
    ).toEqual([]);
  });
});
