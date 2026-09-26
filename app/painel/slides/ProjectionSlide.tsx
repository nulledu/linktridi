"use client";

import type { PanelConfig, SalesSnapshot } from "@/lib/types";
import { fmtBRL, fmtCurto } from "@/lib/format";
import { caminhoSuave, comprimento, corDaSerie } from "@/app/(plataforma)/ui/graficos";
import { NumeroVivo } from "@/app/(plataforma)/ui/micro";
import { PAREDE_EIXO, PAREDE_MONO } from "./parede";

// Projeção do mês em destaque + curva acumulada de faturamento (30 dias).
// A tinta é a da rampa (`corDaSerie(0)`), derivada do destaque da empresa —
// antes era `var(--roxo)` fixo e a parede não acompanhava a identidade.
export function ProjectionSlide({ sales, config }: { sales: SalesSnapshot; config: PanelConfig }) {
  const proj = sales.metrics?.projection ?? 0;
  const goal = config.monthlyRevenueGoal || 0;
  const pct = goal > 0 ? (proj / goal) * 100 : 0;
  const series = sales.metrics?.revenueSeries ?? [];
  // série acumulada (rumo à projeção) deixa a curva sempre ascendente.
  let acc = 0;
  const cum = series.map((d) => ({ ...d, value: (acc += d.value) }));
  const tinta = corDaSerie(0);

  return (
    <div style={{ width: "100%", maxWidth: 1140, ...PAREDE_MONO }}>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "0.08em", color: "var(--text-dim)" }}>
        PROJEÇÃO DO MÊS
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 40, marginTop: 4 }}>
        <div style={{ flex: "0 0 auto" }}>
          {/* O número CONTA: a parede se atualiza sozinha e ninguém está
              olhando no instante da troca — o movimento é o aviso. */}
          <div className="stat" style={{ fontSize: 144, lineHeight: 1, textShadow: `0 0 60px color-mix(in srgb, ${tinta} 30%, transparent)` }}>
            <NumeroVivo valor={proj} formatar={fmtBRL} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 18 }}>
            {/* Passar da meta é ESTADO, e estado sai da paleta semântica: verde
                significa uma coisa e não pode virar rosa quando a empresa troca
                o destaque. */}
            <span className="stat" style={{ fontSize: 64, color: pct >= 100 ? "var(--ok)" : tinta }}>
              <NumeroVivo valor={pct} formatar={(n) => `${n.toFixed(0)}%`} />
            </span>
            <span style={{ fontSize: 22, fontWeight: 600, color: "var(--text-dim)" }}>da meta prevista</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Curva valores={cum.map((d) => d.value)} tinta={tinta} />
        </div>
      </div>
    </div>
  );
}

/**
 * A curva do acumulado, na arte mono-rounded.
 *
 * A polilinha de segmentos retos virou curva MONÓTONA: a três metros o que se
 * lê de uma curva é a FORMA, e 30 pontos ligados por retas viram serrilha. A
 * versão monótona ainda garante que a curva não passe do ponto — num acumulado
 * um spline comum desenharia uma queda entre dois dias de ritmo diferente, e
 * acumulado que cai é impossível.
 */
function Curva({ valores, tinta }: { valores: number[]; tinta: string }) {
  const W = 520, H = 260, padE = 8, padD = 10, padT = 16, padB = 24;
  const d = valores.length ? valores : [0, 0];
  const n = d.length;
  const max = Math.max(...d, 1);
  const x = (i: number) => padE + (n <= 1 ? (W - padE - padD) / 2 : (i / (n - 1)) * (W - padE - padD));
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);

  const pts = d.map((v, i) => ({ x: x(i), y: y(v) }));
  const linha = caminhoSuave(pts);
  const base = H - padB;
  const area = `${linha} L${pts[n - 1].x.toFixed(1)},${base} L${pts[0].x.toFixed(1)},${base} Z`;
  const fim = d[n - 1];
  // Grade só HORIZONTAL: linha vertical num gráfico de tempo compete com o
  // traço e não ajuda a ler valor nenhum.
  const grade = [0, 1, 2, 3, 4].map((k) => (max / 4) * k);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 260 }} role="img"
      aria-label={`Faturamento acumulado do mês: ${fmtCurto(fim, true)} em ${n} dias`}>
      <defs>
        {/* A parada de gradiente não enxerga a cor de quem referencia o `fill`,
            só a que ela própria herda — a tinta vai escrita nela. */}
        <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tinta} stopOpacity="0.3" />
          <stop offset="100%" stopColor={tinta} stopOpacity="0" />
        </linearGradient>
      </defs>

      {grade.map((v, i) => (
        <line key={i} className="mono-grade-linha" x1={padE} x2={W - padD} y1={y(v)} y2={y(v)} />
      ))}

      <path d={area} fill={`url(#pg)`} />
      {/* `data-mt="desenhar"` fica: roda UMA vez, na montagem do slide — não
          depende de rolagem, de ponteiro nem de a aba estar visível. A tinta
          vai por `style` e não por atributo `stroke`, porque `.mono-serie`
          declara `stroke` no CSS e regra de classe vence atributo de
          apresentação. */}
      <path className="mono-serie" data-mt="desenhar" d={linha}
        style={{ stroke: tinta, ["--mono-comp" as string]: comprimento(pts) }} />

      {/* A queda até a linha de base é série de APOIO: cinza tracejado, para
          não disputar atenção com o dado. */}
      <line className="mono-serie" data-mono="apoio" x1={x(n - 1)} x2={x(n - 1)} y1={y(fim)} y2={base} />
      <circle className="mono-ponto" cx={x(n - 1)} cy={y(fim)} r="9" style={{ fill: tinta }} />
      <text className="mono-eixo-txt" style={PAREDE_EIXO} x={x(n - 1)} y={base + 18} textAnchor="end">
        {fmtCurto(fim, true)}
      </text>
    </svg>
  );
}
