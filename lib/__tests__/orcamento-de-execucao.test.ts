import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Trava de orçamento de execução.
 *
 * Duas vezes este projeto caiu por consumo, e as duas por código que parecia
 * inocente na revisão:
 *
 * - julho/2026 — 6,3 GB de egress no Supabase com um banco de 53 MB. Telas com
 *   `setInterval` re-baixando o dataset inteiro a cada ciclo.
 * - agosto/2026 — o Hobby da Vercel PAUSOU o projeto: 1,1M de invocações (teto
 *   1M) e 11h53m de Fluid Active CPU (teto 4h). Aqui nem adiantava a resposta
 *   ser pequena: paga-se a execução, não o tamanho.
 *
 * Nas duas o problema entrou como uma linha só, num arquivo sobre outro assunto,
 * e só apareceu na fatura semanas depois. Documentação no CLAUDE.md não segurou
 * — por isso isto é um teste, que falha antes do merge.
 *
 * Cada exceção abaixo tem nome e MOTIVO. Se você veio parar aqui porque o teste
 * quebrou, a pergunta certa não é "como adiciono à lista" e sim "esse poll
 * precisa mesmo existir nesse ritmo".
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

const IGNORAR_DIR = new Set([
  "node_modules", ".next", ".git", ".claude", ".worktrees",
  "tridimarket-app", "android", "supabase", "docs", "public",
]);

function varrer(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR_DIR.has(nome)) continue;
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) varrer(full, out);
    else if (/\.tsx?$/.test(nome) && !full.includes("__tests__")) out.push(full);
  }
  return out;
}

const ARQUIVOS = varrer(RAIZ).map((f) => ({ caminho: relative(RAIZ, f), texto: readFileSync(f, "utf8") }));

// ── 1. Poll na mão ───────────────────────────────────────────────────────────
// Um arquivo que tem `setInterval` E `fetch` está, quase sempre, polindo na mão.
// O jeito certo é `usePollComRecuo`/`agendarComRecuo` (app/(plataforma)/ui/usePoll.ts),
// que recua sozinho na tela aberta e esquecida.
const POLL_NA_MAO_OK: Record<string, string> = {
  "app/app/AppClient.tsx":
    "o setInterval é um RELÓGIO (setNow a cada 1s), não busca nada; o fetch do arquivo é sob ação do usuário",
  "app/(plataforma)/UpdateBanner.tsx":
    "checagem de versão a cada 10min, e PARA quando acha a versão nova; quem faz o trabalho de verdade é o visibilitychange",
  "app/(plataforma)/trafego/TrafegoClient.tsx":
    "o setInterval só incrementa um contador de re-render (datas relativas); não busca nada",
  "app/f/ChatRuntime.tsx":
    "carrossel (3,5s) e contagem regressiva (1s) do player; ambos puramente visuais",
  "app/(plataforma)/tridimarket/estoque/ModalNota.tsx":
    "espera do OCR da nota enquanto o modal está aberto; 2,5s é a UX certa e desiste sozinho em 5min",
  "app/(plataforma)/central/mensagens/data/storeCanais.ts":
    "poll de RESERVA: só liga quando o WebSocket do Realtime cai, e desliga quando volta",
  "app/(plataforma)/central/mensagens/data/storeMensagens.ts":
    "poll de RESERVA: só liga quando o WebSocket do Realtime cai, e desliga quando volta",
  "app/painel/ImagemDoPainel.tsx":
    "carrossel de imagens da TV box velha: o manifesto é rebuscado a cada 5min (raro) e as imagens a cada 1min (refresh visual); é o modo imagem, não um poll de dados de tela",
};

describe("orçamento de execução", () => {
  it("não tem poll escrito na mão fora da lista de exceções", () => {
    const suspeitos = ARQUIVOS.filter(({ caminho, texto }) =>
      caminho.startsWith("app/") &&
      texto.includes("setInterval(") &&
      texto.includes("fetch(") &&
      !/usePollComRecuo|agendarComRecuo|usePollVisivel/.test(texto) &&
      !(caminho in POLL_NA_MAO_OK)
    ).map((a) => a.caminho);

    expect(
      suspeitos,
      `Poll escrito na mão. Use usePollComRecuo/agendarComRecuo de ` +
      `app/(plataforma)/ui/usePoll.ts — ritmo base pra quem está mexendo, recuo ` +
      `progressivo na tela parada. Se for um timer visual (relógio, carrossel) ou ` +
      `um poll de reserva, acrescente o arquivo a POLL_NA_MAO_OK COM O MOTIVO.`,
    ).toEqual([]);
  });

  // ── 2. Ritmo curto demais ──────────────────────────────────────────────────
  // Um `setInterval` de menos de 5s que busca dados é uma invocação a cada 5s por
  // aba aberta. Só se justifica com recuo (que o item 1 já cobra).
  it("não tem poll de menos de 5s buscando dados", () => {
    const ruins: string[] = [];
    for (const { caminho, texto } of ARQUIVOS) {
      if (!caminho.startsWith("app/") || !texto.includes("fetch(")) continue;
      if (caminho in POLL_NA_MAO_OK) continue;
      for (const m of texto.matchAll(/setInterval\([\s\S]{0,400}?,\s*(\d[\d_]*)\s*\)/g)) {
        const ms = Number(m[1].replace(/_/g, ""));
        if (ms < 5000) ruins.push(`${caminho} (${ms}ms)`);
      }
    }
    expect(ruins, "Poll abaixo de 5s num arquivo que busca dados.").toEqual([]);
  });

  // ── 3. select("*") em leitura ──────────────────────────────────────────────
  // `*` arrasta jsonb, texto longo e colunas que a tela nem usa — e cresce
  // sozinho quando alguém adiciona uma coluna, sem ninguém revisar.
  const SELECT_ESTRELA_OK: Record<string, string> = {
    "app/api/atividades/claim/route.ts": "linha única recém-gravada (.maybeSingle), devolvida pro tablet",
    "app/api/device/accept/route.ts": "linha única recém-gravada (.maybeSingle)",
    "app/api/device/claim/route.ts": "linha única + candidatos do pool, com limite",
    "app/api/device/pull/route.ts": "payload de sincronização do tablet: precisa da linha inteira",
    "app/api/insumos/route.ts": "tem .limit(200)",
    "app/api/atividades-catalogo/route.ts": "catálogo curto, tabela estreita",
    "lib/recebimento.ts": "linhas recém-inseridas (.single) e listagens com .limit()",
    "lib/comercial.ts": "listagens com .limit()",
    "lib/comercial-pedidos.ts": "pedido único por id (.maybeSingle)",
    "lib/estoque.ts": "movimentos com .limit(1000)",
    "lib/trafego-ab.ts": "testes A/B: linha única ou lista com .limit(200)",
    "lib/producao-modelos.ts": "tabela de configuração, poucas dezenas de linhas",
    "lib/datasource/supabase.ts": "tabelas estreitas do painel (salespeople/teams/products), todas com .limit()",
    "lib/metas.ts": "tabela de metas ativas, estreita e com .limit()",
    "lib/ponto-turnos.ts": "tabela de configuração de turnos, com .limit()",
    "lib/tridimarket/notas.ts": "job único do worker (.maybeSingle) e reivindicação com .limit(1)",
    "lib/tridimarket/repository.ts": "proposital e comentado no arquivo: a coluna `pendencias` é nova e nomear colunas derrubaria a aba Tablets onde o SQL ainda não rodou",
  };

  it('não usa select("*") em código novo de leitura', () => {
    const ruins = ARQUIVOS.filter(({ caminho, texto }) =>
      (caminho.startsWith("app/api/") || caminho.startsWith("lib/")) &&
      /\.select\(\s*["'`]\*["'`]\s*\)/.test(texto) &&
      !(caminho in SELECT_ESTRELA_OK)
    ).map((a) => a.caminho);

    expect(
      ruins,
      `select("*") em rota de leitura. Nomeie as colunas (ver COLS_ATIVIDADE em ` +
      `lib/atividades.ts). Se for mesmo uma linha única recém-gravada, acrescente ` +
      `o arquivo a SELECT_ESTRELA_OK COM O MOTIVO.`,
    ).toEqual([]);
  });

  // ── 4. vh no CSS ───────────────────────────────────────────────────────────
  // Regra de celular do CLAUDE.md, mecânica o bastante pra ser verificada: no
  // celular `vh` inclui a barra do navegador, então o rodapé do modal nasce
  // atrás dela. Sempre `dvh`.
  it("não usa vh onde deveria ser dvh", () => {
    const ruins: string[] = [];
    for (const { caminho, texto } of ARQUIVOS) {
      if (!caminho.startsWith("app/")) continue;
      for (const m of texto.matchAll(/(\d|\))\s*vh\b/g)) {
        const ctx = texto.slice(Math.max(0, m.index - 60), m.index + 10);
        if (/dvh|svh|lvh/.test(ctx)) continue;
        ruins.push(`${caminho}: …${ctx.trim().slice(-45)}`);
      }
    }
    expect(ruins, "Use dvh em vez de vh (regra de celular do CLAUDE.md).").toEqual([]);
  });
});
