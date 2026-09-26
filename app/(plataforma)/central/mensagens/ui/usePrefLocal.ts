"use client";

import { useCallback, useState } from "react";

/**
 * Preferência puramente local e instantânea (seções recolhidas, largura do
 * painel). Não vai ao servidor de propósito: recolher uma seção não pode
 * custar uma requisição, e não faz mal se ficar diferente em outro aparelho.
 */
export function usePrefLocal<T>(chave: string, inicial: T): [T, (fn: (v: T) => T, persistir?: boolean) => void] {
  const [valor, setValor] = useState<T>(() => {
    if (typeof window === "undefined") return inicial;
    try {
      const cru = localStorage.getItem(chave);
      return cru ? (JSON.parse(cru) as T) : inicial;
    } catch { return inicial; }
  });

  // `persistir: false` é pro meio de um GESTO (arrastar a divisa): o valor
  // anda na tela sem pagar um JSON.stringify + localStorage síncrono por
  // movimento do ponteiro. Quem chama persiste uma vez no fim do gesto.
  const alterar = useCallback((fn: (v: T) => T, persistir = true) => {
    setValor((atual) => {
      const proximo = fn(atual);
      if (persistir) { try { localStorage.setItem(chave, JSON.stringify(proximo)); } catch { /* quota */ } }
      return proximo;
    });
  }, [chave]);

  return [valor, alterar];
}
