"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Movimento das telas de números (Analytics, Comercial, Vendas).
//
// Peças do repertório Kinetics (.claude/skills/kinetics) trazidas pro kit:
// o visual mora em `movimento.css`, e aqui só se decide QUANDO e QUANTO. Tudo
// o que já existia na fundação (`NumeroVivo`, `Fila`, `useRevelar`) é
// reaproveitado — isto completa o kit, não o duplica.
//
//   BarraElastica  057 Elastic Progress + 093 Confidence Settle
//   Anel           068 Progress Ring
//   FilaViva       054 Stagger Entrance + FLIP quando a ordem muda
//   Revalidando    100 Stale While Revalidate
//   Atualizando    o selo que acompanha o 100
//   Vazio          estado vazio com ícone Tabler
//   .km-chip       018 Choice Chips / 027 Toggle Pills (só CSS)
//   .km-chega      074 Skeleton to Content (só CSS)
// ─────────────────────────────────────────────────────────────────────────────

import "./movimento.css";
import {
  Children, cloneElement, isValidElement, useEffect, useLayoutEffect, useRef,
  type CSSProperties, type ReactNode,
} from "react";
import { Icon } from "../Icon";
import { useRevelar, menosMovimento, duracaoCss } from "../ui/micro";

// No servidor o `useLayoutEffect` não roda (e o React avisa); no navegador ele
// é o único que mede ANTES do paint — é isso que deixa o FLIP sem piscada.
const useLayoutSeguro = typeof window === "undefined" ? useEffect : useLayoutEffect;

const limitar = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/**
 * Barra de proporção que cresce ao entrar na tela e assenta com um fio de
 * mola. Quando o valor muda (outro período), ela ANDA até o novo.
 *
 * `frac` é 0..1. A largura vai pro CSS como `--km-w` com PONTO decimal — a
 * vírgula (`36,5%`) é declaração inválida e a barra voltaria cheia.
 * `minimo` (em %) garante que uma fatia minúscula continue visível.
 */
export function BarraElastica({ frac, cor = "var(--graf-1)", opacidade, altura = 6, trilho = "var(--mc-trilho-bg)", raio = 999, minimo = 0, style }: {
  frac: number; cor?: string; opacidade?: number; altura?: number; trilho?: string;
  raio?: number | string; minimo?: number; style?: CSSProperties;
}) {
  const ref = useRevelar<HTMLSpanElement>();
  const pct = frac > 0 ? Math.max(minimo, limitar(frac) * 100) : 0;
  return (
    <span ref={ref} className="km-barra" aria-hidden
      style={{ height: altura, background: trilho, borderRadius: raio, ["--km-w" as string]: `${pct.toFixed(2)}%`, ...style }}>
      <i style={{ background: cor, opacity: opacidade, borderRadius: raio }} />
    </span>
  );
}

/**
 * Anel de progresso — pra número que tem TETO (gasto contra o teto do mês).
 * O miolo recebe o que a tela quiser escrever (normalmente o %).
 */
export function Anel({ frac, tamanho = 64, espessura = 6, cor = "var(--graf-1)", rotulo, children }: {
  frac: number; tamanho?: number; espessura?: number; cor?: string; rotulo: string; children?: ReactNode;
}) {
  const ref = useRevelar<HTMLDivElement>();
  const meio = tamanho / 2;
  const r = (tamanho - espessura) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - limitar(frac));
  return (
    <div ref={ref} className="km-anel" role="img" aria-label={rotulo}
      style={{ width: tamanho, height: tamanho, ["--km-c" as string]: `${c.toFixed(2)}px`, ["--km-off" as string]: `${off.toFixed(2)}px` }}>
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} aria-hidden>
        <circle cx={meio} cy={meio} r={r} fill="none" stroke="color-mix(in srgb, var(--text) 10%, transparent)" strokeWidth={espessura} />
        <circle className="km-anel-arco" cx={meio} cy={meio} r={r} fill="none" stroke={cor} strokeWidth={espessura}
          strokeLinecap="round" strokeDasharray={`${c.toFixed(2)} ${c.toFixed(2)}`} transform={`rotate(-90 ${meio} ${meio})`} />
      </svg>
      {children != null && <span className="km-anel-centro">{children}</span>}
    </div>
  );
}

/**
 * Fila escalonada (a mesma `.mt-fila` da fundação) que também ANIMA A TROCA DE
 * ORDEM — o ranking que muda de líder ao trocar o período desliza cada linha
 * da posição antiga pra nova (FLIP), em vez de reembaralhar num quadro só.
 *
 * Identidade pela `key` de cada filho: o componente lembra onde cada chave
 * estava e, depois do render, anima a diferença com `translate` → `none`
 * (Web Animations — nada fica aplicado depois). A medida é `offsetTop/Left`,
 * que ignora transform: uma entrada ainda em curso não vira movimento falso.
 *
 * `suave` troca o percurso da entrada por opacidade — pra filhos de vidro ou
 * que carregam popover (ver `.km-suave` no CSS).
 */
export function FilaViva({ className = "", style, suave = false, children }: {
  className?: string; style?: CSSProperties; suave?: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const antes = useRef(new Map<string, { x: number; y: number }>());
  const lista = Children.toArray(children);
  const chaves = lista.map((f) => (isValidElement(f) ? String(f.key) : ""));
  let i = 0;
  // `Children.toArray` + `cloneElement` preserva a chave original (o mesmo
  // cuidado da `Fila`): renumerar remontaria a lista e a entrada rodaria de
  // novo em cima de dado que já estava lá.
  const filhos = lista.map((f) =>
    isValidElement<{ style?: CSSProperties }>(f)
      ? cloneElement(f, { style: { ["--mt-i" as string]: i++, ...f.props.style } })
      : f,
  );

  // Sem lista de dependências de propósito: a posição de referência precisa
  // ser a do ÚLTIMO render (a janela pode ter mudado de largura no meio), e
  // medir meia dúzia de linhas custa nada.
  useLayoutSeguro(() => {
    const el = ref.current;
    if (!el) return;
    const agora = new Map<string, { x: number; y: number }>();
    const nos = Array.from(el.children) as HTMLElement[];
    nos.forEach((n, k) => { if (chaves[k]) agora.set(chaves[k], { x: n.offsetLeft, y: n.offsetTop }); });
    const prev = antes.current;
    antes.current = agora;
    if (prev.size === 0 || menosMovimento()) return;
    const dur = duracaoCss("--duration-slow", 400);
    const curva = getComputedStyle(document.documentElement).getPropertyValue("--ease-smooth-out").trim() || "cubic-bezier(0.22, 1, 0.36, 1)";
    nos.forEach((n, k) => {
      const a = prev.get(chaves[k]);
      const b = agora.get(chaves[k]);
      if (!a || !b || typeof n.animate !== "function") return;
      const dx = a.x - b.x, dy = a.y - b.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: dur, easing: curva });
    });
  });

  const classe = ["mt-fila", "km-flip", suave ? "km-suave" : "", className].filter(Boolean).join(" ");
  return <div ref={ref} className={classe} style={style}>{filhos}</div>;
}

/**
 * O dado antigo fica na tela, esmaecido, enquanto o novo vem — sem esqueleto
 * e sem salto de altura. Os `NumeroVivo` de dentro contam do valor antigo pro
 * novo quando a resposta chega, que é a metade "fresco" do efeito.
 */
export function Revalidando({ ativo, children, className = "", style }: {
  ativo: boolean; children: ReactNode; className?: string; style?: CSSProperties;
}) {
  return (
    <div className={className ? `km-swr ${className}` : "km-swr"} data-rev={ativo ? "1" : undefined} aria-busy={ativo || undefined} style={style}>
      {children}
    </div>
  );
}

/** Selo curto "atualizando" pra acompanhar o esmaecido — o esmaecer sozinho
 *  não chega em quem não está olhando pro número naquele instante. */
export function Atualizando({ ativo, texto = "atualizando" }: { ativo: boolean; texto?: string }) {
  if (!ativo) return null;
  return (
    <span className="km-atualizando" role="status" aria-live="polite">
      <Icon name="loader" size={13} color="currentColor" /> {texto}
    </span>
  );
}

/**
 * Estado vazio. Diz o que falta e, quando dá, o que fazer — "sem dados" solto
 * faz a pessoa achar que a tela quebrou. `tom` pinta o ícone (semântico:
 * `var(--atencao)` pra "precisa de ação", neutro pra "só não houve venda").
 */
export function Vazio({ icone = "inbox", titulo, texto, acao, compacto = false, tom, className = "", style }: {
  icone?: string; titulo: string; texto?: ReactNode; acao?: ReactNode; compacto?: boolean;
  tom?: string; className?: string; style?: CSSProperties;
}) {
  return (
    <div className={className ? `km-vazio ${className}` : "km-vazio"} data-compacto={compacto ? "1" : undefined}
      style={{ ...(tom ? { ["--km-tom" as string]: tom } : null), ...style }}>
      <span className="km-vazio-ico" aria-hidden><Icon name={icone} size={compacto ? 18 : 22} color="currentColor" /></span>
      <div className="km-vazio-tit">{titulo}</div>
      {texto && <div className="km-vazio-txt">{texto}</div>}
      {acao && <div className="km-vazio-acao">{acao}</div>}
    </div>
  );
}
