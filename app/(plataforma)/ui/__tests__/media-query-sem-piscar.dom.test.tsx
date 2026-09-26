import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useIsMobile, useScreenSize, BP_CELULAR } from "../useMediaQuery";

// ── O layout do celular não pode nascer desktop e "corrigir" depois ──────────
// A versão antiga do `useMediaQuery` nascia `false` e acertava num `useEffect`.
// Efeito é PASSIVO: roda DEPOIS do paint. Num celular, toda peça pendurada em
// `useIsMobile` (47 arquivos) pintava o layout de desktop por um quadro e
// trocava no seguinte — a piscada que o usuário via como "bug de layout".
//
// O que este teste mede não é o valor final (aquele sempre acertava), e sim
// QUANTOS quadros o componente comete: dois commits = piscada. Com
// `useSyncExternalStore` a checagem acontece em fase de layout, antes do paint,
// então o componente só pinta uma vez — já no valor certo.

const ouvintes = new Set<() => void>();
// `MediaQueryList` de verdade é VIVO: o mesmo objeto passa a casar quando a tela
// muda. O hook guarda um por query justamente por isso (assinar de novo a cada
// render re-assinaria pra sempre), então o duble precisa ser vivo também — senão
// o teste mede um defeito que só existe no duble.
const LISTAS = new Map<string, { matches: boolean; media: string }>();
let LARGURA = 1440;

function casa(query: string) {
  const max = /max-width:\s*(\d+)px/.exec(query);
  const min = /min-width:\s*(\d+)px/.exec(query);
  return max ? LARGURA <= +max[1] : min ? LARGURA >= +min[1] : false;
}

function fingirTela(largura: number) {
  LARGURA = largura;
  Object.defineProperty(window, "innerWidth", { value: largura, configurable: true, writable: true });
  LISTAS.forEach((l) => { l.matches = casa(l.media); });
  window.matchMedia = ((query: string) => {
    let l = LISTAS.get(query);
    if (!l) {
      l = {
        matches: casa(query),
        media: query,
        addEventListener: (_: string, fn: () => void) => ouvintes.add(fn),
        removeEventListener: (_: string, fn: () => void) => ouvintes.delete(fn),
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      } as never;
      LISTAS.set(query, l!);
    }
    return l as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

beforeEach(() => ouvintes.clear());
afterEach(() => vi.restoreAllMocks());

describe("useIsMobile — sem quadro errado", () => {
  it("já nasce mobile numa tela de 390px, num commit só", () => {
    fingirTela(390);
    const quadros: boolean[] = [];

    function Peca() {
      const mobile = useIsMobile();
      quadros.push(mobile);
      return <span data-testid="modo">{mobile ? "folha" : "modal"}</span>;
    }

    render(<Peca />);

    expect(screen.getByTestId("modo").textContent).toBe("folha");
    // Nenhum dos quadros pintados pode ter sido o de desktop.
    expect(quadros.every(Boolean)).toBe(true);
  });

  it("no desktop segue desktop", () => {
    fingirTela(1440);
    function Peca() {
      return <span data-testid="modo">{useIsMobile() ? "folha" : "modal"}</span>;
    }
    render(<Peca />);
    expect(screen.getByTestId("modo").textContent).toBe("modal");
  });

  it("acompanha a mudança de tamanho ao vivo", () => {
    fingirTela(1440);
    function Peca() {
      return <span data-testid="modo">{useIsMobile() ? "folha" : "modal"}</span>;
    }
    render(<Peca />);
    expect(screen.getByTestId("modo").textContent).toBe("modal");

    act(() => {
      fingirTela(390);
      ouvintes.forEach((fn) => fn());
    });
    expect(screen.getByTestId("modo").textContent).toBe("folha");
  });

  it("o consumidor do hook não vê a query trocar de identidade a cada quadro", () => {
    fingirTela(390);
    let vezes = 0;
    function Peca() {
      vezes++;
      useMediaQueryDuasVezes();
      return null;
    }
    function useMediaQueryDuasVezes() {
      // Duas leituras da MESMA query devem reusar o mesmo MediaQueryList: sem
      // cache, cada render criaria uma assinatura nova e o store re-assinaria
      // pra sempre.
      useIsMobile();
      useIsMobile();
    }
    render(<Peca />);
    expect(vezes).toBeLessThanOrEqual(2);
    expect(window.matchMedia(BP_CELULAR).matches).toBe(true);
  });
});

describe("useScreenSize — faixa certa no primeiro quadro", () => {
  it("nasce na faixa da largura real", () => {
    fingirTela(1024);
    function Peca() {
      const f = useScreenSize();
      return <span data-testid="faixa">{`${f}`}</span>;
    }
    render(<Peca />);
    expect(screen.getByTestId("faixa").textContent).toBe("lg");
  });
});
