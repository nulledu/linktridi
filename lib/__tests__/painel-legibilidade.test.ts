import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Trava de legibilidade do painel da Tridify.
 *
 * Duas regras que vieram de medir a tela renderizada, não de opinião:
 *
 * 1. **Escopo não declara `--text-dim` sem gate de tema.** Uma variável
 *    declarada num escopo sombreia a global na subárvore INTEIRA, nos dois
 *    temas. `.tf-scope` e `.g-scope` declaravam o cinza do tema ESCURO sem
 *    condição, então o tema claro nunca alcançava o card: medido no elemento
 *    real, o texto auxiliar rendia 2,20:1 sobre o card branco e 2,00:1 sobre a
 *    superfície 2, contra os 4,5:1 da WCAG AA. Eram 131 dos 285 textos do
 *    painel reprovando, todos da mesma cor.
 *
 *    O detalhe que fez isso passar despercebido por tanto tempo: o override do
 *    claro tinha sido removido DE PROPÓSITO, com a conta certa anotada ("a
 *    global rende 5,12:1 aqui"). A conta estava certa e a global não chegava.
 *
 * 2. **Nada abaixo de 11px.** É o piso da Human Interface Guidelines, e abaixo
 *    dele o rótulo deixa de ser lido e passa a ser adivinhado pela posição —
 *    que é o que acontecia com o crachá de 9,5px e com o nome da etapa do funil,
 *    cujo `clamp` descia até 8,5px.
 *
 * O que esta trava NÃO faz: medir contraste. Isso só o navegador sabe, porque
 * depende do fundo EFETIVO do elemento (o token pode ser translúcido e o fundo
 * real estar três níveis acima). A medição vive no /dev-tridify-visual; aqui
 * fica a causa mecânica, que é a que volta sozinha num arquivo sobre outro
 * assunto.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const ler = (p: string) => readFileSync(`${RAIZ}${p}`, "utf8");

/** O piso da HIG, em px. */
const PISO = 11;

describe("painel da Tridify · legibilidade", () => {
  it("nenhum escopo declara `--text-dim` sem gate de tema", () => {
    const css = ler("/app/globals.css");
    // Só olha as declarações DENTRO de um bloco de escopo (`.tf-scope {`,
    // `.g-scope {`) que não esteja gateado por tema.
    for (const escopo of ["tf-scope", "g-scope"]) {
      const abre = css.indexOf(`\n.${escopo} {`);
      expect(abre, `bloco .${escopo} sumiu`).toBeGreaterThan(-1);
      const bloco = css.slice(abre, css.indexOf("\n}", abre));
      expect(bloco, `.${escopo} declara --text-dim sem gate: ele sombreia a global no tema claro`)
        .not.toMatch(/^\s*--text-dim:/m);
      // E o valor do escuro tem que existir em algum lugar, gateado.
      expect(css, `.${escopo} perdeu o --text-dim do tema escuro`)
        .toContain(`html:not(.light) .${escopo} { --text-dim:`);
    }
  });

  it("tamanho de fonte no painel tem NOME — número cru não entra", () => {
    // A régua tem sete degraus nomeados (--tf-fs-micro..manchete) e o piso é o
    // micro, 11px. Um `fontSize: 13` avulso é como os dezessete tamanhos de
    // antes nasceram: meio pixel de cada vez, sem ninguém decidir. Quem
    // precisar de um degrau novo cria o TOKEN, com nome e papel — aí a decisão
    // fica escrita onde a próxima pessoa a encontra.
    for (const alvo of ["/app/(plataforma)/trafego/PainelPersonalizavel.tsx", "/app/(plataforma)/trafego/TfKit.tsx"]) {
      const src = ler(alvo);
      const crus = [...src.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)].map((m) => m[1]);
      expect(crus, `${alvo} com fontSize numérico fora da régua`).toEqual([]);
      // E toda referência é da régua — não um var() qualquer.
      for (const m of src.matchAll(/fontSize:\s*"([^"]+)"/g)) {
        expect(m[1], `${alvo}: ${m[1]}`).toMatch(/^var\(--tf-fs-[a-z]+\)$|^clamp\(/);
      }
    }
    // E a régua em si respeita o piso.
    const css = ler("/app/globals.css");
    for (const m of css.matchAll(/--tf-fs-[a-z]+:\s*(\d+(?:\.\d+)?)px/g)) {
      expect(parseFloat(m[1]), "degrau da régua abaixo do piso").toBeGreaterThanOrEqual(PISO);
    }
    // O funil segue no CSS (classes), com o piso conferido pelo teste do clamp.
    const funil = ler("/app/(plataforma)/ui/funil.tsx");
    for (const m of funil.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)) {
      expect(parseFloat(m[1]), "funil abaixo do piso").toBeGreaterThanOrEqual(PISO);
    }
  });

  it("o funil não encolhe o nome da etapa abaixo do piso", () => {
    const css = ler("/app/globals.css");
    const regra = css.match(/\.funil-nome \{[^}]*\}/);
    expect(regra).not.toBeNull();
    const clamp = regra![0].match(/clamp\((\d+(?:\.\d+)?)px/);
    expect(clamp, "o `clamp` do nome da etapa sumiu").not.toBeNull();
    // O clamp continua encolhendo com o bloco — é o que faz o funil caber em
    // card estreito. O que não pode é descer abaixo do piso; o caso extremo
    // quem resolve é o `text-overflow: ellipsis`, que já está na regra.
    expect(parseFloat(clamp![1])).toBeGreaterThanOrEqual(PISO);
    expect(regra![0]).toContain("text-overflow: ellipsis");
    // E TODO clamp de font-size da família do funil respeita o piso — a pílula
    // de taxa tinha `clamp(9px, …)` e escapou da primeira varredura, que só
    // olhava o nome da etapa: a 320px a taxa media 9,9px na tela.
    const bloco = css.slice(css.indexOf("/* ── Funil clássico"), css.indexOf("/* ── Funil deitado") > -1 ? css.length : undefined);
    for (const m of bloco.matchAll(/font-size:\s*clamp\((\d+(?:\.\d+)?)px/g)) {
      expect(parseFloat(m[1]), `clamp do funil com piso ${m[1]}px`).toBeGreaterThanOrEqual(PISO);
    }
  });

  it("entreletra é uma CURVA por tamanho, não um valor só", () => {
    // A regra de tipografia da Apple que o módulo furava: letra grande parece
    // solta e precisa apertar, letra pequena parece grudada e precisa abrir.
    // Medido na tela, o mesmo `-0.02em` valia de 11px a 29,5px — tracking de
    // display em texto de 11px, onde ele encosta os dígitos.
    const css = ler("/app/globals.css");
    for (const degrau of ["--tf-track-display", "--tf-track-titulo", "--tf-track-corpo", "--tf-track-micro"]) {
      expect(css, `degrau ${degrau} sumiu da rampa`).toContain(`${degrau}:`);
    }
    // O `.stat` aparece em toda linha de detalhe de 11–12px: ele NASCE no
    // corpo, e quem é display se declara.
    const stat = css.match(/\.tf-scope \.stat \{[^}]*\}/);
    expect(stat).not.toBeNull();
    expect(stat![0], ".stat voltou a fixar entreletra de manchete").not.toMatch(/letter-spacing:\s*-0?\.\d+em/);
    expect(stat![0]).toContain("var(--tf-track, var(--tf-track-corpo))");
    // E o texto miúdo do card abre, em vez de herdar o aperto.
    expect(css).toMatch(/\.tf-scope \.tf-w-lista[^{]*\{\s*--tf-track: var\(--tf-track-micro\)/);
    // A rampa tem que ser monotônica: quanto maior, mais apertado.
    // `em` opcional: o degrau do corpo é `0` cru, que é CSS válido e não casa
    // com um padrão que exige unidade.
    const valor = (tok: string) => parseFloat(css.match(new RegExp(`${tok}:\\s*(-?[\\d.]+)(?:em)?\\s*;`))![1]);
    const [micro, corpo, titulo, display] = ["--tf-track-micro", "--tf-track-corpo", "--tf-track-titulo", "--tf-track-display"].map(valor);
    expect(micro).toBeGreaterThan(corpo);
    expect(corpo).toBeGreaterThan(titulo);
    expect(titulo).toBeGreaterThan(display);
  });

  it("nenhum px cru abaixo do piso nas folhas de estilo do módulo", () => {
    const dir = join(RAIZ, "app/(plataforma)/trafego");
    const achados: string[] = [];
    for (const nome of readdirSync(dir)) {
      if (!nome.endsWith(".css")) continue;
      if (!statSync(join(dir, nome)).isFile()) continue;
      const src = readFileSync(join(dir, nome), "utf8");
      for (const m of src.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
        if (parseFloat(m[1]) < PISO) achados.push(`${nome}: ${m[1]}px`);
      }
    }
    expect(achados, `abaixo do piso de ${PISO}px`).toEqual([]);
  });
});
