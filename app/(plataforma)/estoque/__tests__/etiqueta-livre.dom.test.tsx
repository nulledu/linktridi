// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { EtiquetaLivre } from "../EtiquetaLivre";
import { TRABALHO_PADRAO, TAMANHOS_MM, type TrabalhoLivre } from "@/lib/estoque-impressao-livre";

/**
 * O que a etiqueta escrita à mão põe no papel.
 *
 * jsdom não tem layout (offsetHeight é sempre 0), então nada aqui mede
 * milímetro — quem faz isso é `impressao-livre.test.ts`, na aritmética pura.
 * O que se confere aqui é o que só existe no DOM: quais elementos saem, com
 * que estilo em `mm`, e as duas coisas que a tela erraria em silêncio (papel
 * herdando o tema escuro, e o `px` no lugar do `mm`).
 */

/** As linhas de texto: os divs com corpo de letra próprio, em `mm`. */
function comCorpoDeLetra(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("div")].filter((d) => d.style.fontSize.endsWith("mm"));
}

function etiqueta(over: Partial<TrabalhoLivre> = {}): TrabalhoLivre {
  return {
    ...TRABALHO_PADRAO,
    linhas: [{ texto: "PRATELEIRA A3", tamanho: "grande", negrito: true }],
    codigo: "GAL-A-C3",
    ...over,
  };
}

describe("a etiqueta escrita à mão", () => {
  it("escreve as linhas e desenha as barras", () => {
    const { container } = render(<EtiquetaLivre trabalho={etiqueta()} />);
    expect(container.textContent).toContain("PRATELEIRA A3");
    expect(container.querySelector("svg")).toBeTruthy();
    // O código escrito embaixo das barras — a rede pra quando a barra borra.
    expect(container.textContent).toContain("GAL-A-C3");
  });

  it("o papel é PRETO SOBRE BRANCO, nunca a paleta do app", () => {
    const { container } = render(<EtiquetaLivre trabalho={etiqueta()} />);
    const raiz = container.firstElementChild as HTMLElement;
    // Com o app no escuro, herdar `var(--text)` imprimiria branco sobre branco:
    // a etiqueta sairia em branco, e ninguém descobre isso na tela.
    // (jsdom normaliza `#fff` pra `rgb(...)` — o que importa é não ser `var(--…)`.)
    expect(raiz.style.background).toBe("rgb(255, 255, 255)");
    expect(raiz.style.color).toBe("rgb(0, 0, 0)");
  });

  it("toda medida vive em mm — um px imprime do tamanho que o navegador quiser", () => {
    const { container } = render(<EtiquetaLivre trabalho={etiqueta({ alturaMm: 40 })} />);
    const raiz = container.firstElementChild as HTMLElement;
    expect(raiz.style.width).toMatch(/mm$/);
    expect(raiz.style.height).toBe("40mm");

    // As LINHAS são os divs que têm corpo de letra próprio — o invólucro do
    // bloco de texto não tem, e pegá-lo por `div div` mediria a caixa errada.
    const linhas = comCorpoDeLetra(container);
    expect(linhas.length).toBeGreaterThan(0);
    linhas.forEach((l) => expect(l.style.fontSize).toMatch(/mm$/));
  });

  it("o tamanho escolhido é o tamanho impresso", () => {
    const { container } = render(<EtiquetaLivre trabalho={etiqueta({
      linhas: [{ texto: "grande", tamanho: "grande" }, { texto: "miúda", tamanho: "pequena" }],
    })} />);
    const linhas = comCorpoDeLetra(container);
    expect(linhas.find((d) => d.textContent === "grande")!.style.fontSize).toBe(`${TAMANHOS_MM.grande}mm`);
    expect(linhas.find((d) => d.textContent === "miúda")!.style.fontSize).toBe(`${TAMANHOS_MM.pequena}mm`);
  });

  it("uma linha é UMA linha: corta com reticências em vez de quebrar", () => {
    // Quebrar sozinha empurraria o código de barras pra fora da tira, e a
    // prévia deixaria de mostrar o que vai sair.
    const { container } = render(<EtiquetaLivre trabalho={etiqueta({
      linhas: [{ texto: "um nome absurdamente comprido que não cabe de jeito nenhum", tamanho: "grande" }],
    })} />);
    const linha = comCorpoDeLetra(container).find((d) => d.textContent?.startsWith("um nome"))!;
    expect(linha.style.whiteSpace).toBe("nowrap");
    expect(linha.style.textOverflow).toBe("ellipsis");
  });

  it("sem código de barras não sobra svg nem código escrito", () => {
    const { container } = render(<EtiquetaLivre trabalho={etiqueta({ codigo: null })} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).not.toContain("GAL-A-C3");
  });

  it("desligar o código escrito tira o texto e mantém as barras", () => {
    const { container } = render(<EtiquetaLivre trabalho={etiqueta({ mostrarCodigo: false })} />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.textContent).not.toContain("GAL-A-C3");
  });

  it("código que o Code128 não desenha vira TARJA VISÍVEL, não um buraco", () => {
    // Um espaço em branco onde deveria haver barras lê como "ainda vai
    // carregar". A prévia tem de ser honesta enquanto a pessoa digita — quem
    // recusa de vez é a rota, antes de virar papel.
    const { container } = render(<EtiquetaLivre trabalho={etiqueta({ codigo: "SEÇÃO-A" })} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).toContain("este código não vira barras");
  });

  it("as barras PREENCHEM a caixa — svg que se dimensiona sozinho sai cortado", () => {
    const { container } = render(<EtiquetaLivre trabalho={etiqueta()} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("preserveAspectRatio")).toBe("none");
    expect(svg.getAttribute("width")).toBe("100%");
    expect(svg.getAttribute("height")).toBe("100%");
  });
});
