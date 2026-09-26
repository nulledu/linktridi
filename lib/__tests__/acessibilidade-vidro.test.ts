import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Reduzir transparência e aumentar contraste chegam ao ARQUIVO COMPILADO.
 *
 * O módulo é feito de vidro: 21 superfícies com `backdrop-filter`. Texto
 * pequeno sobre vidro, com um fundo movimentado atrás, é o pior caso de
 * legibilidade que existe — e o popover (`.gp-pop`), onde moram o seletor com
 * busca e o calendário, não tinha alternativa nenhuma.
 *
 * ESTE TESTE LÊ O BUILD, NÃO O FONTE. É a única forma de pegar o defeito:
 * três tentativas de desligar o desfoque passaram no fonte e morreram no
 * otimizador, cada uma de um jeito diferente —
 *
 *   · `backdrop-filter: none` some (Lightning trata como valor inicial);
 *   · `blur(0)` só no lado sem prefixo é descartado, sobra a linha `-webkit-`,
 *     e aí o Safari desliga o desfoque e o Chrome não;
 *   · igualando os dois lados, o valor é reescrito como `blur()`, inválido.
 *
 * A saída não foi vencer o otimizador: é tornar o FUNDO OPACO, e o desfoque
 * fica invisível sozinho — não há o que atravessar.
 */

/** O maior CSS do build, que é o do app. */
function cssDoBuild(): string | null {
  const raiz = join(process.cwd(), ".next");
  const achados: { caminho: string; tamanho: number }[] = [];
  const varrer = (dir: string) => {
    let itens: string[];
    try { itens = readdirSync(dir); } catch { return; }
    for (const nome of itens) {
      const caminho = join(dir, nome);
      let st;
      try { st = statSync(caminho); } catch { continue; }
      if (st.isDirectory()) varrer(caminho);
      else if (nome.endsWith(".css")) achados.push({ caminho, tamanho: st.size });
    }
  };
  varrer(raiz);
  if (!achados.length) return null;
  achados.sort((a, b) => b.tamanho - a.tamanho);
  return readFileSync(achados[0].caminho, "utf8");
}

/** O conteúdo de um `@media (...)` no CSS compilado, respeitando aninhamento. */
function blocoDaMedia(css: string, consulta: string, contendo: string): string | null {
  const re = new RegExp(`@media\\s*\\(${consulta}\\)\\s*\\{`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    let prof = 1, j = m.index + m[0].length;
    const inicio = j;
    while (prof && j < css.length) {
      if (css[j] === "{") prof += 1;
      else if (css[j] === "}") prof -= 1;
      j += 1;
    }
    // Sem espaço: o build tem cópias minificadas e não minificadas, e o teste
    // não pode depender de qual delas foi encontrada.
    const bloco = css.slice(inicio, j - 1).replace(/\s+/g, "");
    if (bloco.includes(contendo)) return bloco;
  }
  return null;
}

const css = cssDoBuild();
const temBuild = css !== null;

describe.skipIf(!temBuild)("Reduzir transparência — no build", () => {
  const bloco = () => blocoDaMedia(css!, "prefers-reduced-transparency:\\s*reduce", "gp-pop");

  it("o popover ganha fundo opaco", () => {
    // Opaco é o que resolve: com fundo sólido, não há o que o desfoque
    // atravesse. Desligar o filtro é que não sobrevive ao otimizador.
    expect(bloco(), "o bloco sumiu do build").toBeTruthy();
    expect(bloco()).toContain("--surface");
  });

  it("no tema claro também", () => {
    expect(bloco()).toContain("#fff");
  });

  it("o véu escurece — sem desfoque, é o contraste que separa", () => {
    expect(bloco()).toMatch(/\.82|0\.82/);
  });

  it("NÃO tenta desligar o filtro — a tentativa é que morre no build", () => {
    // Se alguém reintroduzir, o build vai reescrever ou remover em silêncio.
    expect(bloco()).not.toContain("backdrop-filter:none");
    expect(bloco()).not.toContain("blur()");
  });
});

describe.skipIf(!temBuild)("Mais contraste — no build", () => {
  const bloco = () => blocoDaMedia(css!, "prefers-contrast:\\s*more", "gp-pop");

  it("a folha ganha borda definida", () => {
    // Borda de 18% de branco desaparece para quem pediu contraste, e sem ela
    // a folha perde o limite visível.
    expect(bloco(), "o bloco sumiu do build").toBeTruthy();
    expect(bloco()).toContain("border-color:var(--text)");
  });

  it("o texto secundário para de sumir", () => {
    expect(bloco()).toContain("--text-dim:var(--text)");
  });
});

describe("O fonte declara os três sinais", () => {
  const fonte = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

  it.each([
    ["prefers-reduced-motion", 10],
    ["prefers-reduced-transparency", 4],
    ["prefers-contrast", 2],
  ])("%s aparece pelo menos %i vezes", (sinal, minimo) => {
    expect((fonte.match(new RegExp(sinal, "g")) ?? []).length).toBeGreaterThanOrEqual(minimo);
  });
});
