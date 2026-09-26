import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACCENT_PADRAO, TEMAS, paletaDeGrafico } from "../aparencia";
import { PRELOAD_JS } from "../preload";

// ── A cor do gráfico é a cor DA PESSOA ───────────────────────────────────────
// Antes, trocar o destaque do sistema repintava botão, sidebar, marca e link —
// e deixava o gráfico exatamente como estava, porque cada tela escolhia a sua
// paleta no próprio arquivo (a Tridify com seis cores, o painel de TV com
// outras oito). A rampa `--graf-1..6` deriva do destaque escolhido, então o
// gráfico passa a acompanhar.
//
// O que este teste protege é o que dá errado quando alguém mexe na derivação:
// uma rampa que reprova contraste em algum tema (o número existe mas não se lê),
// duas séries que caem na mesma cor (indistinguíveis, com a legenda afirmando
// que são coisas diferentes) e uma rampa que só separa por matiz — inútil em
// preto e branco e pra quem não distingue verde de vermelho.

const LUM_BG_CLARO = 0.8026;   // --seg-track  #e7e7ed — a pior superfície do claro
const LUM_BG_ESCURO = 0.0290;  // --seg-pill   #2e2f38 — a pior superfície do escuro
const AA = 4.5;

function luminancia(hex: string): number {
  const h = hex.replace("#", "");
  const canal = (i: number) => {
    const x = parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
}
const razao = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const contraste = (hex: string, fundo: "claro" | "escuro") =>
  razao(luminancia(hex), fundo === "claro" ? LUM_BG_CLARO : LUM_BG_ESCURO);

/** Distância de matiz em graus, pelo caminho mais curto do círculo. */
function distanciaMatiz(a: string, b: string): number {
  const matiz = (hex: string) => {
    const h = hex.replace("#", "");
    const [r, g, bl] = [0, 1, 2].map((i) => parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255);
    const max = Math.max(r, g, bl), min = Math.min(r, g, bl), d = max - min;
    if (d === 0) return 0;
    const m = max === r ? ((g - bl) / d + (g < bl ? 6 : 0)) : max === g ? (bl - r) / d + 2 : (r - g) / d + 4;
    return m * 60;
  };
  const d = Math.abs(matiz(a) - matiz(b)) % 360;
  return d > 180 ? 360 - d : d;
}

const FUNDOS = ["claro", "escuro"] as const;
// A coleção inteira, mais um cinza quase sem cor. O Grafite (#6E7A8F) é o caso
// que quebra uma derivação ingênua: girar o matiz de um cinza dá seis cinzas
// iguais, então a rampa tem piso de saturação. Se esse piso sumir, é aqui que
// aparece.
const CORES = [...TEMAS.map((t) => [t.nome, t.cor] as const), ["cinza extremo", "#808080"] as const];

describe("rampa de cor do gráfico", () => {
  it.each(CORES)("%s: as seis séries se leem nos dois temas", (_nome, cor) => {
    for (const fundo of FUNDOS) {
      const rampa = paletaDeGrafico(cor, fundo);
      expect(rampa).toHaveLength(6);
      for (const [i, c] of rampa.entries()) {
        expect(c, `série ${i + 1} no tema ${fundo}`).toMatch(/^#[0-9a-f]{6}$/);
        expect(
          contraste(c, fundo),
          `série ${i + 1} (${c}) no tema ${fundo} rende ${contraste(c, fundo).toFixed(2)}:1 — ` +
          "o traço existe mas não se lê contra a pior superfície do tema",
        ).toBeGreaterThanOrEqual(AA - 0.01);
      }
    }
  });

  it.each(CORES)("%s: nenhuma série repete a cor de outra", (_nome, cor) => {
    for (const fundo of FUNDOS) {
      const rampa = paletaDeGrafico(cor, fundo);
      expect(
        new Set(rampa).size,
        `no tema ${fundo} a rampa tem cor repetida: ${rampa.join(" ")} — duas séries ` +
        "idênticas com a legenda dizendo que são coisas diferentes",
      ).toBe(6);
    }
  });

  it.each(CORES)("%s: a rampa não separa só por matiz", (_nome, cor) => {
    // Cor sozinha não basta: quem não distingue verde de vermelho, e qualquer
    // impressão em preto e branco, leem só a CLARIDADE. Séries vizinhas precisam
    // diferir também nela, senão a distinção some junto com a cor.
    for (const fundo of FUNDOS) {
      const rampa = paletaDeGrafico(cor, fundo);
      const lums = rampa.map(luminancia);
      const vizinhosIguais = lums
        .slice(1)
        .map((l, i) => ({ i, delta: Math.abs(l - lums[i]) }))
        .filter((x) => x.delta < 0.012);
      expect(
        vizinhosIguais.map((x) => `séries ${x.i + 1}/${x.i + 2} (Δlum ${x.delta.toFixed(4)})`),
        `no tema ${fundo} há séries vizinhas com a mesma claridade — em preto e branco viram uma`,
      ).toEqual([]);
    }
  });

  it("a primeira série É a cor escolhida quando ela já passa em contraste", () => {
    // O violeta da casa passa folgado nos dois temas, então tem de sair
    // intocado: a identidade é a que a pessoa escolheu, e "personalizar" não
    // pode significar "quase a sua cor".
    for (const fundo of FUNDOS) {
      const [primeira] = paletaDeGrafico(ACCENT_PADRAO, fundo);
      if (contraste(ACCENT_PADRAO, fundo) >= AA) {
        expect(primeira.toLowerCase()).toBe(ACCENT_PADRAO.toLowerCase());
      }
    }
  });

  it("um cinza sem matiz ainda produz séries distinguíveis", () => {
    // Sem o piso de saturação, girar o matiz de #6E7A8F devolve seis cinzas
    // praticamente iguais — a rampa "funciona" e o gráfico fica ilegível.
    const rampa = paletaDeGrafico("#6E7A8F", "escuro");
    const distancias = rampa.slice(1).map((c) => distanciaMatiz(rampa[1], c)).slice(1);
    expect(Math.max(...distancias), `matizes colados: ${rampa.join(" ")}`).toBeGreaterThan(20);
  });

  it("cor inválida cai no padrão em vez de virar lixo", () => {
    const rampa = paletaDeGrafico("banana", "escuro");
    expect(rampa).toHaveLength(6);
    for (const c of rampa) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("a rampa chega no CSS e antes do paint", () => {
  const raiz = join(__dirname, "..", "..");
  const css = readFileSync(join(raiz, "app", "globals.css"), "utf8");
  // O pre-paint vai inline no <head> (lib/preload.ts); é esta string que roda.
  const preload = PRELOAD_JS;
  const aparencia = readFileSync(join(raiz, "lib", "aparencia.ts"), "utf8");

  it("o CSS tem padrão pras seis séries nos dois temas", () => {
    // Sem padrão no CSS, tudo que renderiza antes do JS (SSR, /dev-*, print)
    // desenha o gráfico sem cor nenhuma.
    for (let i = 1; i <= 6; i++) {
      expect(css, `--graf-${i}-escuro`).toContain(`--graf-${i}-escuro`);
      expect(css, `--graf-${i}-claro`).toContain(`--graf-${i}-claro`);
    }
    expect(css).toMatch(/html\.light\s*\{[^}]*--graf-1:\s*var\(--graf-1-claro\)/);
  });

  it("a série principal do gráfico aponta pra rampa, não pra tinta do texto", () => {
    expect(css).toMatch(/--mono-tinta:\s*var\(--graf-1\)/);
  });

  it("trocar o destaque reescreve a rampa", () => {
    // `aplicarAccent` é a única porta de troca de cor em runtime. Se a rampa não
    // for escrita ali, o gráfico continua na cor antiga até dar refresh.
    const bloco = /export function aplicarAccent[\s\S]*?\n\}/.exec(aparencia)?.[0] || "";
    expect(bloco).toContain("paletaDeGrafico");
    expect(bloco).toMatch(/--graf-\$\{i \+ 1\}-claro/);
    expect(bloco).toMatch(/--graf-\$\{i \+ 1\}-escuro/);
  });

  it("o preload escreve a rampa antes do primeiro paint", () => {
    // Um gráfico que nasce no padrão e vira a cor da pessoa quando o JS chega
    // pisca INTEIRO — não é um rótulo corrigindo, é a tela toda.
    expect(preload).toContain("--graf-");
    expect(preload).toMatch(/giros\s*=\s*\[0,\s*38,\s*-34,\s*76,\s*-68,\s*150\]/);
  });

  it("as constantes do preload batem com as de aparencia.ts", () => {
    // Duas cópias da mesma conta (o preload roda antes de qualquer módulo). Se
    // divergirem, a cor muda sozinha no primeiro quadro depois do paint — o
    // mesmo piscar que este arquivo existe pra evitar, e o motivo pelo qual
    // LUM_BG_CLARO/ESCURO já são checados no aparencia-tinta.
    const nums = (s: string, re: RegExp) => (re.exec(s)?.[1] || "").replace(/\s/g, "");
    const giros = nums(aparencia, /const GIROS = \[([^\]]+)\]/);
    expect(giros, "GIROS não encontrado em aparencia.ts").not.toBe("");
    expect(nums(preload, /giros\s*=\s*\[([^\]]+)\]/)).toBe(giros);

    // ESPREMER decide quanto a rampa avança até o extremo do tema. Divergir aqui
    // muda a claridade de cinco das seis séries.
    const espremer = (s: string, re: RegExp) => (re.exec(s)?.[1] || "").replace(/\s/g, "");
    const aEsp = espremer(aparencia, /ESPREMER = \{([^}]+)\}/);
    const pEsp = espremer(preload, /espremer\s*=\s*\{([^}]+)\}/);
    expect(aEsp, "ESPREMER não encontrado em aparencia.ts").not.toBe("");
    expect(pEsp.replace(/"/g, "")).toBe(aEsp.replace(/asconst|"/g, ""));
  });

  it("o preload e o módulo produzem a MESMA rampa", () => {
    // A prova de verdade da duplicação: não basta as constantes baterem, o
    // algoritmo tem de bater. Aqui o bloco do preload roda de fato — num
    // documento de mentira — e o resultado é comparado com `paletaDeGrafico`.
    for (const [nome, cor] of CORES) {
      const escrito: Record<string, string> = {};
      const doc = {
        documentElement: {
          style: { setProperty: (k: string, v: string) => { escrito[k] = v; } },
          classList: { add() {}, contains: () => false },
        },
        querySelector: () => null,
      };
      const store: Record<string, string> = { accent: cor, theme: "dark" };
      const fake = {
        document: doc,
        localStorage: {
          getItem: (k: string) => store[k] ?? null,
          setItem: () => {}, removeItem: () => {},
        },
        matchMedia: () => ({ matches: false }),
        console: { log() {} },
      };
      // eslint-disable-next-line no-new-func
      new Function("window", "document", "localStorage", "console", preload)(
        fake, doc, fake.localStorage, fake.console,
      );

      for (const fundo of FUNDOS) {
        const esperado = paletaDeGrafico(cor, fundo);
        const obtido = Array.from({ length: 6 }, (_, i) => escrito[`--graf-${i + 1}-${fundo}`]);
        expect(
          obtido.map((c) => (c || "").toLowerCase()),
          `${nome} no tema ${fundo}: o preload e o módulo divergiram — a cor mudaria ` +
          "sozinha no primeiro quadro depois do paint",
        ).toEqual(esperado.map((c) => c.toLowerCase()));
      }
    }
  });
});
