"use client";

import { useEffect } from "react";

/**
 * Lê um parâmetro da URL UMA vez, depois da montagem, e entrega ao `set` de um
 * estado que já existe. É como a busca universal do Início da Central entrega o
 * termo para a tela de destino: `/estoque?busca=cadeira` abre o Estoque com o
 * campo já preenchido, em vez de largar a pessoa na lista completa com a
 * palavra na cabeça e o campo vazio.
 *
 * Por que `window.location` e não `useSearchParams`: o hook do Next obriga a
 * página inteira a nascer dentro de um `<Suspense>`, e aqui não há nada para
 * esperar — o parâmetro é uma semente, não a fonte da verdade. Depois da
 * primeira leitura o estado é da tela, e mexer no campo não reescreve a URL.
 *
 * Rodar só no efeito também evita o descasamento de hidratação: o servidor não
 * conhece a query string desta navegação e renderizaria o campo vazio.
 */
export function useParamDaUrl(nome: string, aplicar: (valor: string) => void) {
  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get(nome);
      if (v) aplicar(v);
    } catch { /* SSR ou URL malformada */ }
    // Só na montagem: é semente, não sincronia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
