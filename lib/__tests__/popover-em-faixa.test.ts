import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Popover dentro de fileira que "afunda" ao toque ──────────────────────────
// O calendário do PeriodPicker (`.gp-pop`) mora DENTRO do invólucro do botão
// "Datas", e esse invólucro é um `.filtro-faixa > *` — alvo da resposta de
// pressão. Duas propriedades da fileira matavam o popover:
//
//   1. `transform: scale(.97)` no `:active`. Transform ≠ `none` cria CONTEXTO DE
//      EMPILHAMENTO: o `z-index: 60` do calendário passa a valer só dentro do
//      invólucro de 82×30 e a folha inteira vai PARA TRÁS dos cards. Medido na
//      Tridify: mousedown no BUTTON "15", mouseup no `.tf-panel` do ROAS, click
//      num ancestral comum — o `onClick` do dia nunca rodava. `--pressao: 1`
//      não salva: `scale(1)` também cria o contexto. Só `none`.
//   2. `mask-image` na fileira (o esmaecido do "tem mais pra ver"). Máscara faz
//      da fileira o BLOCO DE CONTENÇÃO do `position: fixed` — no celular a folha
//      nascia ancorada e recortada na fileira de 44px em vez de presa embaixo
//      da tela.
//
// Documentar não segurou a primeira vez (o CLAUDE.md já avisava do transform
// residual). Aqui a guarda é verificada.
const raiz = join(__dirname, "..", "..");
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");
const css = ler("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

// Parse rasteiro: pares (seletor, corpo). Regra dentro de @media traz o
// cabeçalho colado no seletor — daí o corte no último `{` restante.
const REGRAS = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  sel: m[1].split("{").pop()!.replace(/\s+/g, " ").trim(),
  corpo: m[2].replace(/\s+/g, " ").trim(),
}));

const POPOVER = ".gp-pop";

// Fileira + o componente que põe um popover DENTRO dela. Entrada nova aqui
// sempre que um dropdown/calendário passar a morar numa fileira que afunda:
// `.ct-filtros`, `.tab-strip`, `.ws-nav` e `.ct-sidebar` recebem a mesma
// pressão nos filhos e teriam exatamente o mesmo defeito.
const HOSPEDEIRAS: { faixa: string; componente: string }[] = [
  { faixa: ".filtro-faixa", componente: "app/(plataforma)/PeriodPicker.tsx" },
];

describe("popover dentro de fileira de filtro", () => {
  for (const { faixa, componente } of HOSPEDEIRAS) {
    it(`${componente} tira o painel do fluxo da ${faixa}`, () => {
      // A defesa principal é ESTRUTURAL, não de cascata: o painel vai pro <body>
      // por portal, então nenhum ancestral da fileira o alcança. Guardar
      // propriedade por propriedade de ancestral é jogo perdido — a coluna de
      // conteúdo tem `overflow: hidden`, cartão tem `backdrop-filter`, e
      // qualquer `transform` novo em qualquer ancestral reabre o buraco.
      // As guardas de CSS abaixo continuam como segunda linha, pra quem ainda
      // pendurar popover dentro de uma fileira.
      const src = ler(componente);
      expect(src).toContain("createPortal");
      expect(src).toContain("document.body");
    });

    it(`${faixa} não afunda quando abriga um popover aberto`, () => {
      const pressiona = REGRAS.some(
        (r) => r.sel.includes(`${faixa} > *:active`) && /transform:\s*scale\(/.test(r.corpo),
      );
      if (!pressiona) return;   // ninguém aplica transform nos filhos → nada a guardar
      const guarda = REGRAS.some(
        (r) => r.sel.includes(`${faixa} > *:has(${POPOVER}):active`) && /transform:\s*none/.test(r.corpo),
      );
      expect(
        guarda,
        `falta \`${faixa} > *:has(${POPOVER}):active { transform: none }\` — o transform de pressão cria contexto de empilhamento, a folha vai pra trás do conteúdo e o clique nunca chega`,
      ).toBe(true);
    });

    it(`${faixa} solta a máscara enquanto o popover está aberto`, () => {
      const mascara = REGRAS.some(
        (r) => r.sel.includes(faixa) && !r.sel.includes(":has") && /mask-image:\s*(?!none)\S/.test(r.corpo),
      );
      if (!mascara) return;     // sem esmaecido → não vira bloco de contenção
      const guarda = REGRAS.some(
        (r) => r.sel.includes(`${faixa}:has(${POPOVER})`) && /mask-image:\s*none/.test(r.corpo),
      );
      expect(
        guarda,
        `falta \`${faixa}:has(${POPOVER}) { mask-image: none }\` — a máscara vira bloco de contenção do \`position: fixed\` e a folha do celular nasce recortada dentro da fileira`,
      ).toBe(true);
    });
  }
});

// ── A dica do gráfico é o mesmo problema, por outro caminho ──────────────────
// O recharts desenha a dica DENTRO do `.recharts-wrapper`, e todo gráfico do
// app mora num `.mc-palco` (`overflow: hidden`, pra arredondar o palco) dentro
// de um `.mc-card` (`overflow: hidden` + `container-type: inline-size`). No
// cartão de vendedora o palco tem 44px de altura: a dica nascia recortada ali
// dentro e parecia "ficar por baixo do card".
//
// Nem `position: fixed` escapa por dentro — `container-type` implica contenção
// de LAYOUT, e isso faz do `.mc-card` bloco de contenção até de elemento fixo.
// Por isso a dica vai pro `<body>` por portal (`useDicaNoBody`), exatamente
// como manda a regra do popover em fileira.
describe("dica de gráfico não mora dentro do cartão", () => {
  const GRAFICOS = [
    "MonoRoundedKpiCardChart", "MonoRoundedAreaChart",
    "MonoRoundedLineChart", "MonoRoundedBarChart", "MonoRoundedDonutChart",
  ];

  for (const nome of GRAFICOS) {
    it(`${nome} manda a dica pro <body>`, () => {
      const src = ler(`app/(plataforma)/ui/monocharts/${nome}.tsx`);
      expect(src, `${nome} não usa useDicaNoBody`).toContain("useDicaNoBody");
      // `portal={host}` é o que tira a dica de dentro do `overflow: hidden`.
      expect(src, `${nome} tem <Tooltip> sem portal`).toContain("<Tooltip portal={host}");
      expect(src.includes("<Tooltip content=") || src.includes("<Tooltip\n"), 
        `${nome} tem um <Tooltip> que ficou sem portal`).toBe(false);
    });
  }

  it("o alvo do portal não é recortado nem por z-index nem por overflow", () => {
    const host = REGRAS.find((r) => r.sel === ".mc-tooltip-host");
    expect(host, ".mc-tooltip-host sumiu do globals.css").toBeTruthy();
    expect(host!.corpo).toContain("position: fixed");
    expect(host!.corpo).toContain("overflow: visible");
    expect(host!.corpo, "sem z-index a dica nasce atrás do modal").toContain("z-index");
  });
});
