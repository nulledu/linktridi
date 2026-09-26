"use client";

// ── Duas coisas que todo painel do Estoque precisa, e nenhuma delas é enfeite ──
//
// As duas nasceram de medida, não de gosto. Estão juntas porque servem à mesma
// promessa: o que o painel diz tem de estar ONDE a pessoa está olhando, e o
// painel tem de ocupar a tela que ele diz ocupar.

import { useEffect, useRef } from "react";
import { useIsMobile } from "../ui/useMediaQuery";

/**
 * Traz a faixa de erro pra vista quando ela aparece.
 *
 * MEDIDO, não suposto. Em todos os painéis o botão que grava mora no RODAPÉ
 * fixo, e a mensagem de erro mora no FIM do corpo rolável — só que o corpo não
 * rola sozinho. A 320px:
 *
 *   · ConferirPainel: a pessoa está no topo (scrollTop 0), toca "Confirmar
 *     errado" e a frase "Sua sessão expirou e nada foi gravado" nasce 934px
 *     ABAIXO da última linha visível;
 *   · ItemEditor: o botão "Etiquetar 48 unidades" fica no primeiro terço do
 *     modal, e o erro dele aparece 1218px abaixo da dobra;
 *   · ImportarPlanilha: 204px abaixo.
 *
 * Em todos os casos o resultado na tela é o MESMO: nada acontece. O botão gira,
 * para, e a tela não muda um pixel — que é indistinguível de "o app travou". A
 * pessoa tenta de novo, e de novo.
 *
 * `block: "nearest"` de propósito: rola o MÍNIMO pra caber (a faixa encosta na
 * borda de baixo) em vez de saltar a coluna inteira e desorientar quem estava
 * lendo. Como o rodapé com o botão é fixo logo abaixo, a faixa aparece
 * exatamente ao lado do botão que acabou de falhar.
 *
 * INSTANTÂNEO, não `smooth`, e isso é medido. Um `behavior: "smooth"` de 1200px
 * leva centenas de milissegundos durante os quais a tela ainda não mudou — que
 * é justamente o intervalo em que a pessoa conclui que travou e toca de novo.
 * Pior: medido no navegador embutido, a rolagem suave andou 34px e parou (ela
 * depende de quadros, e quadro é o que falta quando a aba não está pintando).
 * A mensagem tem de estar na tela no mesmo instante em que o botão para de
 * girar.
 *
 * O `?.` no `scrollIntoView` não é paranoia: o jsdom dos testes de componente
 * não implementa o método, e uma faixa de erro não pode derrubar a suíte.
 *
 * @param gatilho o próprio erro. Falso/nulo = não há o que mostrar.
 */
export function useTrazerPraVista<T extends HTMLElement>(gatilho: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!gatilho) return;
    ref.current?.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  }, [gatilho]);
  return ref;
}

/**
 * A largura do `PainelLateral` que NÃO vira defeito no celular.
 *
 * O `largura` do painel vira `style={{ width: min(Npx, 100vw) }}` — estilo
 * INLINE, que vence a folha de estilo. Abaixo de 700px a fundação transforma o
 * painel em folha presa embaixo (`left: 0; right: 0; width: auto`), mas o
 * `width` inline continua mandando: o `right: 0` é ignorado e a folha nasce
 * grudada na ESQUERDA, com uma tira preta na direita.
 *
 * Medido: "Gerar etiquetas" (`largura={380}`) num iPhone 14 Pro Max (430px)
 * saía com 380px de largura e 50px de sobra na direita; a 390px, 10px. Em
 * lote (`largura={520}`) numa janela de 600px, 80px.
 *
 * A própria documentação da prop já promete o certo — "Largura no computador.
 * No celular é sempre a tela inteira" — e é essa promessa que o inline quebra.
 * Devolver `undefined` no celular é dizer a mesma coisa de um jeito que o CSS
 * consegue obedecer.
 *
 * Sem piscada: o `PainelLateral` só desenha depois do primeiro efeito
 * (`montado`), e `useIsMobile` corrige no efeito do mesmo commit — as duas
 * mudanças entram no mesmo re-render, então a folha JÁ nasce com a largura
 * certa.
 *
 * O ponto de corte é o `BP_CELULAR` (`max-width: 700px`), o mesmo do
 * `.ui-side` no `globals.css`. Um lugar só.
 */
export function useLarguraDeFolha(desktop: number): number | undefined {
  return useIsMobile() ? undefined : desktop;
}
