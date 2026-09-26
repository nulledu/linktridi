"use client";

import { useCallback, useRef } from "react";

/**
 * Guarda contra RESPOSTA ATRASADA em busca disparada por filtro (período).
 *
 * Trocar o período dispara uma busca nova com a antiga ainda no ar. As rotas
 * do ERP/Graph levam segundos na primeira vez e milissegundos com o cache
 * quente, então as respostas chegam FORA DE ORDEM — e quem escreve por último
 * vence: a tela fica com o dado do período ANTERIOR embaixo do chip novo. Em
 * tela sem poll o dado errado fica até alguém recarregar.
 *
 * Uso, dentro do load:
 *
 *   const buscaAtual = useBuscaAtual();
 *   const load = useCallback(async () => {
 *     const souAtual = buscaAtual();      // carimbo desta busca
 *     const d = await (await fetch(…)).json();
 *     if (!souAtual()) return;            // chegou busca mais nova: descarta
 *     setDado(d);
 *   }, [period, buscaAtual]);
 *
 * Efeito inline (sem função compartilhada) resolve com `let vivo = true` +
 * cleanup — ver useProduction em producao/parts.tsx. Este hook existe pro
 * caso em que o MESMO load é chamado por efeito, poll e botão "atualizar",
 * onde o cleanup do efeito não cobre as outras chamadas.
 *
 * Trava: lib/__tests__/resposta-atrasada.test.ts.
 */
export function useBuscaAtual(): () => () => boolean {
  const seq = useRef(0);
  return useCallback(() => {
    const eu = ++seq.current;
    return () => eu === seq.current;
  }, []);
}
