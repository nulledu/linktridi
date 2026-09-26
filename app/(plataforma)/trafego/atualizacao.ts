"use client";

// ── Sinal de "Atualizar" da Tridify ──────────────────────────────────────────
// O botão "Atualizar" refaz o panorama do Meta e o snapshot do ERP, que são
// estado do `TrafegoClient` e descem por prop. Só que o "Meu painel" tem
// widgets que buscam a PRÓPRIA rota (a Vega e a Yampi leem o ERP legado direto)
// e não têm como enxergar esse clique: eles só recarregam quando `de`/`ate`
// mudam. O resultado é o defeito clássico deste painel, e é a segunda vez que
// ele aparece — metade dos números anda, a outra metade fica congelada na
// primeira leitura da sessão, e quem olha conclui que "não atualizou".
//
// Passar um contador por prop resolveria só para os dois widgets de hoje: cada
// widget novo com rota própria voltaria a nascer congelado, porque nada obriga
// quem escreve o widget a lembrar da prop. Um evento no `window` inverte isso —
// quem quer se atualizar se inscreve, e o botão não precisa conhecer ninguém.
//
// Não é poll nem canal de dados: não carrega payload e só dispara por clique.

import { useEffect, useRef } from "react";

const EVENTO = "tridify:atualizar";

/** Avisa a tela inteira que a pessoa pediu dados novos (botão "Atualizar"). */
export function avisarAtualizacao() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO));
}

/**
 * Recarrega este widget quando o "Atualizar" da Tridify é clicado.
 *
 * A função vai numa ref porque a maioria dos `carregar` é um `useCallback` que
 * troca de identidade a cada período: inscrever/desinscrever a cada render
 * perderia o evento disparado no meio da troca.
 */
export function useAtualizacao(carregar: () => void) {
  const ref = useRef(carregar);
  ref.current = carregar;
  useEffect(() => {
    const ouvir = () => ref.current();
    window.addEventListener(EVENTO, ouvir);
    return () => window.removeEventListener(EVENTO, ouvir);
  }, []);
}

// Gasto manual lançado/apagado no widget "Gasto + imposto". Diferente do
// "Atualizar": só o snapshot do ERP precisa ser relido (sem cache), porque é
// ele que soma o manual no gasto — o panorama do Meta não muda.
const EVENTO_GASTO = "tridify:gasto-manual";

export function avisarGastoManual() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_GASTO));
}

export function useGastoManual(recarregar: () => void) {
  const ref = useRef(recarregar);
  ref.current = recarregar;
  useEffect(() => {
    const ouvir = () => ref.current();
    window.addEventListener(EVENTO_GASTO, ouvir);
    return () => window.removeEventListener(EVENTO_GASTO, ouvir);
  }, []);
}

// ── "Chegou venda" — mais estreito que o Atualizar ──────────────────────────
// O tick de vendas do painel (TrafegoClient) dispara isto quando a contagem de
// pagas do espelho da Yampi muda. Só quem mostra VENDA escuta (os cards da
// Yampi); o Atualizar inteiro refaria também Meta, relatórios e funil — caro
// demais pra cada venda que cai.
const EVENTO_VENDA = "tridify:venda-nova";

export function avisarVendaNova() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_VENDA));
}

export function useVendaNova(carregar: () => void) {
  const ref = useRef(carregar);
  ref.current = carregar;
  useEffect(() => {
    const ouvir = () => ref.current();
    window.addEventListener(EVENTO_VENDA, ouvir);
    return () => window.removeEventListener(EVENTO_VENDA, ouvir);
  }, []);
}
