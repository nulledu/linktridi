"use client";

// Campo de uma linha com o CURSOR que desliza (o "smooth caret" do Skiper106),
// portado sem framer-motion nem dialkit: o cursor nativo fica transparente e
// uma barrinha própria anda até a posição medida do texto, com transição de
// transform da escala do sistema. Serve nome, e-mail, WhatsApp, cidade e
// "quem você conhece". Textarea fica com o cursor nativo — medir posição em
// texto de várias linhas não vale o peso.
//
// Só desenho: o `<input>` continua sendo o `<input>` (seleção, autocompletar,
// teclado do celular, leitor de tela). Sem foco, sem barrinha.

import { useCallback, useEffect, useRef, type InputHTMLAttributes } from "react";

export function InputSuave(props: InputHTMLAttributes<HTMLInputElement>) {
  const input = useRef<HTMLInputElement>(null);
  const medida = useRef<HTMLSpanElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const piscar = useRef<number | null>(null);

  const posicionar = useCallback(() => {
    const el = input.current, m = medida.current, c = cursor.current;
    if (!el || !m || !c) return;
    if (document.activeElement !== el) { c.style.opacity = "0"; return; }
    const ini = el.selectionStart ?? 0, fim = el.selectionEnd ?? 0;
    if (ini !== fim) { c.style.opacity = "0"; return; }   // seleção: o realce nativo basta
    const st = getComputedStyle(el);
    // Propriedade por propriedade: o atalho `font` vem vazio no Safari/Firefox
    // pra <input>, e a medida caía na fonte do pai (menor) — o cursor ficava
    // ATRÁS da última letra.
    for (const k of ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "fontVariant",
      "fontFeatureSettings", "fontKerning", "letterSpacing", "wordSpacing", "textTransform"] as const) {
      m.style[k] = st[k];
    }
    m.textContent = el.value.slice(0, el.selectionDirection === "backward" ? ini : fim);
    // Largura fracionária (offsetWidth arredonda pra baixo) + 1px de folga: a
    // barrinha fica no respiro depois da letra, nunca por cima dela.
    const largura = m.textContent ? m.getBoundingClientRect().width + 1 : 0;
    const x = Math.max(0, Math.min(largura - el.scrollLeft, el.clientWidth - 2));
    c.style.transform = `translateX(${x}px)`;
    c.style.opacity = "1";
    // Parou de digitar → pisca. Mexeu → fica aceso e o relógio recomeça.
    c.removeAttribute("data-pisca");
    if (piscar.current) window.clearTimeout(piscar.current);
    piscar.current = window.setTimeout(() => c.setAttribute("data-pisca", "1"), 500);
  }, []);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const quadro = () => requestAnimationFrame(posicionar);
    const aoSelecionar = () => { if (document.activeElement === el) quadro(); };
    document.addEventListener("selectionchange", aoSelecionar);
    el.addEventListener("scroll", quadro);
    el.addEventListener("focus", quadro);
    el.addEventListener("blur", posicionar);
    const ro = new ResizeObserver(quadro);
    ro.observe(el);
    return () => {
      document.removeEventListener("selectionchange", aoSelecionar);
      el.removeEventListener("scroll", quadro);
      el.removeEventListener("focus", quadro);
      el.removeEventListener("blur", posicionar);
      ro.disconnect();
      if (piscar.current) window.clearTimeout(piscar.current);
    };
  }, [posicionar]);

  // Valor controlado que muda por fora (máscara do telefone, rascunho restaurado).
  useEffect(() => { requestAnimationFrame(posicionar); }, [props.value, posicionar]);

  return (
    <span className="cd-suave">
      <input
        {...props}
        ref={input}
        onInput={(e) => { props.onInput?.(e); requestAnimationFrame(posicionar); }}
      />
      <span ref={medida} className="cd-suave-medida" aria-hidden />
      <span ref={cursor} className="cd-suave-cursor" aria-hidden />
    </span>
  );
}
