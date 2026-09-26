"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Leitura única de uma rota JSON, com os quatro estados que toda tela de
 * painel desenha: carregando, erro, indisponível (a rota devolve
 * `disponivel: false` quando falta tabela) e ok. Sem poll — recarrega quando a
 * URL muda ou quando alguém chama `recarregar()` depois de uma ação.
 *
 * Nasceu nas máquinas da Produção; o Design usa a mesma.
 */
export type Leitura<T> = { estado: "carregando" } | { estado: "erro" } | { estado: "indisponivel"; frase: string } | { estado: "ok"; dado: T };

export function useLeitura<T>(url: string, montar: (d: Record<string, unknown>) => T): Leitura<T> & { recarregar: () => void } {
  const [l, setL] = useState<Leitura<T>>({ estado: "carregando" });
  const [volta, setVolta] = useState(0);
  const recarregar = useCallback(() => setVolta((v) => v + 1), []);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        const d = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) setL({ estado: "erro" });
        else if (d.disponivel === false) setL({ estado: "indisponivel", frase: String(d.detalhe ?? "As máquinas ainda não têm tabela no banco.") });
        else setL({ estado: "ok", dado: montar(d) });
      } catch { if (vivo) setL({ estado: "erro" }); }
    })();
    return () => { vivo = false; };
    // `montar` é estável por chamada (função de módulo) — só a URL e o
    // "recarregar" disparam nova busca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, volta]);
  return { ...l, recarregar };
}


export const dadoDe = <T,>(l: Leitura<T>): T | null => (l.estado === "ok" ? l.dado : null);
