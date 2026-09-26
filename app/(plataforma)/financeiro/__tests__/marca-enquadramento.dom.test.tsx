import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Marca } from "../ui";

// ── O logo EM PÉ não pode ser cortado ────────────────────────────────────────
//
// A `Marca` é um quadrado (52×52 na ficha, 32 na lista) e quase nenhum logo é
// quadrado. A saída escolhida é a dos tocadores de vídeo: a imagem inteira
// (`contain`) sobre uma cópia dela mesma borrada, para nunca sobrar barra
// branca nem cortar o nome da empresa.
//
// O `contain` estava sendo desfeito por um detalhe de layout. O invólucro é
// `display: grid` com `place-items: center`, e `center` significa que o item
// NÃO é esticado: o `height: 100%` de um item não esticado volta a resolver
// contra a altura intrínseca da imagem. Medido no navegador, num quadrado de
// 52 com `overflow: hidden`:
//
//     96×96  (quadrado) → img 52×52   ok
//     240×60 (deitado)  → img 52×52   ok
//     64×160 (em pé)    → img 52×124  ← 72px cortados, topo e base
//
// Só o logo em pé quebrava, e é por isso que o defeito sobreviveu tanto: quem
// testa com um logo quadrado nunca o vê.
//
// A correção é posicionar a imagem. Com `position: absolute` o bloco de
// contenção passa a ser o padding-box do `span` (que é `relative`), então
// `height: 100%` é 52px sem ambiguidade e o `contain` volta a caber a imagem
// inteira.
//
// jsdom não tem layout — `offsetHeight` e `getBoundingClientRect()` são sempre
// zero aqui (ver a memória "testes de componente"). Então o que esta trava
// verifica é o MECANISMO, que é o que alguém desfaria sem perceber. A medida
// de verdade está em `/dev-financeiro`.

const foreground = (c: HTMLElement) =>
  [...c.querySelectorAll("img")].find((i) => i.style.objectFit === "contain");

describe("Marca — o enquadramento do logo", () => {
  it("a imagem da frente é POSICIONADA, senão o logo em pé estoura o quadrado", () => {
    const { container } = render(<Marca marca={{ nome: "Tridi", logo: "/x.png" }} tamanho={52} />);
    const img = foreground(container);
    expect(img, "sumiu a imagem da frente").toBeTruthy();
    // `relative` é o valor que causava o corte: volta a depender do fluxo.
    expect(img!.style.position).toBe("absolute");
    expect(img!.style.height).toBe("100%");
    expect(img!.style.width).toBe("100%");
  });

  it("o invólucro continua sendo o bloco de contenção, e continua recortando", () => {
    // Sem `relative` no pai, a imagem absoluta subiria para o primeiro
    // ancestral posicionado — que pode ser a linha da tabela inteira.
    const { container } = render(<Marca marca={{ nome: "Tridi", logo: "/x.png" }} tamanho={52} />);
    const span = container.querySelector("span");
    expect(span!.style.position).toBe("relative");
    expect(span!.style.overflow).toBe("hidden");
  });

  it("o fundo borrado continua existindo — é ele que substitui a barra branca", () => {
    const { container } = render(<Marca marca={{ nome: "Tridi", logo: "/x.png" }} tamanho={52} />);
    const fundo = [...container.querySelectorAll("img")].find((i) => i.style.filter.includes("blur"));
    expect(fundo, "sem o fundo, `contain` volta a deixar barra").toBeTruthy();
    expect(fundo!.style.objectFit).toBe("cover");
  });

  it("sem logo, nada de <img> — ícone ou inicial, nunca imagem quebrada", () => {
    const { container: comIcone } = render(<Marca marca={{ nome: "Tridi", icone: "wallet" }} tamanho={52} />);
    expect(comIcone.querySelectorAll("img")).toHaveLength(0);
    expect(comIcone.querySelector("svg")).toBeTruthy();

    const { container: soNome } = render(<Marca marca={{ nome: "Gedux" }} tamanho={52} />);
    expect(soNome.querySelectorAll("img")).toHaveLength(0);
    expect(soNome.textContent).toContain("G");
  });

  it("o quadrado respeita o tamanho pedido nos dois lados", () => {
    const { container } = render(<Marca marca={{ nome: "Tridi", logo: "/x.png" }} tamanho={32} />);
    const span = container.querySelector("span")!;
    expect(span.style.width).toBe("32px");
    expect(span.style.height).toBe("32px");
  });
});
