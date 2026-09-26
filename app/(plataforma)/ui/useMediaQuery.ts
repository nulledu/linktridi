"use client";

import { useCallback, useSyncExternalStore } from "react";

// Consulta de mídia em JS, para o punhado de casos em que CSS não resolve:
// posicionamento calculado (popover/tour), modal que vira gaveta, rail que vira
// aba. O CSS continua sendo a primeira linha — isto é o complemento.
//
// POR QUE `useSyncExternalStore` E NÃO `useState` + `useEffect`.
// A versão antiga nascia `false` e corrigia num `useEffect`. Efeito é PASSIVO:
// roda DEPOIS do paint. No celular isso queria dizer que toda peça pendurada
// em `useIsMobile` pintava o layout de desktop por um quadro e trocava no
// seguinte — a piscada. Com 47 arquivos consumindo estes hooks, a tela inteira
// remontava um quadro depois de aparecer.
// `useSyncExternalStore` usa `getServerSnapshot` durante a hidratação e checa o
// valor do cliente em fase de LAYOUT (antes do paint), re-renderizando de forma
// síncrona quando diverge. O servidor continua vendo `false`/"xs" — sem erro de
// hidratação —, mas o usuário nunca chega a ver o quadro errado.
// Trava: use-screen-size.test.ts.

const CACHE = new Map<string, MediaQueryList>();

function lista(query: string): MediaQueryList | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  let mq = CACHE.get(query);
  if (!mq) {
    mq = window.matchMedia(query);
    CACHE.set(query, mq);
  }
  return mq;
}

export function useMediaQuery(query: string): boolean {
  const assinar = useCallback(
    (avisar: () => void) => {
      const mq = lista(query);
      if (!mq) return () => {};
      mq.addEventListener("change", avisar);
      return () => mq.removeEventListener("change", avisar);
    },
    [query],
  );

  const agora = useCallback(() => lista(query)?.matches ?? false, [query]);

  // No servidor (e no quadro de hidratação) é sempre `false`: o HTML entregue
  // tem que bater com o que o React espera.
  return useSyncExternalStore(assinar, agora, () => false);
}

// Pontos de corte compartilhados — os mesmos do globals.css. Um lugar só.
export const BP_CELULAR = "(max-width: 700px)";
export const BP_ESTREITO = "(max-width: 900px)";
export const BP_TOQUE = "(pointer: coarse)";

/** Celular (ou janela estreita): modal vira gaveta, popover vira folha. */
export function useIsMobile(): boolean {
  return useMediaQuery(BP_CELULAR);
}

/** Tablet/notebook estreito: sidebar vira rail horizontal. */
export function useIsEstreito(): boolean {
  return useMediaQuery(BP_ESTREITO);
}

// ── Faixa de largura comparável ──────────────────────────────────────────────
// Porte do `useScreenSize` (21st.dev), adaptado à fundação: os pontos de corte
// são os de `globals.css`/Tailwind (640/768/1024/1280/1536), a leitura é por
// `matchMedia` (sem `resize` cru) e corrige antes do paint como o resto do
// arquivo — nasce "xs" no servidor e já vale no cliente. Use quando a decisão é
// ORDINAL ("menor que lg?") e não binária; pra binário, `useIsMobile`.
export const FAIXAS = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;
export type Faixa = (typeof FAIXAS)[number];

/** Largura mínima (px) de cada faixa — a mesma escala do Tailwind. */
export const PISO_DA_FAIXA: Record<Faixa, number> = { xs: 0, sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 };

const ORDEM: Record<Faixa, number> = { xs: 0, sm: 1, md: 2, lg: 3, xl: 4, "2xl": 5 };

export class FaixaComparavel {
  constructor(private readonly value: Faixa) {}
  toString(): Faixa { return this.value; }
  valueOf(): number { return ORDEM[this.value]; }
  equals(o: Faixa): boolean { return this.value === o; }
  lessThan(o: Faixa): boolean { return this.valueOf() < ORDEM[o]; }
  greaterThan(o: Faixa): boolean { return this.valueOf() > ORDEM[o]; }
  lessThanOrEqual(o: Faixa): boolean { return this.valueOf() <= ORDEM[o]; }
  greaterThanOrEqual(o: Faixa): boolean { return this.valueOf() >= ORDEM[o]; }
}

/** Faixa pela largura — puro, pra teste e pro servidor. */
export function faixaDaLargura(width: number): Faixa {
  let f: Faixa = "xs";
  for (const k of FAIXAS) if (width >= PISO_DA_FAIXA[k]) f = k;
  return f;
}

// Uma media query por piso: o navegador avisa só quando cruza um corte, em vez
// de recalcular a cada pixel de `resize`.
function assinarFaixa(avisar: () => void) {
  const mqs = FAIXAS.filter((k) => k !== "xs")
    .map((k) => lista(`(min-width: ${PISO_DA_FAIXA[k]}px)`))
    .filter((mq): mq is MediaQueryList => !!mq);
  mqs.forEach((mq) => mq.addEventListener("change", avisar));
  return () => mqs.forEach((mq) => mq.removeEventListener("change", avisar));
}

// Snapshot é string (primitivo): o React compara por `Object.is` e não entra em
// laço. Devolver objeto novo aqui re-renderizaria pra sempre.
function faixaAgora(): Faixa {
  if (typeof window === "undefined") return "xs";
  return faixaDaLargura(window.innerWidth);
}

export function useScreenSize(): FaixaComparavel {
  const faixa = useSyncExternalStore(assinarFaixa, faixaAgora, () => "xs" as Faixa);
  return new FaixaComparavel(faixa);
}
