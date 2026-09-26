import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { GlobalLightbox } from "../GlobalLightbox";

// ── O zoom morria dentro de todo painel lateral, em silêncio ────────────────
//
// O `GlobalLightbox` ignora imagem dentro de `<aside>` — a regra nasceu pra
// proteger a NAVEGAÇÃO (o menu da esquerda). Só que `PainelLateral`
// (ui/controles.tsx) também é um `<aside class="ui-side">`, e painel é
// CONTEÚDO: a foto do trabalho na conferência do Estoque, o anexo de uma
// solicitação, a imagem de um recebimento.
//
// A falha era invisível: nada quebra, nada aparece no console — clicar na foto
// simplesmente não faz nada, e quem clica conclui que a imagem não abre mesmo.
// Este teste é o que impede a regra de voltar a engolir o painel.
//
// jsdom não tem motor de layout (rect e `naturalWidth` são sempre 0) e as duas
// guardas de TAMANHO do lightbox dependem disso — então elas são plantadas à
// mão aqui. O que está sendo provado é a regra de ANCESTRAL, não a geometria.
function imagemGrande(el: HTMLImageElement) {
  Object.defineProperty(el, "naturalWidth", { value: 1200, configurable: true });
  Object.defineProperty(el, "naturalHeight", { value: 900, configurable: true });
  el.getBoundingClientRect = () => ({
    width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}),
  }) as DOMRect;
}

function abrir(img: HTMLImageElement | null): boolean {
  if (!img) throw new Error("imagem não encontrada");
  imagemGrande(img);
  fireEvent.click(img);
  return !!document.querySelector("[data-lightbox-root]");
}

afterEach(() => cleanup());

describe("GlobalLightbox · onde a foto abre e onde não", () => {
  it("a foto dentro de um painel lateral ABRE em tela cheia", () => {
    const { container } = render(
      <>
        <aside className="ui-side">
          <figure><img src="https://exemplo/trabalho.jpg" alt="" /></figure>
        </aside>
        <GlobalLightbox />
      </>,
    );
    expect(abrir(container.querySelector("img"))).toBe(true);
  });

  // A regra original continua valendo pro que ela sempre quis proteger.
  it("a imagem da navegação continua ignorada", () => {
    const { container } = render(
      <>
        <aside className="ws-rail"><img src="https://exemplo/logo.png" alt="" /></aside>
        <GlobalLightbox />
      </>,
    );
    expect(abrir(container.querySelector("img"))).toBe(false);
  });

  it("imagem que já é ação (dentro de botão ou link) continua ignorada", () => {
    const { container } = render(
      <>
        <aside className="ui-side">
          <button type="button"><img src="https://exemplo/a.jpg" alt="" /></button>
          {/* `#` e não `/x`: o jsdom tenta NAVEGAR de verdade num href de
              caminho e cospe "Not implemented" na saída do teste. */}
          <a href="#x"><img src="https://exemplo/b.jpg" alt="" /></a>
        </aside>
        <GlobalLightbox />
      </>,
    );
    for (const img of container.querySelectorAll("img")) {
      expect(abrir(img as HTMLImageElement)).toBe(false);
    }
  });

  it("data-nozoom continua sendo a saída explícita", () => {
    const { container } = render(
      <>
        <aside className="ui-side"><img data-nozoom src="https://exemplo/c.jpg" alt="" /></aside>
        <GlobalLightbox />
      </>,
    );
    expect(abrir(container.querySelector("img"))).toBe(false);
  });
});
