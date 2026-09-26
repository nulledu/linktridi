"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { travarRolagem } from "./ui/travaRolagem";

// "Quick Look" global (estilo Apple): QUALQUER imagem de conteúdo do sistema abre
// em pop-up ao clicar — sem precisar instrumentar tela por tela.
// Regras de elegibilidade (pra não atrapalhar ações existentes):
//  · ignora ícones/avatares pequenos (< 56px renderizados);
//  · ignora imagens dentro de <button>/<a>/sidebar/[data-nozoom] (têm ação própria);
//  · ignora imagens dentro de áreas clicáveis (algum pai com cursor: pointer).
//
// `aside:not(.ui-side)` — o "sidebar" da regra é a NAVEGAÇÃO, e `.ui-side` é o
// painel lateral (ui/controles.tsx), que é conteúdo. Como o painel também é um
// `<aside>`, a exclusão o pegava junto e o zoom morria dentro de TODO painel do
// sistema em silêncio: a foto do trabalho na conferência do Estoque, o anexo de
// uma solicitação, a imagem de um recebimento. Ninguém percebia porque nada
// falha — só não acontece nada ao clicar. As outras guardas continuam de pé
// (botão, link, pai clicável, imagem pequena), que são as que de fato protegem
// ação existente.
export function GlobalLightbox() {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const eligible = (t: EventTarget | null): t is HTMLImageElement => {
      if (!(t instanceof HTMLImageElement) || !t.src) return false;
      if (t.closest("[data-nozoom], [data-lightbox-root], button, a, aside:not(.ui-side)")) return false;
      const r = t.getBoundingClientRect();
      if (r.width < 56 || r.height < 56) return false;
      // fonte pequena (thumbnail/avatar/ícone): abrir em tela cheia mostraria
      // um ponto minúsculo perdido no escuro ("imagem pequena / sem sentido").
      // Só vale zoom se a imagem original TEM resolução pra mostrar detalhe.
      if (t.naturalWidth < 200 || t.naturalHeight < 200) return false;
      // pai clicável (card com onClick) → a ação do card vence, não o zoom
      let n: HTMLElement | null = t.parentElement;
      for (let i = 0; n && i < 6; i++, n = n.parentElement) {
        if (getComputedStyle(n).cursor === "pointer") return false;
      }
      return true;
    };
    const onClick = (e: MouseEvent) => { if (eligible(e.target)) setSrc((e.target as HTMLImageElement).src); };
    const onOver = (e: MouseEvent) => { if (eligible(e.target)) (e.target as HTMLImageElement).style.cursor = "zoom-in"; };
    document.addEventListener("click", onClick);
    document.addEventListener("mouseover", onOver);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("mouseover", onOver); };
  }, []);

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSrc(null); };
    window.addEventListener("keydown", onKey);
    // Trava contada: a foto pode ser aberta de DENTRO de um painel lateral, e
    // zerar o overflow na saída destravava o painel que continuava aberto.
    const soltar = travarRolagem();
    return () => { window.removeEventListener("keydown", onKey); soltar(); };
  }, [src]);

  if (!src) return null;
  return createPortal(
    <div data-lightbox-root onClick={() => setSrc(null)}
      style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.82)", backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)", display: "grid", placeItems: "center", padding: 26, cursor: "zoom-out" }}>
      <button onClick={() => setSrc(null)} aria-label="Fechar"
        style={{ position: "fixed", top: 18, right: 18, width: 40, height: 40, borderRadius: 12, border: "1px solid rgba(255,255,255,.22)", background: "rgba(255,255,255,.08)", color: "#fff", cursor: "pointer", display: "grid", placeItems: "center" }}><Icon name="x" size={18} color="#fff" /></button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={{ maxWidth: "94vw", maxHeight: "86dvh", objectFit: "contain", borderRadius: 14, boxShadow: "0 30px 90px rgba(0,0,0,.6)", animation: "lightboxIn .22s cubic-bezier(.2,.9,.3,1) both" }} />
      <a href={src} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
        style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", fontSize: 13, fontWeight: 600, color: "#fff", background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.22)", padding: "9px 18px", borderRadius: 999, textDecoration: "none", cursor: "pointer" }}>
        Abrir original
      </a>
    </div>,
    document.body,
  );
}
