import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Trava da paleta por tema.
 *
 * Em agosto/2026 o app tinha 1280 cores escritas na mão em 159 arquivos, todas
 * com o valor do tema ESCURO — são as cores de sistema do iOS. Cor escrita na
 * mão não tem tema: sobre o card branco do tema claro o verde dava 2,02:1, o
 * laranja 2,06:1 e o azul 1,72:1. Reprovam até como texto grande; na prática o
 * número sumia da tela.
 *
 * Isso não entrou de uma vez. Entrou uma linha por vez, em arquivos sobre
 * outros assuntos, cada uma parecendo inofensiva — e ninguém revisa um `#30D158`
 * porque ele *parece* certo na tela em que foi escrito (a escura). Só aparece
 * quando outra pessoa, noutro tema, não consegue ler o número.
 *
 * Pelo mesmo motivo do orcamento-de-execucao.test.ts, a defesa é um teste e não
 * um parágrafo no CLAUDE.md: documentação não segurou nas duas vezes em que o
 * projeto caiu por consumo.
 *
 * Se você veio parar aqui porque o teste quebrou, a pergunta não é "como
 * adiciono à exceção" — é "que TOKEN diz o que essa cor significa". A tabela
 * está em app/globals.css: --ok, --atencao, --perigo, --info, --azul, --roxo,
 * --amarelo, --neutro, --indigo, --rosa, --areia, --perigo-forte, e a rampa
 * categórica --cat-1..9 (para quando a cor só precisa DISTINGUIR, não
 * significar).
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

const IGNORAR_DIR = new Set([
  "node_modules", ".next", ".git", ".claude", ".worktrees",
  "tridimarket-app", "android", "supabase", "docs", "tv-app", "tv-central",
]);

/**
 * As cores de sistema do iOS e suas vizinhas. São exatamente as que "parecem
 * certas" no escuro e somem no claro — o repertório de quem escolhe uma cor de
 * status a olho.
 */
const PROIBIDAS: Record<string, string> = {
  "30d158": "--ok", "34c759": "--ok", "16a34a": "--ok", "1f9d57": "--ok", "12a150": "--ok",
  "ff9f0a": "--atencao", "d97706": "--atencao", "f5a524": "--atencao", "e08600": "--atencao",
  "ff453a": "--perigo", "e5484d": "--perigo", "ef4444": "--perigo", "dc2626": "--perigo",
  "ff6b6b": "--perigo", "e0342b": "--perigo", "d4494e": "--perigo", "b91c1c": "--perigo-forte",
  "64d2ff": "--info", "0a84ff": "--azul", "2563eb": "--azul", "3b82f6": "--azul", "5e9eff": "--azul",
  "bf5af2": "--roxo", "ffd60a": "--amarelo",
  "8e8e93": "--neutro", "8a8a92": "--neutro", "98a2b3": "--neutro", "c7c7cc": "--neutro",
  "5b6b7a": "--neutro",
  "5e5ce6": "--indigo", "6366f1": "--indigo",
  "ff375f": "--rosa (ou --cat-5, se for categoria)", "ff2d55": "--rosa (ou --cat-5)",
  "db2777": "--rosa (ou --cat-5)", "0891b2": "--teal (ou --cat-10)",
  // O violeta padrão da casa como cor de STATUS. Não é `--primary`: a pessoa
  // escolhe o destaque, e nem todo valor escolhido passa em contraste como
  // tinta — por isso `--primary-texto`, que é a variante ajustada por tema.
  "7c3aed": "--primary-texto", "6d28d9": "--primary-texto", "8b5cf6": "--primary-texto",
};

/**
 * Exceções, cada uma com MOTIVO. Só há três razões legítimas:
 *  1. cor de terceiro (logo alheio — não é nossa pra ajustar);
 *  2. contexto onde `var()` não resolve (HTML impresso, canvas, e-mail);
 *  3. a própria definição da paleta.
 */
const EXCECOES: { arquivo: string; motivo: string }[] = [
  { arquivo: "app/globals.css", motivo: "é a definição da paleta" },
  { arquivo: "lib/aparencia.ts", motivo: "calcula cor por luminância; opera em hex, não em token" },
  {
    arquivo: "lib/preload.ts",
    motivo: "espelho de lib/aparencia.ts que roda ANTES do CSS (inline no <head>): opera em hex; e o console.log do easter egg pinta o DevTools, que não lê token",
  },
  { arquivo: "app/layout.tsx", motivo: "<meta name=theme-color> exige literal — var() não resolve em meta" },
  // ── Motivo 2: var() não resolve ali ────────────────────────────────────────
  {
    arquivo: "app/global-error.tsx",
    motivo:
      "última rede: pega o erro que derruba o PRÓPRIO layout raiz, e com ele vai "
      + "embora o `globals.css` (é o layout que o importa). Nenhum `var(--*)` do app "
      + "existe nesse ponto. Por isso o arquivo declara os próprios tokens `--ge-*` "
      + "com claro e escuro por `prefers-color-scheme` — e usa os MESMOS hex da "
      + "paleta (#ff453a no escuro, #d70015 no claro, calibrado sobre fundo branco).",
  },
  {
    arquivo: "app/opengraph-image.tsx",
    motivo:
      "card de compartilhamento gerado pelo Satori (next/og): não há CSS, não há "
      + "cascata e não há `var()` — a imagem é pintada com valor literal. Também não "
      + "tem tema: é PNG, sempre o mesmo em qualquer aparelho.",
  },
  {
    arquivo: "lib/types.ts",
    motivo: "DEFAULT_CONFIG do painel de TV: valor GRAVADO e configurável por TV, não estilo",
  },
  {
    arquivo: "lib/tridiflow.ts",
    motivo: "tema de bot salvo no banco e renderizado em /f/[slug], fora do shell do app",
  },
  {
    arquivo: "lib/tridiflow-linktridi.ts",
    motivo: "idem — cores padrão do doc LinkTridi (página pública, tinta do usuário, não estilo do app)",
  },
  {
    arquivo: "app/dev-micro/ProvaCatalogo.tsx",
    motivo: "amostras do SeletorCor/AmostrasCor — hex é o VALOR que a pessoa escolhe e o banco guarda, não estilo do app",
  },
  {
    arquivo: "app/dev-producao/dados-prova.ts",
    motivo: "dado de prova com a forma do banco: a cor de cada etapa vem do ERP em hex, não é estilo do app",
  },
  {
    arquivo: "app/dev-linktridi/page.tsx",
    motivo: "doc de exemplo do banco de provas do LinkTridi — mesmas cores de doc, não estilo do app",
  },
  {
    arquivo: "app/f/QuizRuntime.tsx",
    motivo:
      "player público do funil de quiz: a paleta ali é a do BOT (corFundo/corBotao "
      + "escolhidos por quem montou), não a do ERP. `var(--perigo)` até resolveria — o "
      + "globals.css é carregado pela raiz — mas resolveria pro tema do SISTEMA: um bot "
      + "de fundo branco aberto com o ERP no escuro herdaria o vermelho do escuro. "
      + "O vermelho do erro de campo é fixo de propósito, e passa nos dois fundos.",
  },
  {
    arquivo: "app/l/vitrine.css",
    motivo:
      "vitrine pública da loja: paleta PRÓPRIA, com claro e escuro declarados no "
      + "próprio arquivo (`:root` do .vt + `prefers-color-scheme`) — o que a regra "
      + "cobra, ela já faz, só que sem depender do ERP. Usar `var(--primary-texto)` "
      + "aqui amarraria a identidade da LOJA ao tema do SISTEMA: trocar um token do "
      + "Gaius mudaria a cor da loja do cliente, e o visitante herdaria o tema de "
      + "quem nunca vai abrir aquela página. Mesmo motivo do tema de página pública "
      + "do TridiFlow, logo abaixo.",
  },
  { arquivo: "lib/tridiflow-pagina.ts", motivo: "idem — tema de página pública" },
  { arquivo: "lib/tridiflow-pagina-tema.ts", motivo: "idem — tema de página pública" },
  { arquivo: "lib/tridiflow-pagina-tipos.ts", motivo: "idem — tema de página pública" },
  { arquivo: "lib/tridiflow-pagina-templates.ts", motivo: "idem — tema de página pública" },
  { arquivo: "lib/tridiflow-site-maindx.ts", motivo: "idem — tema de página pública (violeta é a cor da MARCA do site Maindx, dado da página, não cor de status do ERP)" },
  { arquivo: "lib/tridiflow-pagina-estilo.ts", motivo: "idem — tema de página pública" },
  {
    arquivo: "lib/tridimarket/theme.ts",
    motivo: "tema do totem Android (Compose), que não lê CSS",
  },
  {
    arquivo: "app/dev-tridiflow-pagina/DevPaginaClient.tsx",
    motivo: "fixture do tema de página pública — imita o registro do banco, que é hex",
  },
  // ── Motivo 1: cor de terceiro ──────────────────────────────────────────────
  {
    arquivo: "app/(plataforma)/central/mensagens/ui/chat.css",
    motivo: "realce de SINTAXE (--cod-chave/--cod-texto/--cod-numero/--cod-funcao): conjunto afinado entre si, e seguir o destaque escolhido faria palavra-chave e string caírem na mesma cor",
  },
  {
    arquivo: "app/painel/widgets/widgets.css",
    motivo: "painel de TV: a paleta é CONFIGURADA por aparelho (--p-primaria/--p-secundaria de DEFAULT_CONFIG); os hex são o fallback dela, não estilo do app",
  },
  {
    arquivo: "lib/marketplaces.ts",
    motivo: "Mercado Livre, Shopee, TikTok Shop: identidade alheia, não é nossa pra ajustar",
  },
];

function varrer(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR_DIR.has(nome)) continue;
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) varrer(full, out);
    // `.css` entra junto, e a falta disso escondeu um defeito real: o
    // chat.css tinha as quatro cores do ponto de presença escritas na mão
    // (#30d158, #ffd60a, #ff453a, #8e8e93). A varredura só olhava .ts/.tsx,
    // então um arquivo de estilo inteiro passava despercebido — justo onde
    // cor escrita na mão é mais natural de aparecer.
    else if (/\.(tsx?|css)$/.test(nome) && !full.includes("__tests__")) out.push(full);
  }
  return out;
}

// `lib/` entra junto: os mapas de status e categoria moram lá (produção,
// design, logística, Eisenhower, criativos) e alimentam a interface igual a
// qualquer componente. Ficar de fora foi como as cores fixas sobreviveram à
// primeira varredura.
const ARQUIVOS = [...varrer(join(RAIZ, "app")), ...varrer(join(RAIZ, "lib"))].map((f) => ({
  caminho: relative(RAIZ, f),
  texto: readFileSync(f, "utf8"),
}));

const isento = (caminho: string) => EXCECOES.some((e) => caminho === e.arquivo);

/**
 * Hex dentro de comentário não pinta nada — e é justamente onde fica o valor
 * ANTIGO, explicando por que ele saiu. Marcar isso como defeito faria o teste
 * proibir a própria documentação do conserto.
 *
 * O `(?<!:)` no `//` preserva `https://`: sem ele, uma URL cortaria o resto da
 * linha e o teste deixaria passar uma cor escrita depois dela.
 *
 * O comentário vira ESPAÇO em vez de sumir: apagar encurta o arquivo e
 * desloca a numeração, e aí o teste aponta uma linha onde não há cor nenhuma.
 * Uma trava que informa errado manda a pessoa procurar no lugar errado — pior
 * do que não avisar. As quebras de linha são preservadas pelo mesmo motivo.
 */
const semComentarios = (texto: string) => {
  const brancos = (s: string) => s.replace(/[^\n]/g, " ");
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, brancos)
    .replace(/(?<!:)\/\/.*$/gm, brancos);
};

describe("paleta por tema", () => {
  it("nenhuma cor de status escrita na mão — use o token, que muda de tema", () => {
    const achados: string[] = [];

    for (const { caminho, texto } of ARQUIVOS) {
      if (isento(caminho)) continue;
      semComentarios(texto).split("\n").forEach((linha, i) => {
        // `\b` depois de 6 dígitos evita casar os 6 primeiros de um hex de 8
        // (com alfa), que é outra coisa.
        // `placeholder="#7C3AED"` é CONTEÚDO: o exemplo que a pessoa lê antes
        // de digitar o próprio hex no campo de cor. Não pinta nada, e trocar
        // por um token mostraria "var(--primary-texto)" dentro do campo.
        if (/placeholder\s*=/.test(linha)) return;
        for (const m of linha.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
          const token = PROIBIDAS[m[1].toLowerCase()];
          if (token) achados.push(`${caminho}:${i + 1} — ${m[0]} deveria ser var(${token})`);
        }
      });
    }

    expect(achados, `\nCor de status escrita na mão não tem tema: o valor do escuro\n`
      + `reprova em contraste sobre o card branco do claro (medido: verde 2,02:1,\n`
      + `laranja 2,06:1, azul 1,72:1). Troque pelo token semântico.\n\n`
      + achados.join("\n") + "\n").toEqual([]);
  });

  it("a paleta define os dois temas para todo token — um só é meia paleta", () => {
    const css = readFileSync(join(RAIZ, "app/globals.css"), "utf8");
    // Recorta os dois blocos de definição pra comparar o que cada um declara.
    const bloco = (marca: string) => {
      const i = css.indexOf(marca);
      return css.slice(i, css.indexOf("\n}", i));
    };
    const nomes = (s: string) =>
      new Set([...s.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]));

    const escuro = nomes(bloco(":root {"));
    const claro = nomes(bloco("html.light {"));

    const SEMANTICOS = [
      "--ok", "--atencao", "--perigo", "--perigo-forte", "--info", "--azul",
      "--roxo", "--amarelo", "--neutro", "--indigo", "--rosa", "--areia", "--teal",
    ];
    const faltando = SEMANTICOS.filter((t) => !escuro.has(t) || !claro.has(t));

    expect(faltando, `\nToken definido em um tema só herda o valor do outro — que é\n`
      + `exatamente o defeito que esta paleta existe pra corrigir.\n`
      + `Sem par em :root e html.light: ${faltando.join(", ")}\n`).toEqual([]);
  });
});
