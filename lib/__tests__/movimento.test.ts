import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Trava da escala de movimento ─────────────────────────────────────────────
// Duas vezes este projeto caiu por consumo com as regras já escritas no
// CLAUDE.md, e a conclusão que ficou foi: documentação não segura nada. O
// problema entra como uma linha só, num arquivo sobre outro assunto.
//
// Movimento tem exatamente a mesma forma de falha. As armadilhas abaixo já
// aconteceram — algumas neste commit, antes de a varredura achá-las:
//
//  1. `translateX` numa peça que ENTRA empurra o bloco pra fora do pai, e a
//     sobra vira largura do documento. Medido: 14px a 768px num item de grade,
//     e dois cartões saindo em -14px/334px a 320px. O `overflow-x: clip` do
//     body engole a sobra, então não aparece barra de rolagem — é o defeito que
//     a varredura marca como CORTA, o pedaço que fica inalcançável em silêncio.
//  2. Fechar mais devagar que abrir. Abrir é convite, fechar é sair da frente;
//     um fechamento que demora o mesmo tempo da abertura faz a interface
//     parecer que está pedindo permissão pra sair.
//  3. Duração escrita na mão. Foi assim que o app juntou onze durações para
//     seis intenções (0.12s, .13s, 150ms, .32s…), uma escolhida por arquivo.
//  4. Bloco `prefers-reduced-motion` removido junto com um "refactor" de CSS.
//     Cada receita do transitions.dev traz o dela, e tirar um reprova a
//     acessibilidade sem quebrar nada visível — ninguém percebe até auditar.
const RAIZ = join(__dirname, "..", "..");
const CSS_BRUTO = readFileSync(join(RAIZ, "app", "globals.css"), "utf8");
const CSS = CSS_BRUTO.replace(/\/\*[\s\S]*?\*\//g, "");

// Só o que este trabalho introduziu. O arquivo tem 3600 linhas anteriores com
// suas próprias decisões (e seus próprios débitos): varrer tudo faria o teste
// falhar por código que ele não governa, e a resposta seria uma lista de
// exceções em vez de uma correção.
//
// O corte é no arquivo CRU e só depois os comentários caem: o marcador do
// início do bloco é o próprio banner, que É um comentário — procurá-lo no texto
// já limpo devolve -1 e o teste passaria por não ter achado nada (foi o que
// aconteceu na primeira versão deste arquivo). O `slice` cai no meio do banner,
// então o resto dele é descartado até o primeiro `*/`.
const INICIO = CSS_BRUTO.indexOf("MICRO-TRANSIÇÕES");
const NOVO = INICIO < 0 ? "" : (() => {
  const bruto = CSS_BRUTO.slice(INICIO);
  const fimDoBanner = bruto.indexOf("*/");
  return (fimDoBanner < 0 ? bruto : bruto.slice(fimDoBanner + 2)).replace(/\/\*[\s\S]*?\*\//g, "");
})();

// Parse rasteiro: pares (seletor, corpo). Regra dentro de @media traz o
// cabeçalho colado no seletor — daí o corte no último `{` restante.
const REGRAS = [...NOVO.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  sel: m[1].split("{").pop()!.replace(/\s+/g, " ").trim(),
  corpo: m[2].replace(/\s+/g, " ").trim(),
}));

/** Resolve `var(--x)` contra as declarações do `:root` até chegar num número. */
function resolverMs(valor: string, profundidade = 0): number | null {
  const v = valor.trim();
  if (profundidade > 6) return null;
  const varMatch = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(v);
  if (varMatch) {
    const decl = new RegExp(`${varMatch[1]}\\s*:\\s*([^;}]+)`).exec(NOVO) || new RegExp(`${varMatch[1]}\\s*:\\s*([^;}]+)`).exec(CSS);
    return decl ? resolverMs(decl[1], profundidade + 1) : null;
  }
  const num = /^([\d.]+)\s*(ms|s)$/.exec(v);
  if (!num) return null;
  return num[2] === "s" ? parseFloat(num[1]) * 1000 : parseFloat(num[1]);
}

describe("escala de movimento", () => {
  it("o bloco novo existe (o teste não passa por não ter achado nada)", () => {
    expect(INICIO, "bloco MICRO-TRANSIÇÕES não encontrado no globals.css").toBeGreaterThan(0);
    expect(REGRAS.length).toBeGreaterThan(50);
  });

  // ── 1. Entrada nunca percorre o eixo horizontal ────────────────────────────
  it("nenhuma peça que ENTRA se desloca no eixo X", () => {
    const ruins = REGRAS.filter((r) => {
      if (!/\.mt-surge|\.mt-fila|\.t-stagger-line|\.t-toast|\.t-panel-slide/.test(r.sel)) return false;
      // `--mt-de` é o transform de PARTIDA do surgir; `transform:` direto cobre
      // as demais. Em ambos, translateX/translate(x,…) com x ≠ 0 é o defeito.
      const alvos = [...r.corpo.matchAll(/(?:--mt-de|transform)\s*:\s*([^;]+)/g)].map((m) => m[1]);
      return alvos.some((t) => /translateX\(\s*(?!0)/.test(t) || /translate\(\s*(?!0(px|%)?\s*[,)])/.test(t));
    });
    expect(
      ruins.map((r) => `${r.sel} { ${r.corpo.slice(0, 90)} }`),
      "Percurso horizontal numa peça que entra empurra o bloco pra fora do pai e " +
      "a sobra vira largura do documento (CORTA). Use o eixo Y — a página já rola nele.",
    ).toEqual([]);
  });

  // ── 2. Fechar é sempre mais rápido que abrir ───────────────────────────────
  it("nenhum fechamento é mais lento que a abertura correspondente", () => {
    const pares: { nome: string; abrir: string; fechar: string }[] = [
      { nome: "modal", abrir: "--modal-open-dur", fechar: "--modal-close-dur" },
      { nome: "dropdown", abrir: "--dropdown-open-dur", fechar: "--dropdown-close-dur" },
      { nome: "painel", abrir: "--panel-open-dur", fechar: "--panel-close-dur" },
      { nome: "aviso", abrir: "--toast-open", fechar: "--toast-close" },
    ];
    const ruins: string[] = [];
    for (const p of pares) {
      const a = resolverMs(`var(${p.abrir})`);
      const f = resolverMs(`var(${p.fechar})`);
      if (a == null || f == null) { ruins.push(`${p.nome}: token não resolveu (${p.abrir}=${a}, ${p.fechar}=${f})`); continue; }
      if (f > a) ruins.push(`${p.nome}: fecha em ${f}ms e abre em ${a}ms`);
    }
    expect(ruins, "Abrir é convite, fechar é sair da frente: o fechamento nunca demora mais que a abertura.").toEqual([]);
  });

  it("nenhum fechamento tem atraso — dispensar é instantâneo", () => {
    const ruins = REGRAS.filter((r) =>
      /\.is-closing|\[data-saindo/.test(r.sel) &&
      /transition-delay\s*:\s*(?!0s|0ms|0\b)/.test(r.corpo));
    expect(ruins.map((r) => r.sel), "Nunca atrase um fechamento.").toEqual([]);
  });

  // ── 3. Toda duração vem da escala ─────────────────────────────────────────
  //
  // A varredura cobre o vocabulário `.mt-*`, que é o do app e o que a escala
  // governa. As receitas `t-*` ficam FORA de propósito: elas são coladas
  // verbatim do transitions.dev, trazem valores já afinados, e a própria
  // doutrina da skill manda não trocar um número só porque outro é parecido —
  // a troca vale quando o USO documentado bate, não quando o número está perto.
  // Reescrevê-las aqui também faria o próximo `add` divergir do que está no
  // repositório, que é o começo de toda dívida de fork.
  //
  // Exceção com o motivo escrito, no mesmo padrão do teste de orçamento: se
  // esta lista crescer, a pergunta certa é "esse ritmo precisa ser próprio?",
  // não "como adiciono à lista".
  const RITMO_PROPRIO: Record<string, string> = {
    "900ms": "desenho do traço do gráfico — é o valor do conjunto mono-rounded de " +
      "origem, e 'traço que se desenha' não tem uso correspondente na escala " +
      "(o token de ênfase, 500ms, é curto demais para uma linha de 30 pontos)",
  };

  // As regras dentro de `prefers-reduced-motion` saem da varredura: ali os
  // números são DESLIGAMENTOS (0.2s, 0.01ms) escolhidos por serem quase zero,
  // não ritmos escolhidos por intenção. Tokenizá-los inverteria o sentido do
  // bloco — ele existe justamente pra fugir da escala.
  const SEM_REDUZIDO = NOVO.replace(/@media[^{]*prefers-reduced-motion[^{]*\{[\s\S]*?\n\}/g, "");
  const REGRAS_RITMO = [...SEM_REDUZIDO.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    sel: m[1].split("{").pop()!.replace(/\s+/g, " ").trim(),
    corpo: m[2].replace(/\s+/g, " ").trim(),
  }));

  /** Durações soltas numa família de seletores, já descontadas as isenções. */
  function duracoesSoltas(familia: RegExp): string[] {
    const fora: string[] = [];
    for (const r of REGRAS_RITMO) {
      if (!familia.test(r.sel)) continue;
      for (const m of r.corpo.matchAll(/(?:transition|animation)(?:-duration)?\s*:\s*([^;]+)/g)) {
        const decl = m[1];
        // Animação em LOOP: o número é o período do ciclo, não o tempo de uma
        // resposta. A escala inteira descreve motivo de ida e volta única
        // (abrir, fechar, trocar) — nenhum token significa "respira a cada N".
        if (/\binfinite\b/.test(decl)) continue;
        for (const d of decl.matchAll(/(?<![\w-])([\d.]+m?s)(?![\w-])/g)) {
          const ms = resolverMs(d[1]);
          // `0s`/`0.01ms` são desligamentos deliberados (arrasto que segue o
          // dedo), não escolhas de ritmo.
          if (ms == null || ms <= 1) continue;
          if (RITMO_PROPRIO[d[1]]) continue;
          fora.push(`${r.sel} → ${d[1]} em "${decl.slice(0, 70)}"`);
        }
      }
    }
    return fora;
  }

  it("as peças .mt-* não escrevem duração na mão", () => {
    expect(
      duracoesSoltas(/\.mt-/),
      "Use var(--duration-*) / var(--mt-*). Duração escolhida arquivo por arquivo é " +
      "como o app juntou onze durações para seis intenções.",
    ).toEqual([]);
  });

  it("o gráfico só tem UM ritmo próprio, e ele está justificado", () => {
    // Trava a exceção acima: qualquer duração nova nas peças `.mono-*` precisa
    // passar pela lista com motivo, senão a arte do gráfico vira o buraco por
    // onde a escala escapa.
    expect(
      duracoesSoltas(/\.mono-/),
      "Duração nova em .mono-* precisa de token ou de motivo escrito.",
    ).toEqual([]);
  });

  // ── 4. Cada receita mantém sua guarda de movimento reduzido ───────────────
  it("toda receita t-* preserva o bloco prefers-reduced-motion", () => {
    // A guarda pode nomear a própria classe ou um filho dela (a receita de
    // sanfona desliga `.t-acc-panel`, não `.t-acc`) — daí o prefixo.
    const RECEITAS = [
      "t-icon-swap", "t-modal", "t-dropdown", "t-panel-slide", "t-toast", "t-tt",
      "t-acc", "t-skel", "t-stagger", "t-digit", "t-input", "t-tilt", "t-avatar", "t-learn", "t-toggle",
    ];
    const blocos = [...CSS.matchAll(/@media\s*\([^)]*prefers-reduced-motion[^)]*\)\s*\{([\s\S]*?)\n\}/g)]
      .map((m) => m[1]).join("\n");
    const semGuarda = RECEITAS.filter((c) => !new RegExp(`\\.${c}[\\w-]*\\b`).test(blocos));
    expect(
      semGuarda,
      "Cada receita do transitions.dev traz um bloco prefers-reduced-motion e ele é " +
      "obrigatório. Sem ele a peça reprova acessibilidade sem quebrar nada visível.",
    ).toEqual([]);
  });

  // ── 5. Nada termina em transform identidade ───────────────────────────────
  it("nenhum keyframe novo termina em translate/scale identidade", () => {
    const quadros = [...NOVO.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)];
    const ruins: string[] = [];
    for (const [, nome, corpo] of quadros) {
      // O defeito só existe quando a animação PERSISTE: é `fill-mode both` ou
      // `forwards` que mantém o último quadro aplicado depois do fim. Sem eles o
      // navegador descarta a contribuição da animação e não sobra transform
      // nenhum — o tremor de erro (`linear`, sem fill) é exatamente esse caso, e
      // marcá-lo seria falso positivo.
      const persiste = REGRAS.some((r) =>
        new RegExp(`animation[^;]*\\b${nome}\\b[^;]*\\b(both|forwards)\\b`).test(r.corpo));
      if (!persiste) continue;

      // Só o quadro FINAL importa: um transform identidade residual vira bloco
      // de contenção e todo `position: fixed` de dentro ancora no elemento em
      // vez da tela — era isso que fazia a folha nascer abaixo da dobra.
      const fim = /(?:^|[^\d])(?:to|100%)\s*\{([^}]*)\}/.exec(corpo);
      if (!fim) continue;
      const t = /transform\s*:\s*([^;]+)/.exec(fim[1]);
      if (!t) continue;
      const v = t[1].trim();
      // Identidade é o valor que NÃO move nada: `translate*(0)`, `rotate(0)`,
      // `scale*(1)`. `scaleX(0)` não é identidade — é a barra que esvazia do
      // aviso de desfazer, que termina de fato encolhida a zero e não tem
      // descendente nenhum pra ancorar.
      const args = /\(([^)]*)\)/.exec(v)?.[1].split(",").map((a) => a.trim()) ?? [];
      const neutro = /^scale/.test(v) ? "1" : "0";
      const identidade = args.length > 0
        && args.every((a) => a.replace(/(px|%|deg|rad|turn)$/, "") === neutro);
      if (/^(translate|scale|rotate)/.test(v) && identidade) {
        ruins.push(`@keyframes ${nome} → transform: ${v}`);
      }
    }
    expect(ruins, "Termine o keyframe em `transform: none`, nunca em translateY(0)/scale(1).").toEqual([]);
  });

  // ── 6. Vidro não recebe transform ─────────────────────────────────────────
  it("nenhuma regra nova põe transform direto no vidro", () => {
    // O valor é EXTRAÍDO e comparado, em vez de negado por lookahead: um
    // `(?!none)` depois de `\s*` volta atrás na regex, é testado contra o espaço
    // e passa — a primeira versão deste teste acusava `transform: none` de ser
    // um transform.
    const ruins = REGRAS.filter((r) => {
      if (!/\.glass\b/.test(r.sel)) return false;
      return [...r.corpo.matchAll(/(?:^|;)\s*transform\s*:\s*([^;]+)/g)]
        .some((m) => m[1].trim() !== "none");
    });
    expect(
      ruins.map((r) => `${r.sel} { ${r.corpo.slice(0, 70)} }`),
      "`transform` sobre `backdrop-filter` deixa rastro branco no Chrome — o fundo " +
      "não repinta limpo. Vidro responde por borda.",
    ).toEqual([]);
  });

  // ── 7. As peças que movem congelam quando abrigam um popover ──────────────
  it("mt-eleva, mt-inclina e mt-ima congelam com popover aberto", () => {
    const guardas = REGRAS.filter((r) => /:has\(/.test(r.sel) && /transform\s*:\s*none/.test(r.corpo));
    const alvo = guardas.map((g) => g.sel).join(" ");
    for (const peca of ["mt-eleva", "mt-inclina", "mt-ima"]) {
      expect(alvo, `.${peca} precisa de guarda :has() de popover`).toContain(`.${peca}:has(`);
    }
    // As três famílias de popover do sistema. `.t-dropdown` entra porque hoje
    // todo mundo o manda pro <body> por portal, mas o dia em que alguém não
    // mandar é o dia em que o menu abre atrás dos cards.
    for (const pop of ["gp-pop", "pop-solid", "t-dropdown"]) {
      expect(alvo, `a guarda precisa cobrir .${pop}`).toContain(pop);
    }
  });
});
