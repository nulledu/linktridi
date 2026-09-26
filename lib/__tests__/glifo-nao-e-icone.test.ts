import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ── Glifo tipográfico não é ícone ───────────────────────────────────────────
 *
 * O CLAUDE.md manda: toda iconografia visível é Tabler, via `<Icon>`. Mesmo
 * assim o ▲/▼ voltou TRÊS vezes em telas diferentes — no `KpiDelta`, na
 * variação da Tridify e no desempenho de tráfego. Documentação não segurou,
 * porque o glifo entra como uma linha só, no meio de um arquivo sobre outro
 * assunto, e ninguém revisa uma string.
 *
 * Por que isso importa mais do que parece:
 *
 *  1. **Glifo não tem tema nem peso.** ▲ é desenhado pela fonte do sistema:
 *     muda de forma, de espessura e de alinhamento vertical entre Mac, Windows
 *     e Android. Ao lado de um `<Icon>` Tabler de stroke 2, ele lê como defeito.
 *  2. **Glifo não tem cor de estado confiável.** Vira `currentColor` e ignora a
 *     paleta semântica calibrada por tema.
 *  3. **Leitor de tela ANUNCIA o caractere.** "▲ 12%" vira "triângulo apontando
 *     para cima 12 por cento". O `<Icon>` sai com `aria-hidden` e sobra o número.
 *  4. **O pior caso: o glifo vira LÓGICA.** Em `AtividadesClient` o código
 *     decidia a cor da mensagem com `msg.startsWith("✓")` — o desenho passou a
 *     carregar significado, então trocar o ícone quebraria a cor.
 *
 * ── O que NÃO é violação ────────────────────────────────────────────────────
 *
 * Esta trava é estreita de propósito, senão vira ruído e alguém a desliga:
 *
 *  · `·` (ponto médio) e `→` DENTRO de frase são PONTUAÇÃO — "12 itens · 3
 *    atrasados", "visita → compra". Não entram na lista abaixo.
 *  · `★` repetido é NOTA (uma avaliação de 4 estrelas é o conteúdo, não um
 *    ícone de interface). O padrão `.repeat(` é liberado.
 *  · Comentário não é interface. São removidos antes da varredura — inclusive
 *    o comentário que EXPLICA um glifo removido, que senão se auto-acusaria.
 */
const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

/** Glifos que só existem para funcionar como ícone. `·`, `→`, `—` e aspas
 *  tipográficas ficam de fora: são pontuação de texto corrido. */
const GLIFOS = /[▲▼✓✔✗✘●○◆◇➜⬆⬇★☆]/;

/**
 * Exceções, cada uma com o motivo escrito — mesma convenção do
 * `orcamento-de-execucao.test.ts`. Se o teste quebrou, a pergunta certa não é
 * "como adiciono à lista" e sim "esse desenho precisa ser um caractere?".
 */
const LIBERADOS: Record<string, string> = {
  "app/f/ChatRuntime.tsx":
    "a nota que o VISITANTE escolheu é ecoada como resposta dele no chat ('★★★★'); " +
    "é conteúdo da conversa, não cromo da interface",
  "app/p/BlocoView.tsx":
    "estrela de avaliação DENTRO da página publicada — é o conteúdo que o cliente " +
    "montou pra rodar no anúncio, não interface do ERP",
  "app/(plataforma)/tridiflow/[id]/EditorClient.tsx":
    "texto-modelo do bloco de depoimento ('★★★★★ “…” — Cliente') que o marketeiro " +
    "edita; é valor inicial de campo, não ícone desenhado pela tela",
  "app/f/QuizRuntime.tsx":
    "o player do quiz é uma página PÚBLICA auto-contida — traz o próprio CSS e não " +
    "importa o kit do ERP. Puxar o <Icon> arrastaria o mapa inteiro de paths do " +
    "Tabler pra um bundle que roda dentro de anúncio, onde cada kB é custo de " +
    "conversão. A decisão já estava escrita no próprio arquivo",
  "app/p/OfertaBloco.tsx":
    "mesma família do player: bloco de uma PÁGINA PUBLICADA, renderizada fora do " +
    "sistema de design do ERP e sem acesso ao <Icon>",
};

function varrer(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next" || nome === "__tests__" || nome.startsWith(".")) continue;
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) varrer(full, saida);
    else if (nome.endsWith(".tsx")) saida.push(full);
  }
  return saida;
}

/** Tira comentários — de linha, de bloco e os do JSX — e o conteúdo de
 *  `.repeat(`. O que sobra é o que a tela realmente desenha.
 *
 *  Comentário de bloco é trocado por LINHAS EM BRANCO equivalentes, nunca
 *  apagado: apagar encurta o arquivo e todo número de linha depois dele sai
 *  errado no relatório. Um aviso que aponta pra linha errada é pior que não
 *  avisar — manda a pessoa procurar um glifo onde não tem nenhum. */
function soOqueDesenha(texto: string): string {
  const vazias = (s: string) => "\n".repeat((s.match(/\n/g) || []).length);
  return texto
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, vazias)   // comentário do JSX
    .replace(/\/\*[\s\S]*?\*\//g, vazias)             // bloco
    .replace(/^(\s*)\/\/.*$/gm, "$1")                 // linha
    .replace(/"[★☆]+"\s*\.repeat\(/g, "");            // "★".repeat(n) = nota, não ícone
}

describe("glifo tipográfico não faz papel de ícone", () => {
  const arquivos = varrer(join(RAIZ, "app")).map((f) => ({
    caminho: relative(RAIZ, f),
    texto: readFileSync(f, "utf8"),
  }));

  it("varre uma quantidade plausível de telas", () => {
    // Guarda contra a varredura silenciosamente parar de achar arquivo (um
    // `readdirSync` que erra o caminho passaria com zero violações e o teste
    // viraria enfeite verde).
    expect(arquivos.length).toBeGreaterThan(300);
  });

  it("nenhuma tela usa ▲ ▼ ✓ ● ★ como ícone", () => {
    const ruins: string[] = [];
    for (const { caminho, texto } of arquivos) {
      if (LIBERADOS[caminho]) continue;
      const corpo = soOqueDesenha(texto);
      for (const [i, linha] of corpo.split("\n").entries()) {
        const m = GLIFOS.exec(linha);
        if (m) ruins.push(`${caminho}:${i + 1}  ${m[0]}  ${linha.trim().slice(0, 72)}`);
      }
    }
    expect(
      ruins,
      "Glifo usado como ícone. Troque por <Icon name=\"...\"> do Tabler " +
        "(app/(plataforma)/Icon.tsx). Sugestões: ▲→trending-up, ▼→trending-down, " +
        "✓→check/circle-check, ●→circle-filled, ★→star. " +
        "Se for CONTEÚDO (nota que o usuário deu, texto-modelo), acrescente o " +
        "arquivo a LIBERADOS com o motivo escrito.",
    ).toEqual([]);
  });

  /**
   * A seta é o caso de FRONTEIRA, e por isso tem regra própria.
   *
   * `→` entre duas palavras é pontuação legítima e existe 136 vezes na base:
   * "visita → compra", "arte → máquina", "pedido → entrega". Trocar isso por
   * ícone deixaria a frase ilegível.
   *
   * Mas `→` no FIM de um rótulo, colado no fecha-tag, não é pontuação: é um
   * ícone dizendo "isto leva a outro lugar" — e como glifo ele é desenhado pela
   * fonte do sistema (muda de forma e de peso entre plataformas), fica fora da
   * grade de 24 do Tabler, e o leitor de tela anuncia "seta para a direita"
   * grudado no texto do botão.
   *
   * A posição é o que separa os dois, e é isso que o seletor abaixo lê.
   */
  it("nenhuma seta faz papel de ícone no fim de um rótulo", () => {
    const ruins: string[] = [];
    for (const { caminho, texto } of arquivos) {
      if (LIBERADOS[caminho]) continue;
      const corpo = soOqueDesenha(texto);
      for (const [i, linha] of corpo.split("\n").entries()) {
        // Seta seguida (só por espaços) do fecha-tag = posição de ícone.
        if (/[→←⟶⟵]\s*<\//.test(linha)) {
          ruins.push(`${caminho}:${i + 1}  ${linha.trim().slice(0, 72)}`);
        }
      }
    }
    expect(
      ruins,
      "Seta usada como ícone no fim de um rótulo. Troque por " +
        '<Icon name="chevron-right"> (ou "arrow-right" quando a ação é literalmente ' +
        '"avançar"). Seta ENTRE palavras é pontuação e não entra aqui.',
    ).toEqual([]);
  });

  it("nenhum código DECIDE alguma coisa olhando um glifo", () => {
    // O caso mais caro: o desenho vira significado. `msg.startsWith("✓")`
    // decidia a cor da mensagem — trocar o ícone quebraria a cor junto, e é
    // por isso que essa forma some antes das outras.
    const ruins: string[] = [];
    for (const { caminho, texto } of arquivos) {
      const corpo = soOqueDesenha(texto);
      for (const [i, linha] of corpo.split("\n").entries()) {
        if (/(startsWith|includes|indexOf|===|!==|match)\s*\(?\s*["'`][^"'`]*[▲▼✓✔✗✘●○★]/.test(linha)) {
          ruins.push(`${caminho}:${i + 1}  ${linha.trim().slice(0, 72)}`);
        }
      }
    }
    expect(
      ruins,
      "Um glifo virou LÓGICA: o código compara texto procurando o caractere. " +
        "Guarde o estado num campo próprio ({ ok: boolean, texto: string }) e " +
        "deixe o desenho para o <Icon>.",
    ).toEqual([]);
  });
});

/**
 * ── Todo nome de ícone existe no mapa ───────────────────────────────────────
 *
 * O outro lado da mesma moeda. Trocar um glifo por `<Icon name="circle">` só
 * ajuda se `circle` EXISTIR — e o nome é uma string, então o TypeScript não
 * tem o que conferir.
 *
 * O `Icon.tsx` some em silêncio com nome desconhecido (um ícone faltando não
 * pode derrubar tela). É a decisão certa em produção e o pior modo de falha
 * possível para quem escreve: o elemento simplesmente não existe no DOM, o
 * teste passa, o build passa, e o defeito só aparece quando alguém olha a tela
 * e sente falta de alguma coisa. O próprio arquivo conta que foi assim que o
 * sinal do semáforo do painel ficou invisível — por um `trendingDown` que
 * nunca existiu.
 *
 * Esta trava pega no `npm test` o que só se veria no olho.
 */
describe("nome de ícone sempre existe no mapa do Tabler", () => {
  const fonteIcone = readFileSync(join(RAIZ, "app/(plataforma)/Icon.tsx"), "utf8");
  // O mapa aceita chave com e sem aspas (`"chevron-left":` e `settings:`).
  const mapa = new Set(
    [...fonteIcone.matchAll(/^\s{2}(?:"([a-z0-9-]+)"|([a-z][a-zA-Z0-9]*)):\s*'/gm)]
      .map((m) => m[1] ?? m[2]),
  );

  it("o mapa foi lido de verdade", () => {
    // Sem esta guarda, um regex que parasse de casar deixaria o conjunto vazio
    // e TODO nome viraria "faltando" — ou, pior, a asserção abaixo passaria
    // vazia se a coleta de usos também falhasse.
    expect(mapa.size).toBeGreaterThan(50);
    expect(mapa.has("chevron-left")).toBe(true);
    expect(mapa.has("settings")).toBe(true);
  });

  it("nenhuma tela pede um ícone que não existe", () => {
    const arquivos = varrer(join(RAIZ, "app")).map((f) => ({
      caminho: relative(RAIZ, f),
      texto: readFileSync(f, "utf8"),
    }));

    const faltando: string[] = [];
    for (const { caminho, texto } of arquivos) {
      const corpo = soOqueDesenha(texto);
      const pedidos = new Set<string>();

      // Dentro de `{...}` nem toda string é nome de ícone: em
      // `icone={rumo === "sobe" ? "trending-up" : "trending-down"}` o "sobe" é
      // o operando da COMPARAÇÃO. Tirar os operandos antes de coletar é o que
      // separa o que a tela desenha do que ela apenas testa.
      // Chave de ÍNDICE (`p["aria-expanded"] ? "chevron-up" : "chevron-down"`)
      // também não é nome de ícone — é o nome de uma propriedade. Sem tirá-la,
      // a trava acusava "aria-expanded" como ícone inexistente e ficava
      // vermelha por um desenho que está certo.
      const nomesDe = (expr: string) =>
        [...expr
          .replace(/[!=]==?\s*"[^"]*"/g, "")
          .replace(/\[\s*"[^"]*"\s*\]/g, "")
          .matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);

      // `<Icon name="x">` e `<Icon name={cond ? "x" : "y"}>`, idem TrocaIcone.
      for (const tag of corpo.matchAll(/<(?:Icon|TrocaIcone)\b[^>]*>/g)) {
        // Template literal (`chevron-${dir}`) é montado em tempo de execução:
        // não dá pra conferir daqui, e chutar geraria falso positivo.
        if (/`/.test(tag[0])) continue;
        for (const par of tag[0].matchAll(/\b(?:name|a|b)=(?:"([a-z0-9-]+)"|\{([^}]*)\})/g)) {
          if (par[1]) pedidos.add(par[1]);
          else if (par[2]) for (const n of nomesDe(par[2])) pedidos.add(n);
        }
      }
      // A prop `icone=` do kit de controles (Botao, BotaoIcone) também é nome
      // de Tabler — e some do mesmo jeito quando erra.
      for (const par of corpo.matchAll(/\bicone=(?:"([a-z0-9-]+)"|\{([^}`]*)\})/g)) {
        if (par[1]) pedidos.add(par[1]);
        else if (par[2]) for (const n of nomesDe(par[2])) pedidos.add(n);
      }

      for (const n of pedidos) if (!mapa.has(n)) faltando.push(`${caminho}  →  "${n}"`);
    }

    expect(
      faltando,
      "Ícone pedido que não existe no mapa de app/(plataforma)/Icon.tsx. Ele some " +
        "EM SILÊNCIO na tela. Copie o <path> oficial do Tabler " +
        "(https://github.com/tabler/tabler-icons, viewBox 0 0 24 24, stroke 2, sem " +
        "fill) e acrescente a entrada no ICONS.",
    ).toEqual([]);
  });
});
