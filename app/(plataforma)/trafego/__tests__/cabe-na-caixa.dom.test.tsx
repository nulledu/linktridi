import { describe, expect, it, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ListaQueCabe } from "../TfKit";

/**
 * O card do painel tem tamanho fixo (P/M/G) e quem se ajusta é o conteúdo. O
 * <ListaQueCabe> é a metade "lista" desse ajuste: mostra as linhas que cabem e
 * resume o resto num "+N", em vez de aparar a última pela metade da altura.
 *
 * Os dois casos abaixo são os que já quebraram:
 *
 * 1. Caixa SEM altura definida (o celular, onde a coluna é única e quem manda
 *    de volta é o conteúdo). A primeira versão media, tirava linha, a caixa
 *    encolhia junto, a caixa menor pedia nova medição e devolvia as linhas —
 *    "Maximum update depth exceeded" na primeira largura de telefone, com a
 *    tela inteira caindo no ErrorBoundary.
 * 2. Caixa COM altura: o corte tem que sobrar espaço pro próprio "+N".
 */

/** jsdom não faz layout: sem isto toda medida vale 0. */
const medidasFalsas = (mapa: {
  clientHeight: (el: HTMLElement) => number;
  scrollHeight: (el: HTMLElement) => number;
  offsetHeight: (el: HTMLElement) => number;
}) => {
  // clientHeight/scrollHeight moram no Element.prototype e offsetHeight no
  // HTMLElement.prototype: definir tudo aqui SOMBREIA os de cima, e desfazer
  // é apagar a sombra (ou repor o descritor, quando já era daqui).
  const orig = Object.getOwnPropertyDescriptors(HTMLElement.prototype);
  for (const prop of ["clientHeight", "scrollHeight", "offsetHeight"] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(this: HTMLElement) { return mapa[prop](this); },
    });
  }
  return () => {
    for (const prop of ["clientHeight", "scrollHeight", "offsetHeight"] as const) {
      const d = orig[prop];
      if (d) Object.defineProperty(HTMLElement.prototype, prop, d);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop];
    }
  };
};

const ehCaixa = (el: HTMLElement) => el.className.includes("tf-w-corpo");
const linhas = (n: number) =>
  Array.from({ length: n }, (_, i) => <div key={i}>linha {i + 1}</div>);

describe("ListaQueCabe · o conteúdo se ajusta ao card", () => {
  afterEach(() => cleanup());

  it("caixa sem altura (celular): mostra tudo e NÃO entra em laço de render", () => {
    // Tudo 0, como o jsdom entrega de fábrica: é o caso em que a caixa cresce
    // com o conteúdo e portanto nunca transborda.
    const { container } = render(<ListaQueCabe>{linhas(6)}</ListaQueCabe>);
    // Se o laço voltasse, o render nem chegaria aqui: o React estoura antes.
    expect(container.textContent).toContain("linha 6");
    expect(container.textContent).not.toMatch(/\+\d+ linha/);
  });

  it("caixa com altura: corta o que não cabe e ainda sobra espaço pro +N", () => {
    // Caixa de 100px com linhas de 20px. Cabem 5 por altura pura, mas o resumo
    // ocupa ~16px, então a quinta sai e entra na conta do "+N".
    const restaurar = medidasFalsas({
      clientHeight: (el) => (ehCaixa(el) ? 100 : 20),
      scrollHeight: (el) => (ehCaixa(el) ? 400 : 20),   // transbordou
      offsetHeight: (el) => (ehCaixa(el) ? 100 : 20),
    });
    try {
      const { container } = render(<ListaQueCabe>{linhas(8)}</ListaQueCabe>);
      const texto = container.textContent ?? "";
      expect(texto).toContain("linha 1");
      expect(texto).toContain("linha 4");
      expect(texto).not.toContain("linha 5");           // a que sai pelo resumo
      expect(texto).toContain("+4 linhas");
    } finally {
      restaurar();
    }
  });
});
