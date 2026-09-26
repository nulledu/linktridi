"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A dica dos ícones da faixa recolhida.
 *
 * Antes era o `title` nativo do navegador, e ele tem três defeitos que não dão
 * pra corrigir: demora cerca de um segundo pra aparecer, nasce colada no
 * cursor (não no elemento) e o navegador a corta na borda da tela — foi
 * exatamente assim que apareceu no print, com o nome pela metade.
 *
 * Numa faixa de ícones sem rótulo, essa dica não é enfeite: é a única forma de
 * saber o que cada botão faz. Um segundo de espera, multiplicado por cada
 * dúvida, é o que fazia a faixa parecer hostil.
 *
 * Por que um host com portal em vez de um `::after` no próprio item: a faixa
 * tem `overflow: hidden` (necessário, senão o conteúdo largo vaza durante a
 * transição de largura), e qualquer coisa desenhada dentro dela seria cortada
 * — o mesmo defeito do `title`, só que nosso. O portal põe a dica no `body`,
 * onde nada a corta.
 */
export function DicaHost() {
  const [d, setD] = useState<{ txt: string; y: number; x: number } | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => { setPronto(true); }, []);

  useEffect(() => {
    // ── Atraso de INTENÇÃO ────────────────────────────────────────────────
    // A dica esperava zero e aparecia no primeiro pixel de contato. Numa faixa
    // vertical de ~10 ícones, o cursor que só atravessa a barra a caminho do
    // conteúdo acendia TODOS no percurso — uma cascata de balões que ninguém
    // pediu, e que aparecia justamente quando a pessoa não estava olhando pra lá.
    //
    // Os 80ms vêm do `--tt-delay` da receita de tooltip: é a janela que separa
    // "passei por cima" de "parei aqui pra saber o que é". Sair NÃO tem atraso
    // nenhum — dispensar é sempre instantâneo.
    //
    // Com uma dica JÁ aberta, trocar de ícone é imediato: quem já está lendo a
    // faixa não deve esperar de novo a cada item. É como todo sistema de dica
    // se comporta, e sem isso percorrer os ícones vira uma sequência de esperas.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let visivel = false;

    // Delegação num listener só: a faixa tem ~10 itens e eles trocam com a
    // navegação. Um listener por item seria remontado a cada render.
    const mostrar = (e: Event) => {
      const alvo = (e.target as HTMLElement)?.closest?.("[data-dica]") as HTMLElement | null;
      if (!alvo) return;
      // Só quando o rótulo NÃO está visível. Uma dica que repete um texto que
      // já está na tela é ruído — e some sozinha quando a faixa é expandida.
      if (!alvo.closest(".app-sidebar.rail")) return;
      const medir = () => {
        const r = alvo.getBoundingClientRect();
        setD({ txt: alvo.dataset.dica || "", y: r.top + r.height / 2, x: r.right + 10 });
        visivel = true;
      };
      clearTimeout(timer);
      // A medida do retângulo vai DENTRO do timer: em 80ms a faixa pode ter
      // terminado de recolher, e uma posição medida antes disso põe o balão
      // no lugar antigo.
      if (visivel) medir(); else timer = setTimeout(medir, 80);
    };
    const esconder = () => { clearTimeout(timer); visivel = false; setD(null); };

    document.addEventListener("pointerover", mostrar);
    document.addEventListener("pointerout", esconder);
    // Teclado também: quem navega por Tab precisa da mesma informação.
    document.addEventListener("focusin", mostrar);
    document.addEventListener("focusout", esconder);
    // Rolar ou sair da página com a dica aberta deixaria ela flutuando solta.
    window.addEventListener("scroll", esconder, true);
    return () => {
      document.removeEventListener("pointerover", mostrar);
      document.removeEventListener("pointerout", esconder);
      document.removeEventListener("focusin", mostrar);
      document.removeEventListener("focusout", esconder);
      window.removeEventListener("scroll", esconder, true);
      // Sem isto, sair da tela com o cursor sobre um ícone deixa um `setState`
      // agendado num componente que já saiu da árvore.
      clearTimeout(timer);
    };
  }, []);

  if (!pronto || !d) return null;
  return createPortal(
    <span className="ui-dica" role="tooltip" style={{ top: d.y, left: d.x }}>{d.txt}</span>,
    document.body,
  );
}
