import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Peça só entra no estoque depois que alguém confere.
 *
 * A regra do galpão: quem produz não dá entrada no próprio trabalho. A pessoa
 * termina e põe na caixa; o gerente vai até a caixa, olha, aprova, e é a
 * aprovação dele que vira peça no estoque, etiqueta impressa e nota no score.
 *
 * Isto já foi quebrado uma vez, e de um jeito que ninguém veria olhando a tela:
 * o PATCH de /api/atividades somava no catálogo assim que o status virava
 * "concluida". Item SERIALIZADO era barrado pela guarda do banco e acabava na
 * fila de conferência por acidente; item não serializado entrava direto e nunca
 * aparecia para conferir. Metade do catálogo escapava do controle de qualidade,
 * e o score media a pessoa só pelo que ela fazia de item etiquetado.
 *
 * O sintoma disso, quando volta, é silencioso: o estoque fecha certo, ninguém
 * reclama, e a fila de "a conferir" só fica mais curta do que deveria. Por isso
 * a trava é um teste e não um parágrafo no CLAUDE.md — a linha que reintroduz o
 * problema tem duas palavras e entra num commit sobre outro assunto.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

const IGNORAR_DIR = new Set([
  "node_modules", ".next", ".git", ".claude", ".worktrees",
  "tridimarket-app", "estoque-app", "tv-app", "tv-central", "android",
  "supabase", "docs", "public",
]);

/**
 * Quem PODE escrever `estoque_lancado: true`.
 *
 * Um arquivo só: o que registra a conferência. Ele é o ponto onde existe um
 * conferente com nome, uma nota e uma contagem de aprovadas/recusadas — sem
 * isso, "entrou no estoque" não tem autor nem responsável.
 */
const DONO_DA_ENTRADA = "lib/estoque-conferencia.ts";

/**
 * Arquivos de mentira (fixtures de tela) podem citar o campo à vontade: eles
 * montam um objeto de exemplo, não escrevem no banco.
 */
const FIXTURES = new Set([
  "app/dev-mobile/telas.ts",
  "app/dev-produtividade/ProvaProdutividade.tsx",
]);

/**
 * Tira comentários antes de varrer.
 *
 * Sem isto o teste se mordia: a lápide que deixei em lib/estoque.ts explicando
 * POR QUE `lancarProducaoCatalogo` saiu era acusada de tê-la trazido de volta.
 * E a lápide é justamente o que faz alguém pensar duas vezes antes de reescrever
 * a função — apagar o aviso para o teste passar seria o pior dos dois mundos.
 */
function semComentarios(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, "")   // bloco, inclusive JSDoc
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");  // linha — o [^:] poupa "https://"
}

function varrer(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR_DIR.has(nome)) continue;
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) varrer(full, out);
    else if (/\.tsx?$/.test(nome) && !full.includes("__tests__")) out.push(full);
  }
  return out;
}

const ARQUIVOS = varrer(RAIZ)
  .map((f) => ({ caminho: relative(RAIZ, f), texto: semComentarios(readFileSync(f, "utf8")) }))
  .filter((f) => !FIXTURES.has(f.caminho));

describe("estoque entra só por conferência", () => {
  it("só a conferência marca estoque_lancado = true", () => {
    // As DUAS formas de marcar. O código que isto substituiu usava a segunda
    // (`patch.estoque_lancado = true`), e uma regex só com `:` teria deixado
    // passar exatamente o caso que motivou o teste.
    const marca = /estoque_lancado["']?\s*[:=]\s*true/;

    const culpados = ARQUIVOS
      .filter((f) => f.caminho !== DONO_DA_ENTRADA && marca.test(f.texto))
      .map((f) => f.caminho);

    expect(culpados, [
      "Estes arquivos dão entrada no estoque por fora da conferência:",
      ...culpados.map((c) => `  - ${c}`),
      "",
      "Peça só entra depois de alguém conferir — é isso que garante que a",
      "entrada tenha um responsável, uma nota e etiqueta impressa. Se o que",
      `você precisa é um ajuste manual, ele é explícito e com autor gravado,`,
      "não um efeito colateral de mudar o status de uma atividade.",
    ].join("\n")).toEqual([]);
  });

  it("a porta velha (lancarProducaoCatalogo) não voltou", () => {
    // Somava no catálogo pelo NOME do produto, sem conferente e sem etiqueta.
    // Foi removida junto com os dois chamadores (PATCH de /api/atividades e o
    // "concluir" do tablet de Atividades).
    const ressuscitados = ARQUIVOS
      .filter((f) => f.texto.includes("lancarProducaoCatalogo("))
      .map((f) => f.caminho);

    expect(ressuscitados, [
      "lancarProducaoCatalogo voltou em:",
      ...ressuscitados.map((c) => `  - ${c}`),
      "",
      "Ela somava estoque direto pelo nome do produto, sem conferente, sem",
      "nota e sem etiqueta — e ainda lia a coluna `tipo`, que não existe mais.",
      "Quem dá entrada é registrarConferencia (lib/estoque-conferencia.ts).",
    ].join("\n")).toEqual([]);
  });

  it("concluir uma atividade não toca no catálogo", () => {
    // As duas rotas que fecham atividade. O teste acima pega a escrita da
    // flag; esta pega a escrita da QUANTIDADE, que é o efeito de verdade —
    // alguém poderia somar no catálogo sem mexer em `estoque_lancado` e passar
    // batido pelos dois primeiros.
    const ROTAS_DE_CONCLUSAO = ["app/api/atividades/route.ts", "app/api/device/push/route.ts"];

    for (const caminho of ROTAS_DE_CONCLUSAO) {
      const arq = ARQUIVOS.find((f) => f.caminho === caminho);
      expect(arq, `${caminho} sumiu — se foi renomeada, atualize esta lista`).toBeTruthy();

      const escreveNoCatalogo = /from\(["']estoque_itens["']\)[\s\S]{0,200}?\.(update|upsert|insert)\(/;
      expect(
        escreveNoCatalogo.test(arq!.texto),
        `${caminho} escreve em estoque_itens. Concluir uma atividade significa ` +
        `"terminei, está na minha caixa" — não "entrou no estoque". Quem dá ` +
        `entrada é a conferência.`,
      ).toBe(false);
    }
  });
});
