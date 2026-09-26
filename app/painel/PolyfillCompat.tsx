"use client";

import { useEffect } from "react";

/**
 * Faz o painel sair IGUAL ao navegador mesmo no WebView velho da TV box.
 *
 * O painel é dimensionado por CONTAINER QUERIES (unidades cqh/cqi/cqmin e
 * blocos @container) — o que dá a cada bloco fonte, altura e espaçamento na
 * proporção da própria célula da grade. Isso só existe no Chrome 105+; o
 * WebView de fábrica de uma TV box é bem mais velho, e sem suporte o layout
 * desmonta ("os painéis ficam diferentes"). Um TV box Android 9/10 roda um
 * Chrome mais novo que o Android 7, mas ainda abaixo de 105.
 *
 * O polyfill (GoogleChromeLabs) reprocessa as folhas de estilo e RESOLVE as
 * container queries em runtime — @container e as unidades cq* — deixando a
 * parede idêntica ao que se vê no computador. Ele mede cada container com o
 * ResizeObserver (presente do Chrome 77+, ou seja Android 9/10).
 *
 * Carrega SÓ quando falta suporte nativo: num navegador atual isto é um `return`
 * de uma linha, e o import dinâmico nem entra no bundle — o peso do polyfill
 * fica restrito às TVs que realmente precisam dele.
 */
export function PolyfillCompat() {
  useEffect(() => {
    try {
      // Na TV (`?tv=1`) o painel usa MODO IMAGEM, não o polyfill — e em
      // WebView de 2016 o próprio import do polyfill quebra (AbortController
      // ausente). Então nem tenta: o modo imagem cuida da parede.
      if (new URLSearchParams(window.location.search).get("tv") === "1") return;

      const nativo =
        typeof CSS !== "undefined" &&
        typeof CSS.supports === "function" &&
        CSS.supports("container-type: size");
      if (nativo) return;

      // ResizeObserver é o que o polyfill usa para medir os containers. Falta
      // no Chrome 55 (Android 7); presente no 77+ (Android 9/10). Sem ele, o
      // polyfill não roda — então garantimos um antes de carregá-lo.
      const carregar = () =>
        import("container-query-polyfill").catch((e) => {
          console.warn("[compat] polyfill de container-query não carregou", e);
        });

      if (typeof (window as unknown as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
        import("resize-observer-polyfill")
          .then((m) => {
            (window as unknown as { ResizeObserver: unknown }).ResizeObserver =
              (m as { default: unknown }).default;
          })
          .catch(() => {})
          .finally(carregar);
      } else {
        carregar();
      }
    } catch {
      /* nunca derruba o painel por causa do compat */
    }
  }, []);
  return null;
}
