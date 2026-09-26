"use client";

// ── Gráfico de área do ERP (vendas, comercial, analytics) ───────────────────
// Arte mono-rounded (a mesma de `ui/graficos.tsx`): curva monótona, grade só
// horizontal, eixo sem linha e traço que se desenha na primeira pintura.
//
// A COR continua vindo de quem chama: aqui ela quase sempre significa alguma
// coisa (verde = o que entrou no comercial), e o dia em que ela deixar de
// significar basta o chamador parar de passar. Por isso o `color` manda sobre
// a tinta padrão do conjunto.

import { useId, useRef, useState } from "react";
import { caminhoSuave, comprimento, curto, tetoRedondo } from "./ui/graficos";

export interface ChartPoint { day: string; value: number }

const dmLabel = (day: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day || "");
  if (m) return `${m[3]}/${m[2]}`;
  const w = /^(\d{4})-S(\d{2})$/.exec(day || "");
  if (w) return `Sem ${w[2]}`;
  const mo = /^(\d{4})-(\d{2})$/.exec(day || "");
  if (mo) return `${mo[2]}/${mo[1]}`;
  return day;
};
const fmtMoney = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const fmtNum = (n: number) => n.toLocaleString("pt-BR");

// Gráfico de área responsivo, com dica ao passar o ponteiro.
// O SVG estica em largura por `preserveAspectRatio="none"`; quem segura a
// espessura do traço é o `vector-effect: non-scaling-stroke` do `.mono-serie`,
// e os pontos ficam em HTML por cima — um <circle> dentro de um viewBox
// esticado sai OVAL.
export function AreaChart({ series, color, money, height = 170 }: { series: ChartPoint[]; color: string; money?: boolean; height?: number }) {
  const gid = "ac" + useId().replace(/:/g, "");
  const wrap = useRef<HTMLDivElement>(null);
  const [hi, setHi] = useState<number | null>(null);

  const data = series.length ? series : [{ day: "", value: 0 }];
  const n = data.length;

  const W = 480, H = height;
  // A folga da esquerda paga os rótulos do eixo Y; a de baixo, os dias.
  const padE = 38, padD = 10, padT = 12, padB = 20;
  // Teto REDONDO em vez do máximo cru: um teto cru põe a linha de grade em
  // 8.437, que ninguém lê — e sem grade nem rótulo o gráfico não dizia em que
  // ordem de grandeza estava (era o caso até aqui: nenhum eixo).
  const teto = tetoRedondo(Math.max(1, ...data.map((d) => d.value)));
  // O gráfico de 96px do Analytics não comporta quatro faixas.
  const nFaixas = H < 130 ? 2 : 4;
  const faixas = Array.from({ length: nFaixas + 1 }, (_, k) => (teto / nFaixas) * k);

  const x = (i: number) => padE + (n <= 1 ? (W - padE - padD) / 2 : (i / (n - 1)) * (W - padE - padD));
  const y = (v: number) => padT + (1 - v / teto) * (H - padT - padB);

  const pts = data.map((d, i) => ({ x: x(i), y: y(d.value) }));
  // Curva MONÓTONA, não um spline qualquer: entre uma venda de 100 e uma de 0
  // o spline comum desce abaixo de zero e desenha um prejuízo que não houve.
  const line = caminhoSuave(pts);
  const area = `${line} L${pts[n - 1].x.toFixed(2)},${H - padB} L${pts[0].x.toFixed(2)},${H - padB} Z`;

  // Ponteiro, não mouse: no celular a pessoa arrasta o dedo pela linha pra ler
  // os valores. Preso a `onMouseMove`, a dica simplesmente não existia ali.
  const onMove = (e: React.PointerEvent) => {
    const el = wrap.current; if (!el || n === 0) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width) return;
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHi(Math.round(frac * (n - 1)));
  };
  const sair = () => setHi(null);

  const pt = hi != null ? data[hi] : null;
  const leftPct = hi != null ? (x(hi) / W) * 100 : 0;
  const lastPct = { left: `${(x(n - 1) / W) * 100}%`, top: `${(y(data[n - 1].value) / H) * 100}%` };
  const fmt = money ? fmtMoney : fmtNum;

  return (
    <div ref={wrap} style={{ position: "relative", width: "100%", minWidth: 0 }}
      onPointerMove={onMove} onPointerLeave={sair} onPointerCancel={sair}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }} preserveAspectRatio="none"
        role="img" aria-label={`${n} pontos, máximo ${fmt(Math.max(0, ...data.map((d) => d.value)))}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.26" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grade só horizontal: num gráfico de tempo a linha vertical compete
            com o traço e não ajuda a ler valor nenhum. */}
        {faixas.map((v, k) => (
          <line key={k} className="mono-grade-linha" x1={padE} y1={y(v)} x2={W - padD} y2={y(v)} />
        ))}

        <path d={area} fill={`url(#${gid})`} />
        <path className="mono-serie" data-mt="desenhar" d={line}
          style={{ stroke: color, ["--mono-comp" as string]: comprimento(pts) }} />
        {pt && <line className="mono-cursor" x1={x(hi!)} y1={padT} x2={x(hi!)} y2={H - padB} />}
      </svg>

      {/* Rótulos de eixo — em HTML pelo mesmo motivo dos pontos: o viewBox
          estica só a largura, e um <text> dentro dele sai com as letras
          esticadas junto. Vertical usa px cru (a altura não estica); horizontal
          usa % (acompanha o mesmo esticamento do resto do palco). */}
      {faixas.map((v, k) => (
        <span key={`y${k}`} className="mono-eixo-txt" style={{
          position: "absolute", left: `${((padE - 6) / W) * 100}%`, top: y(v),
          transform: "translate(-100%, -50%)", whiteSpace: "nowrap", pointerEvents: "none",
        }}>{curto(v)}</span>
      ))}
      {data.map((d, k) => {
        // Um rótulo a cada N: 30 dias em 480 de viewBox viram uma mancha
        // preta. O primeiro e o último aparecem sempre.
        const salto = Math.max(1, Math.ceil(n / 6));
        if (k % salto !== 0 && k !== n - 1) return null;
        const ancora = k === 0 ? "start" : k === n - 1 ? "end" : "middle";
        return (
          <span key={`x${k}`} className="mono-eixo-txt" style={{
            position: "absolute", left: `${(x(k) / W) * 100}%`, top: H - 6,
            transform: `translate(${ancora === "start" ? "0" : ancora === "end" ? "-100%" : "-50%"}, -100%)`,
            whiteSpace: "nowrap", pointerEvents: "none",
          }}>{dmLabel(d.day)}</span>
        );
      })}

      {/* Ponto final — em HTML pelo mesmo motivo dos outros: o viewBox estica. */}
      <span style={{ position: "absolute", left: lastPct.left, top: lastPct.top, width: 8, height: 8, marginLeft: -4, marginTop: -4, borderRadius: "50%", background: color, pointerEvents: "none", boxShadow: `0 0 10px ${color}` }} />
      {/* ponto + dica sob o ponteiro */}
      {pt && (
        <>
          <span style={{ position: "absolute", left: `${leftPct}%`, top: `${(y(pt.value) / H) * 100}%`, width: 10, height: 10, marginLeft: -5, marginTop: -5, borderRadius: "50%", background: color, border: "2px solid var(--bg,#0b0b0f)", pointerEvents: "none" }} />
          <div style={{
            position: "absolute", left: `${leftPct}%`, top: 4, transform: `translateX(${leftPct > 72 ? "-100%" : leftPct < 14 ? "0" : "-50%"})`,
            background: "color-mix(in srgb, var(--surface-2,#1c1c22) 85%, transparent)", backdropFilter: "blur(12px)",
            border: "1px solid color-mix(in srgb, " + color + " 35%, var(--border))", borderRadius: 10, padding: "5px 10px",
            fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", pointerEvents: "none", boxShadow: "0 8px 24px rgba(0,0,0,.4)", zIndex: 6,
            fontVariantNumeric: "tabular-nums",
          }}>
            <span style={{ color: "var(--text-dim)", marginRight: 6 }}>{dmLabel(pt.day)}</span>
            <span style={{ color }}>{fmt(pt.value)}</span>
          </div>
        </>
      )}
    </div>
  );
}
