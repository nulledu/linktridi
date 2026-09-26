"use client";

// ── Marketing · peças de acabamento ──────────────────────────────────────────
// Quatro micro-interações que a Biblioteca de Criativos, a lista de criativos e
// os Stories dividem. Visual em `marketing.css` (prefixo `.mk-`); tempo e curva
// só da escala do globals.css.
//
//   · ImagemQueChega  — Kinetics 074 (skeleton → conteúdo), receita `t-skel`
//   · CheckDesenhado  — Kinetics 065 (anel e visto se desenham)
//   · BarraElastica   — Kinetics 057 (a barra passa um tiquinho e assenta)
//   · BotaoCopiar     — Kinetics 016 (ícone vira visto, rótulo troca, volta)

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { TrocaIcone } from "../ui/micro";
import "./marketing.css";

/**
 * Miniatura que não "pisca" ao carregar: a espera e a imagem ocupam as mesmas
 * coordenadas e trocam com desfoque cruzado (`t-skel`). Imagem que já estava no
 * cache (onLoad disparou antes da hidratação) acende na hora pelo `complete`.
 * Imagem quebrada também acende — o modo de falha nunca é esqueleto eterno.
 */
export function ImagemQueChega({ src, alt = "", carregar = "lazy", className, onFalha, arrastavel = true }: {
  src: string;
  alt?: string;
  carregar?: "lazy" | "eager";
  className?: string;
  onFalha?: () => void;
  arrastavel?: boolean;
}) {
  const [chegou, setChegou] = useState(false);
  const ref = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setChegou(true);
  }, []);
  useEffect(() => { setChegou(false); }, [src]);
  return (
    <span className={`mk-img t-skel${chegou ? " is-revealed" : ""}${className ? ` ${className}` : ""}`}>
      <span className="t-skel-skeleton" aria-hidden><span className="mk-img-esq skeleton" /></span>
      <span className="t-skel-content">
        <img ref={ref} src={src} alt={alt} loading={carregar} decoding="async" draggable={arrastavel}
          onLoad={() => setChegou(true)} onError={() => { setChegou(true); onFalha?.(); }} />
      </span>
    </span>
  );
}

/**
 * O anel e o visto se desenham (paths exatos do `circle-check` do Tabler, com
 * `pathLength=1` pra que o traço seja uma fração e não um comprimento medido).
 * Anima uma vez ao montar; com menos movimento chega pronto.
 */
export function CheckDesenhado({ size = 18, titulo }: { size?: number; titulo?: string }) {
  return (
    <svg className="mk-check" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      role={titulo ? "img" : undefined} aria-label={titulo} aria-hidden={titulo ? undefined : true}>
      <path className="mk-check-anel" pathLength={1} d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path className="mk-check-visto" pathLength={1} d="M9 12l2 2l4 -4" />
    </svg>
  );
}

/** Barra de envio que assenta com um leve passo além do alvo (só na ida). */
export function BarraElastica({ fracao, rotulo, className }: { fracao: number; rotulo: string; className?: string }) {
  const p = Math.max(0, Math.min(1, fracao));
  return (
    <span className={`mk-prog${className ? ` ${className}` : ""}`} role="progressbar" aria-label={rotulo}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
      <span style={{ "--p": p } as CSSProperties} />
    </span>
  );
}

/**
 * Copiar pra área de transferência com confirmação: o ícone de copiar cruza pro
 * visto, o rótulo troca, e os dois voltam em ~1,4 s. Alvo de 44px sempre; o
 * rótulo some no modo `compacto`, mas continua no `aria-label`.
 */
export function BotaoCopiar({ texto, rotulo = "Copiar", copiado = "Copiado", compacto, className }: {
  texto: string;
  rotulo?: string;
  copiado?: string;
  compacto?: boolean;
  className?: string;
}) {
  const [ok, setOk] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (relogio.current) clearTimeout(relogio.current); }, []);
  const copiar = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      return;
    }
    setOk(true);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setOk(false), 1400);
  };
  return (
    <button type="button" className={`mk-copiar${className ? ` ${className}` : ""}`} data-ok={ok ? "1" : undefined}
      data-compacto={compacto ? "1" : undefined} onClick={copiar} title={ok ? copiado : rotulo}
      aria-label={ok ? copiado : rotulo}>
      <TrocaIcone ligado={ok} a="copy" b="check" size={15} corB="var(--ok)" />
      {!compacto && <span className="mk-copiar-txt" aria-live="polite">{ok ? copiado : rotulo}</span>}
    </button>
  );
}
