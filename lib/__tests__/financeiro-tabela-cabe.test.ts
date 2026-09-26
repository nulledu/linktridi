import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * AS COLUNAS TÊM DE CABER NO CARTÃO.
 *
 * A `<Tabela>` rola dentro do próprio bloco quando não cabe — é o certo, e é o
 * que a fundação manda fazer. Só que ninguém percebe uma barra de rolagem
 * horizontal dentro de um cartão: o que a pessoa vê é a última coluna cortada
 * na borda, e a leitura disso é "a tela perdeu a coluna Status", não "role de
 * lado". Aconteceu nas seis telas de lista do Financeiro ao mesmo tempo.
 *
 * O orçamento abaixo foi MEDIDO no navegador, não estimado: num monitor de
 * 1440 o cartão da esquerda de um `.duo-lista` dá 717px úteis (745 de cartão
 * menos 28 de recuo). Este teste soma o que cada tabela DECLARA — os `Npx` de
 * dentro de `minmax(min(100%, Npx), …)`, as trilhas fixas e os vãos entre
 * colunas — e falha antes de a coluna sumir na tela de alguém.
 *
 * Se uma tabela precisar de mais, a saída não é aumentar o orçamento: é tirar
 * uma coluna do computador (`soNoComputador` faz o contrário) ou encurtar as
 * larguras. Sete colunas é o limite prático desta largura.
 */

const RAIZ = resolve(__dirname, "..", "..");
const FIN = join(RAIZ, "app", "(plataforma)", "financeiro");

/** Medido no navegador em 17/08/2026, viewport 1440. Ver o cabeçalho. */
const ORCAMENTO = 717;
/** `VAO_COLUNA` do kit (ui.tsx). Duplicado aqui de propósito: se alguém mudar
 *  um dos dois sem o outro, é este teste que conta a diferença. */
const VAO = 10;

function arquivos(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, out);
    else if (nome.endsWith(".tsx")) out.push(caminho);
  }
  return out;
}

/** Cada bloco `colunas={[ … ]}` de um arquivo, com as larguras declaradas. */
function tabelasDe(fonte: string): { larguras: string[] }[] {
  const out: { larguras: string[] }[] = [];
  for (const m of fonte.matchAll(/colunas=\{\[([\s\S]*?)\n\s*\]\}/g)) {
    const larguras = [...m[1].matchAll(/largura:\s*"([^"]+)"/g)].map((x) => x[1]);
    if (larguras.length) out.push({ larguras });
  }
  return out;
}

const minimoDe = (trilha: string): number => {
  const dentro = trilha.match(/min\(\s*100%\s*,\s*(\d+)px\s*\)/);
  const fixa = trilha.match(/^\s*(\d+)px\s*$/);
  return Number(dentro?.[1] ?? fixa?.[1] ?? 120);
};

describe("as tabelas do Financeiro cabem no cartão", () => {
  it("nenhuma pede mais que o cartão tem", () => {
    const estouros: string[] = [];
    for (const arquivo of arquivos(FIN)) {
      const fonte = readFileSync(arquivo, "utf8");
      for (const t of tabelasDe(fonte)) {
        const soma = t.larguras.reduce((s, l) => s + minimoDe(l), 0) + VAO * (t.larguras.length - 1);
        if (soma > ORCAMENTO) {
          estouros.push(
            `${arquivo.slice(RAIZ.length + 1)} — ${t.larguras.length} colunas pedem ${soma}px (cabem ${ORCAMENTO})`,
          );
        }
      }
    }
    expect(estouros, estouros.join("\n")).toEqual([]);
  });

  it("a conta bate com a que o kit faz em tempo de execução", () => {
    // O kit soma o mesmo: `minimoDaTabela` em ui.tsx. Se as duas divergirem, o
    // teste passa e a tela corta assim mesmo.
    const ui = readFileSync(join(FIN, "ui.tsx"), "utf8");
    expect(ui).toContain("const VAO_COLUNA = 10");
    expect(ui).toContain("VAO_COLUNA * Math.max(0, colunas.length - 1)");
  });
});
