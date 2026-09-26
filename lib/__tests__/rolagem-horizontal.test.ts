import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Trava de rolagem horizontal.
 *
 * O CLAUDE.md manda, desde sempre, que nada estoure a largura a 320px — e mesmo
 * assim a rolagem lateral voltou: o editor de páginas do TridiFlow nasceu com
 * `gridTemplateColumns: "254px minmax(0,1fr) 306px"` escrito INLINE. Somadas, as
 * três faixas davam 560px. Num celular de 320 sobravam 105px que a fundação
 * corta (`overflow-x: clip`), então nem rolagem havia: metade do inspetor
 * simplesmente não existia pra quem abriu no celular, sem nenhum aviso.
 *
 * Por que inline é o problema, e não o número: faixa rígida numa CLASSE se
 * colapsa com uma media query de uma linha. Inline não — o atributo `style`
 * ganha de qualquer folha, e só um `!important` reverte. A regra abaixo não
 * proíbe layout de três colunas; proíbe escrevê-lo onde o celular não alcança.
 *
 * As outras regras são as causas mecânicas que já apareceram no projeto: piso de
 * largura sem um bloco que role em volta, tabela solta na página e
 * `minmax(Npx, …)` com o mínimo fixo alto.
 *
 * O que ESTA trava não faz: somar padding, fonte e o tamanho do dado real. Isso
 * quem mede é navegador — `node scripts/rolagem-horizontal.mjs`, que abre o
 * banco de provas em 320/390/430/768/1024 e mede
 * `scrollWidth - clientWidth`. As duas se complementam: aqui trava o que dá pra
 * ler no código, lá mede o que só aparece montado.
 *
 * Cada exceção tem MOTIVO escrito. Se você veio parar aqui porque o teste
 * quebrou, a pergunta certa não é "como adiciono à lista".
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

/** A tela mais estreita que o projeto atende (CLAUDE.md). */
const CELULAR = 320;

/**
 * A partir de onde um `minmax(Npx, …)` sozinho vira problema. Coluna de 36px
 * numa tabela que já rola dentro do bloco é legítima — exigir `min(100%, 36px)`
 * ali seria ruído. O que estoura é a faixa que come a maior parte da tela: os
 * casos reais do projeto foram 280, 300 e 420.
 */
const FAIXA_LARGA = 200;

const IGNORAR_DIR = new Set([
  "node_modules", ".next", ".git", ".claude", ".worktrees",
  "tridimarket-app", "estoque-app", "ponto-app", "tv-app", "tv-central",
  "android", "supabase", "docs", "public", "worker", "posto", "scripts",
]);

function varrer(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR_DIR.has(nome)) continue;
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) varrer(full, out);
    else if (/\.(tsx?|css)$/.test(nome) && !full.includes("__tests__")) out.push(full);
  }
  return out;
}

// Comentário fora: metade das menções a `minmax(300px, …)` no repositório está
// justamente em comentário explicando por que NÃO se escreve assim. Sem tirar
// isso, a trava reprovaria a própria documentação da regra.
// Apaga o conteúdo, preserva as quebras: o número da linha do erro precisa
// continuar apontando pro lugar certo.
const semComentario = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

const ARQUIVOS = varrer(join(RAIZ, "app")).map((f) => ({
  caminho: relative(RAIZ, f),
  texto: readFileSync(f, "utf8"),
  codigo: semComentario(readFileSync(f, "utf8")),
}));

// ── 1. Faixa de grade rígida escrita inline ──────────────────────────────────
// Soma só o que NÃO pode encolher: `minmax(...)`, `min(...)`, `clamp(...)`,
// `repeat(...)` e `var(...)` saem da conta porque cedem sozinhos. O que sobra é
// px cru, e px cru numa faixa é largura que ninguém negocia.
const FUNCAO_CSS = /\b(?:minmax|min|max|clamp|calc|fit-content|repeat|var)\([^()]*(?:\([^()]*\)[^()]*)*\)/g;
function somaRigida(valor: string): number {
  return [...valor.replace(FUNCAO_CSS, " ").matchAll(/(\d+(?:\.\d+)?)px/g)]
    .reduce((soma, m) => soma + Number(m[1]), 0);
}

const GRADE_INLINE_OK: Record<string, string> = {
  // (vazio de propósito — se precisar entrar aqui, quase sempre a saída certa é
  // mover as faixas pra uma classe e colapsá-las numa media query)
};

// ── 2. Piso de largura sem bloco que role ────────────────────────────────────
// `minWidth: 640` é legítimo — é assim que uma tabela mantém as colunas legíveis
// em vez de espremê-las. O que não pode é o piso existir SEM alguém em volta
// disposto a rolar: aí quem rola é a página inteira.
const ROLA_EM_VOLTA = /overflowX|overflow-x|TabelaOuCards|tab-strip|tab-linha/;

// ── 3. Tabela solta ──────────────────────────────────────────────────────────
// A fundação só faz `<table>` rolar dentro do bloco até 760px. Acima disso uma
// tabela larga empurra a página — e no ERP a coluna de conteúdo já nasce sem os
// 276px da barra lateral, então "cabe no meu monitor" não quer dizer nada.
const TABELA_JSX = /<table[\s\n][^>]*>/;
const TABELA_SOLTA_OK: Record<string, string> = {
  "app/(plataforma)/trafego/RelatoriosView.tsx":
    "monta uma STRING de HTML pra janela de impressão; não é DOM desta página",
  "app/dev-mobile/page.tsx":
    "tabela crua de propósito — é o corpo de prova da regra `table { overflow-x: auto }` da fundação",
};

describe("rolagem horizontal", () => {
  it("não escreve faixa de grade rígida inline (ela não colapsa no celular)", () => {
    const suspeitos: string[] = [];
    for (const { caminho, texto } of ARQUIVOS) {
      if (caminho in GRADE_INLINE_OK) continue;
      texto.split("\n").forEach((linha, i) => {
        for (const m of linha.matchAll(/gridTemplateColumns\s*:\s*[`"']([^`"'\n]+)[`"']/g)) {
          if (m[1].includes("${")) continue;            // template com variável: não dá pra somar
          const soma = somaRigida(m[1]);
          if (soma > CELULAR) suspeitos.push(`${caminho}:${i + 1} — ${soma}px rígidos em "${m[1]}"`);
        }
      });
    }
    expect(
      suspeitos,
      "Faixa de grade rígida no atributo `style`: o celular não tem como colapsar isso " +
      "(inline ganha da folha). Mova as faixas pra uma classe e colapse com " +
      "`@media (max-width: 900px) { .x { grid-template-columns: minmax(0, 1fr); } }`.",
    ).toEqual([]);
  });

  it("todo piso de largura maior que a tela tem um bloco que role em volta", () => {
    const suspeitos: string[] = [];
    for (const { caminho, texto } of ARQUIVOS) {
      if (ROLA_EM_VOLTA.test(texto)) continue;
      texto.split("\n").forEach((linha, i) => {
        for (const m of linha.matchAll(/\bminWidth\s*:\s*(\d+)\b/g)) {
          if (Number(m[1]) > CELULAR) suspeitos.push(`${caminho}:${i + 1} — ${m[0]}`);
        }
      });
    }
    expect(
      suspeitos,
      "Piso de largura acima de 320px num arquivo onde nada rola de lado. " +
      "Ponha a peça dentro de um `<div style={{ overflowX: 'auto' }}>` (ou use " +
      "`TabelaOuCards` de app/(plataforma)/ui/mobile.tsx), pra sobra rolar DENTRO " +
      "do bloco em vez de esticar a página.",
    ).toEqual([]);
  });

  it("nenhuma <table> fica solta na página", () => {
    const suspeitos = ARQUIVOS
      .filter(({ caminho, texto }) =>
        TABELA_JSX.test(texto) &&
        !ROLA_EM_VOLTA.test(texto) &&
        !(caminho in TABELA_SOLTA_OK))
      .map((a) => a.caminho);
    expect(
      suspeitos,
      "`<table>` sem invólucro que role. A fundação só resolve isso até 760px; " +
      "acima disso a tabela empurra a página. Use `TabelaOuCards` ou envolva num " +
      "`<div style={{ overflowX: 'auto' }}>`.",
    ).toEqual([]);
  });

  it("minmax de faixa usa min(100%, N) — o mínimo fixo é que estoura", () => {
    const suspeitos: string[] = [];
    for (const { caminho, codigo } of ARQUIVOS) {
      codigo.split("\n").forEach((linha, i) => {
        if (/^\s*\/\//.test(linha)) return;
        for (const m of linha.matchAll(/minmax\(\s*(\d+)px/g)) {
          if (Number(m[1]) >= FAIXA_LARGA) suspeitos.push(`${caminho}:${i + 1} — ${m[0]}...`);
        }
      });
    }
    expect(
      suspeitos,
      "`minmax(Npx, 1fr)` com N alto não cabe a 320px. Escreva " +
      "`minmax(min(100%, Npx), 1fr)`: idêntico no computador, colapsa sozinho no celular.",
    ).toEqual([]);
  });
});
