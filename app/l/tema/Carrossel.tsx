"use client";

// ── Carrossel com o DOM do Flickity ──────────────────────────────────────────
// O `theme.css` do tema traz o CSS do Flickity inteiro — `.flickity-enabled`,
// `.flickity-viewport`, `.flickity-slider`, `.flickity-page-dots .dot`, o modo
// `is-fade`. Isso muda o que "portar o carrossel" significa: não é escrever um
// carrossel novo com CSS novo, é emitir a MESMA árvore de classes e mexer nas
// mesmas propriedades que o Flickity mexeria.
//
// O resultado é idêntico ao original sem trazer jQuery (87 KB) e Flickity pra
// dentro do projeto — e o `theme.js` de 513 KB fica onde está.
//
// Duas coisas que o Flickity faz e que precisam ser feitas à mão:
//   1. altura adaptável — o `.flickity-viewport` é `height: 100%`, então quem
//      tem altura de conteúdo (slide com proporção preservada) precisa que
//      alguém meça e escreva a altura;
//   2. `is-selected` no slide e no ponto, que é a classe de que TODO o CSS de
//      seleção depende.

import { Children, cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState } from "react";

interface Props {
  /** Um elemento por slide. A classe do slide fica com quem chama. */
  children: React.ReactNode[];
  className?: string;
  /** `fade` usa `is-fade` do tema; `slide` desliza a faixa. */
  efeito?: "slide" | "fade";
  autoPlay?: boolean;
  /** Milissegundos entre trocas. */
  intervalo?: number;
  pontos?: boolean;
  setas?: boolean;
  /** Mede o slide ativo e escreve a altura do palco (o `adaptiveHeight`). */
  alturaAdaptavel?: boolean;
  /** Quantos slides cabem por vez. Acima de 1 vira faixa que desliza de a um. */
  porVez?: number;
  rotulo?: string;
  /** Estilo do palco. Usado pela proporção do carrossel de banners. */
  estilo?: React.CSSProperties;
}

export function Carrossel({
  children, className = "", efeito = "slide", autoPlay = false, intervalo = 5000,
  pontos = true, setas = false, alturaAdaptavel = false, porVez = 1, rotulo, estilo,
}: Props) {
  const total = children.length;
  const [i, setI] = useState(0);
  const [altura, setAltura] = useState<number | null>(null);
  const trilho = useRef<HTMLDivElement>(null);
  const nome = useId();

  const paginas = Math.max(1, Math.ceil(total / porVez));
  const ir = useCallback((n: number) => setI(((n % paginas) + paginas) % paginas), [paginas]);

  // Giro automático. Para quando a aba sai da frente — a mesma regra do resto
  // do projeto: animação em aba escondida gasta bateria e não é vista por
  // ninguém.
  useEffect(() => {
    if (!autoPlay || paginas < 2) return;
    let t: ReturnType<typeof setInterval> | null = null;
    const liga = () => {
      if (t) clearInterval(t);
      t = setInterval(() => setI((n) => (n + 1) % paginas), Math.max(3000, intervalo));
    };
    const acompanha = () => (document.hidden ? t && clearInterval(t) : liga());
    liga();
    document.addEventListener("visibilitychange", acompanha);
    return () => {
      if (t) clearInterval(t);
      document.removeEventListener("visibilitychange", acompanha);
    };
  }, [autoPlay, intervalo, paginas]);

  // Altura do palco. `ResizeObserver` e não medida única porque a imagem chega
  // depois do primeiro quadro: medir só na montagem daria a altura do slide
  // vazio, e o carrossel abriria achatado até alguém redimensionar.
  useEffect(() => {
    if (!alturaAdaptavel) return;
    const el = trilho.current?.children[i * porVez] as HTMLElement | undefined;
    if (!el) return;
    const medir = () => setAltura(el.offsetHeight || null);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [alturaAdaptavel, i, porVez, total]);

  // Arrastar com o dedo. Sem isto o carrossel do celular só troca pelos pontos,
  // que têm 6px — inalcançáveis com o polegar.
  const toque = useRef<{ x: number; y: number } | null>(null);
  const comecou = (e: React.PointerEvent) => { toque.current = { x: e.clientX, y: e.clientY }; };
  const terminou = (e: React.PointerEvent) => {
    const t = toque.current;
    toque.current = null;
    if (!t) return;
    const dx = e.clientX - t.x;
    // O eixo vertical vence: um deslize diagonal é a pessoa rolando a página,
    // e sequestrar isso trava a rolagem do celular.
    if (Math.abs(dx) < 40 || Math.abs(e.clientY - t.y) > Math.abs(dx)) return;
    ir(i + (dx < 0 ? 1 : -1));
  };

  if (!total) return null;

  const desliza = efeito === "slide";
  const classes = [
    className, "flickity-enabled", "is-draggable",
    efeito === "fade" ? "is-fade" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={classes} role="region" aria-roledescription="carrossel" aria-label={rotulo} style={estilo}>
      <div
        className="flickity-viewport"
        style={altura ? { height: altura } : undefined}
        onPointerDown={comecou}
        onPointerUp={terminou}
      >
        <div
          className="flickity-slider"
          ref={trilho}
          style={desliza ? { transform: `translateX(${-i * 100}%)`, transition: "transform .5s cubic-bezier(.25,.46,.45,.94)" } : undefined}
        >
          {Children.map(children, (filho, n) => vestirSlide(filho, n, porVez, desliza, Math.floor(n / porVez) === i))}
        </div>
      </div>

      {setas && paginas > 1 && (
        <>
          <button type="button" className="flickity-prev-next-button previous" aria-label="Anterior" onClick={() => ir(i - 1)}>
            <svg viewBox="0 0 100 100"><path d="M 10,50 L 60,100 L 70,90 L 30,50 L 70,10 L 60,0 Z" /></svg>
          </button>
          <button type="button" className="flickity-prev-next-button next" aria-label="Próximo" onClick={() => ir(i + 1)}>
            <svg viewBox="0 0 100 100"><path d="M 10,50 L 60,100 L 70,90 L 30,50 L 70,10 L 60,0 Z" transform="translate(100,100) rotate(180)" /></svg>
          </button>
        </>
      )}

      {pontos && paginas > 1 && (
        <ol className="flickity-page-dots">
          {Array.from({ length: paginas }, (_, n) => (
            <li
              key={n}
              className={n === i ? "dot is-selected" : "dot"}
              aria-current={n === i}
              // O ponto tem 6px de diâmetro: alvo minúsculo. O `::before` do
              // tema já estende a área clicável em 4px de cada lado — o botão
              // invisível por cima é o que completa o alvo de toque sem mexer
              // no CSS do tema.
              onClick={() => ir(n)}
            >
              <button type="button" aria-label={`Ir para o slide ${n + 1}`} aria-controls={nome}
                style={{ position: "absolute", inset: "-19px", background: "none", border: 0, padding: 0, cursor: "pointer" }} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Veste o elemento que veio de fora com o que o Flickity poria nele.
 *
 * Envolver o slide num `<div>` a mais seria mais simples e estaria ERRADO: o
 * CSS do tema fala em `.flickity-slider > .is-selected` e em
 * `.slideshow__slide { height: 100% }`, os dois contando que o slide seja filho
 * DIRETO da faixa. Um invólucro no meio quebra a seleção do modo fade e deixa o
 * slide sem altura.
 */
function vestirSlide(filho: React.ReactNode, n: number, porVez: number, desliza: boolean, selecionado: boolean) {
  if (!isValidElement(filho)) return filho;
  const props = filho.props as { className?: string; style?: React.CSSProperties };
  const largura = 100 / porVez;
  return cloneElement(filho, {
    className: [props.className, selecionado ? "is-selected" : ""].filter(Boolean).join(" "),
    style: {
      ...props.style,
      position: "absolute",
      left: desliza ? `${n * largura}%` : 0,
      width: `${largura}%`,
    },
  } as Partial<typeof props>);
}
