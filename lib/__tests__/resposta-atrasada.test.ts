import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Trava contra RESPOSTA ATRASADA em busca disparada pelo período.
 *
 * Trocar o chip de período dispara uma busca nova com a anterior ainda no ar.
 * As rotas do ERP/Graph levam segundos na primeira vez e milissegundos com o
 * cache quente, então as respostas chegam FORA DE ORDEM — e quem escreve por
 * último vence: a tela fica com o dado do período ANTERIOR embaixo do chip
 * novo. Em tela sem poll o dado errado fica até alguém recarregar. Foi o
 * "troco pra Este mês e os números ficam estranhos" em meia dúzia de áreas
 * de uma vez (ago/2026).
 *
 * A cura tem dois formatos, os dois já no repositório:
 * - efeito inline → `let vivo = true` + cleanup (ver useProduction em
 *   producao/parts.tsx);
 * - `load` compartilhado (efeito + poll + botão) → carimbo de sequência:
 *   `useBuscaAtual()` de app/(plataforma)/ui/useBuscaAtual.ts, ou um
 *   `reqRef` local como no TrafegoPanel.
 *
 * Este teste varre app/(plataforma): todo `fetch` que monta a URL com
 * `periodQuery(` precisa de um desses guardas por perto. Se quebrou aqui,
 * não adicione exceção — adicione o guarda: é uma linha de carimbo e um
 * `if` antes do set.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const ALVO = join(RAIZ, "app", "(plataforma)");

function varrer(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "__tests__" || nome === "node_modules") continue;
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) varrer(full, out);
    else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) out.push(full);
  }
  return out;
}

// O guarda pode estar um pouco antes (carimbo no topo do load) ou um pouco
// depois (o `if` no then). ±25 linhas cobre todos os loads reais do app.
// `reqRef`/`Req.current` casam os carimbos locais já existentes (reqRef do
// TrafegoPanel e do TrafegoOverview, vendasReq do TrafegoClient).
const JANELA = 25;
const GUARDA = /let (vivo|active)\b|buscaAtual|souAtual|reqRef|Req\.current/;

// Fetch de DISPARO (resposta descartada, nenhum estado escrito) não é busca.
// Cada exceção casa pela MARCA na linha, não por número de linha — e precisa
// do motivo escrito, como nas outras travas.
const DISPAROS_OK: { arquivo: string; marca: string; motivo: string }[] = [
  {
    arquivo: "app/(plataforma)/trafego/TrafegoOverview.tsx",
    marca: "/api/trafego/sync",
    motivo: "dispara o sync e descarta a resposta; quem escreve estado é o buscar({fresh}) interno, que já tem guarda própria",
  },
];

describe("resposta atrasada não sobrescreve o período novo", () => {
  it("todo fetch com periodQuery tem guarda de busca mais nova", () => {
    const culpados: string[] = [];
    for (const full of varrer(ALVO)) {
      const caminho = relative(RAIZ, full);
      const linhas = readFileSync(full, "utf8").split("\n");
      linhas.forEach((linha, i) => {
        if (!linha.includes("periodQuery(")) return;
        if (/\bimport\b|export function periodQuery/.test(linha)) return;
        if (DISPAROS_OK.some((d) => caminho === d.arquivo && linha.includes(d.marca))) return;
        // Só interessa quando a query alimenta um fetch logo ali — montar a
        // string pra outra coisa (ex.: passar pro useProduction, que já é
        // guardado por dentro) não escreve estado por conta própria.
        // `buscar(` é o wrapper de fetch do Comercial (PedidosAuto).
        const logoDepois = linhas.slice(i, i + 7).join("\n");
        if (!/fetch\(|buscar\(`/.test(logoDepois)) return;
        const janela = linhas.slice(Math.max(0, i - JANELA), i + JANELA).join("\n");
        if (!GUARDA.test(janela)) culpados.push(`${caminho}:${i + 1}`);
      });
    }
    expect(
      culpados,
      `Busca por período sem guarda de resposta atrasada. Use useBuscaAtual() ` +
      `(app/(plataforma)/ui/useBuscaAtual.ts) no load compartilhado, ou ` +
      `\`let vivo = true\` + cleanup no efeito inline — senão a resposta lenta ` +
      `do período antigo chega por último e sobrescreve a tela.\n` +
      culpados.join("\n"),
    ).toEqual([]);
  });

  /**
   * COMPETÊNCIA é a mesma doença com outro nome.
   *
   * "Vou pra setembro e volto pra agosto, e às vezes o dado de setembro fica
   * ali": trocar o mês da folha dispara uma leitura por competência, e a
   * anterior ainda está no ar. As duas escrevem no mesmo estado; vence quem
   * chegar por último, não quem foi pedido por último — e o seletor diz um
   * mês enquanto a tabela mostra outro. Não tem poll para consertar sozinho:
   * o número errado fica na tela até alguém recarregar, e nessa tela ele é
   * dinheiro que alguém vai pagar.
   */
  it("toda leitura por competência tem guarda de busca mais nova", () => {
    const culpados: string[] = [];
    for (const full of varrer(ALVO)) {
      const caminho = relative(RAIZ, full);
      const linhas = readFileSync(full, "utf8").split("\n");
      linhas.forEach((linha, i) => {
        if (!/competencia=\$\{/.test(linha)) return;
        // Escrita (POST/PUT/DELETE) não disputa a tela: ela responde a UM
        // clique e o resultado é gravado onde foi pedido.
        const redor = linhas.slice(Math.max(0, i - 4), i + 8).join("\n");
        if (/method:\s*["'`](POST|PUT|PATCH|DELETE)/.test(redor)) return;
        if (!/fetch\(/.test(linhas.slice(Math.max(0, i - 2), i + 3).join("\n"))) return;
        const janela = linhas.slice(Math.max(0, i - JANELA), i + JANELA).join("\n");
        if (!GUARDA.test(janela)) culpados.push(`${caminho}:${i + 1}`);
      });
    }
    expect(
      culpados,
      `Leitura por competência sem guarda de resposta atrasada — trocar de mês ` +
      `duas vezes deixa a tela com o mês errado embaixo do seletor certo.\n` +
      culpados.join("\n"),
    ).toEqual([]);
  });
});
