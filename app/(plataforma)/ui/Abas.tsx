"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

/**
 * Fileira de abas com um indicador que VIAJA entre elas.
 *
 * Antes, cada uma das 35 fileiras do app pintava o próprio fundo
 * (`background: on ? "var(--primary)" : "transparent"`). Trocar de aba era um
 * corte seco: a cor sumia de um lugar e aparecia em outro, sem nada ligando os
 * dois. O olho não acompanha um corte — ele reencontra. É por isso que a
 * mudança parecia "solta": não havia trajeto entre onde você estava e onde
 * passou a estar.
 *
 * Aqui existe UMA pílula, e ela se move. O movimento não é enfeite: é a
 * resposta visual à pergunta "de onde pra onde eu fui".
 *
 * Como funciona sem medir errado: a pílula é posicionada por `transform` e
 * `width` lidos do botão ativo (`offsetLeft`/`offsetWidth`). `offset*` e não
 * `getBoundingClientRect()` de propósito — o rect vem com o transform aplicado,
 * e dentro de uma faixa que rola isso devolve a posição na TELA, não no
 * contêiner.
 */
export function Abas<T extends string>({
  itens, valor, onMuda, className, ariaLabel, quebra, variante = "primaria",
}: {
  /**
   * `href` transforma a aba em navegação de verdade (abre em nova aba com
   * ⌘-clique, o navegador pré-carrega, e funciona sem JavaScript). Uma aba que
   * troca de PÁGINA e é desenhada como botão rouba isso da pessoa.
   */
  itens: { valor: T; rotulo: ReactNode; badge?: ReactNode; href?: string; className?: string; desabilitada?: boolean }[];
  valor: T;
  onMuda?: (v: T) => void;
  className?: string;
  ariaLabel?: string;
  /**
   * Deixa a fileira QUEBRAR em varias linhas no computador em vez de rolar
   * de lado. Opt-in porque so vale onde as opcoes sao muitas e todas
   * precisam ser vistas de uma vez — numa fileira de 4 abas, quebrar so
   * gastaria altura. No celular a fileira continua rolando: 9 chips em 5
   * linhas empurrariam a lista pra fora da primeira dobra.
   */
  quebra?: boolean;
  /**
   * Desenho do Tabs do HeroUI v3. `primaria` = trilho com o indicador em
   * pílula (segmento); `secundaria` = sem trilho, linha de destaque embaixo
   * da aba — pra navegação de seção num cabeçalho, onde o trilho pesaria.
   */
  variante?: "primaria" | "secundaria";
}) {
  /**
   * Navegar e alternar são coisas diferentes, e o leitor de tela precisa saber
   * qual é qual. `role="tab"` promete que o conteúdo está ali ao lado e que
   * nada recarrega — usar isso em links que trocam de PÁGINA é mentir: a pessoa
   * espera continuar no mesmo lugar e a página inteira muda debaixo dela.
   *
   * Com `href` isto é uma navegação (`<nav>` + `aria-current="page"`); sem
   * `href`, é um tablist de verdade.
   */
  const navega = itens.some((i) => i.href);
  const faixa = useRef<HTMLDivElement>(null);
  const pilulaEl = useRef<HTMLSpanElement>(null);
  // `y`/`h` alem de `x`/`w`: a fileira pode QUEBRAR em duas linhas (ver
  // `quebra`), e uma pilula presa em `top: 4px` ficaria na primeira linha
  // pintando a aba errada quando a escolhida esta na segunda.
  const [pilula, setPilula] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Só anima DEPOIS da primeira medição. Sem isto a pílula nasce em x=0 e
  // desliza até a aba certa no primeiro quadro — um movimento que ninguém
  // pediu e que faz a tela parecer instável ao abrir.
  const [pronta, setPronta] = useState(false);

  useLayoutEffect(() => {
    const el = faixa.current?.querySelector<HTMLElement>('[data-ativa="1"]');
    if (!el) return;
    setPilula({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    // A aba atual pode estar fora da vista numa faixa que rola no celular.
    el.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [valor, itens.length]);

  // Ligar a transição é uma segunda mutação no mesmo nó, e o navegador só
  // anima entre dois estilos que ele de fato CALCULOU. Sem o reflow forçado as
  // duas mutações (posicionar e ligar) podem cair no mesmo cálculo, e a pílula
  // volta a deslizar de translateX(0) até a aba certa no primeiro quadro — o
  // defeito que o `data-pronta` existe pra evitar. Era um `setTimeout` de 60ms:
  // funcionava por folga, e folga medida em milissegundos é o que some primeiro
  // na máquina lenta. Ler `offsetWidth` força o cálculo na hora, sem cronômetro.
  useLayoutEffect(() => {
    if (!pilula || pronta) return;
    void pilulaEl.current?.offsetWidth;
    setPronta(true);
  }, [pilula, pronta]);

  // A largura das abas muda quando a fonte carrega ou a janela é redimensionada.
  // Sem reagir, a pílula fica sob o texto errado — o defeito mais visível que
  // este componente pode ter.
  useEffect(() => {
    const el = faixa.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const a = el.querySelector<HTMLElement>('[data-ativa="1"]');
      if (a) setPilula({ x: a.offsetLeft, y: a.offsetTop, w: a.offsetWidth, h: a.offsetHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={faixa} className={"ui-abas tab-strip" + (variante === "secundaria" ? " ui-abas--secundaria" : "") + (quebra ? " ui-abas--quebra" : "") + (className ? " " + className : "")}
      role={navega ? "navigation" : "tablist"} aria-label={ariaLabel}>
      {pilula && (
        <span ref={pilulaEl} className="ui-abas-pilula" aria-hidden data-pronta={pronta ? "1" : undefined}
          style={{ transform: `translate(${pilula.x}px, ${pilula.y}px)`, width: pilula.w, height: pilula.h }} />
      )}
      {itens.map((it) => {
        const ativa = it.valor === valor;
        const comum = {
          "data-ativa": ativa ? "1" : undefined,
          "aria-disabled": it.desabilitada || undefined,
          className: "ui-abas-item" + (it.className ? " " + it.className : ""),
          children: <>{it.rotulo}{it.badge}</>,
        };
        return it.href
          ? <Link key={it.valor} href={it.desabilitada ? "#" : it.href} tabIndex={it.desabilitada ? -1 : undefined}
              onClick={it.desabilitada ? (e) => e.preventDefault() : undefined} aria-current={ativa ? "page" : undefined} {...comum} />
          : <button key={it.valor} type="button" role="tab" aria-selected={ativa}
              disabled={it.desabilitada} onClick={() => onMuda?.(it.valor)} {...comum} />;
      })}
    </div>
  );
}
