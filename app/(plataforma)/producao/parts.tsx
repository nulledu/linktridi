"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ProductionSnapshot, Trend, DayPoint } from "@/lib/producao";
import { Icon } from "../Icon";
import { McCarregando } from "../ui/monocharts/SmoothRing";
import { agendarComRecuo } from "../ui/usePoll";
import { caminhoSuave } from "../ui/graficos";
import { PageHead } from "../ui/mobile";

export const fmt = (n: number) => n.toLocaleString("pt-BR");

// Hook único: busca o snapshot de /api/producao (com período) e revalida a 60s.
export function useProduction(query = "", retrato?: ProductionSnapshot | null): { snap: ProductionSnapshot | null; err: boolean } {
  const [snap, setSnap] = useState<ProductionSnapshot | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    // Retrato de prova: a tela roda com o dado na mão e NENHUMA requisição sai.
    // É o que permite olhar a Visão geral sem credencial do ERP — e sem isso
    // ela ficou tempo demais sem ninguém ver de fato o que ela mostra.
    if (retrato) return;
    let active = true;
    async function load() {
      try {
        const r = await fetch(`/api/producao${query ? "?" + query : ""}`, { cache: "no-store" });
        const d = await r.json();
        if (!active) return;
        if (d?.updatedAt) { setSnap(d); setErr(false); }
        else setErr(true);
      } catch { /* mantém estado */ }
    }
    load();
    // Aba em segundo plano não recarrega (ver CLAUDE.md, "o tick comum tem que
    // voltar VAZIO"); ao voltar pra aba, atualiza na hora.
    // 1min pra quem está mexendo; recua até 5min na tela aberta e esquecida
    // (o `document.hidden` não pega o monitor secundário — ver `usePoll.ts`).
    const parar = agendarComRecuo(load, 60_000, 300_000);
    return () => { active = false; parar(); };
  }, [query, retrato]);
  return { snap: retrato ?? snap, err: retrato ? false : err };
}

// O cabeçalho de página que morava aqui virou o `PageHead` de ui/mobile.tsx —
// um só para o sistema inteiro. Ver o comentário lá.

// Chip de variação (subiu/desceu), neutro quando 0.
export function DeltaChip({ pct }: { pct: number }) {
  const neutral = pct === 0;
  const up = pct > 0;
  const color = neutral ? "var(--text-dim)" : up ? "var(--ok)" : "var(--perigo)";
  // Seta em Tabler, não em ↑/↓/→: glifo tipográfico usado como ícone muda de
  // desenho e de peso a cada fonte do sistema, e é o que a regra "nada de
  // emoji, tudo Tabler" existe pra tirar da interface. Mesmos nomes do
  // `KpiDelta` de ui/primitives.tsx — um só vocabulário de variação.
  const icone = neutral ? "minus" : up ? "trending-up" : "trending-down";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 12, fontWeight: 800, color,
      background: `color-mix(in srgb, ${color} 15%, transparent)`,
      padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap",
    }}>
      <Icon name={icone} size={13} color={color} />
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

const dmLabel = (day: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day || "");
  return m ? `${m[3]}/${m[2]}` : day;
};

// Mini gráfico de linha — leve, sem eixos, com tooltip ao passar o mouse:
// mostra a data e a quantidade exata daquele ponto.
//
// A arte é a mono-rounded do sistema (ver `ui/graficos.tsx`): o TRAÇO é tinta
// (`.mono-serie`) e a cor do cartão fica reservada ao ponto — a série não é o
// que precisa ser distinguido aqui, já que cada cartão tem uma só.
export function Sparkline({ days, color, height = 44 }: { days: DayPoint[]; color: string; height?: number }) {
  const W = 220, H = height, pad = 4;
  const max = Math.max(1, ...days.map((d) => d.value));
  const n = days.length;
  const x = (i: number) => pad + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad * 2));
  const y = (v: number) => pad + (H - pad * 2) - (v / max) * (H - pad * 2);
  // Curva monótona no lugar de segmentos retos. Monótona, e não um spline
  // qualquer, porque spline comum ULTRAPASSA o ponto: entre um dia de 40 peças
  // e um dia parado a curva desceria abaixo de zero e o cartão mostraria uma
  // produção negativa que não existiu. Ver `caminhoSuave`.
  const pts = days.map((d, i) => ({ x: x(i), y: y(d.value) }));
  const linha = caminhoSuave(pts);
  const area = pts.length
    ? `${linha} L${pts[n - 1].x.toFixed(1)},${H - pad} L${pts[0].x.toFixed(1)},${H - pad} Z`
    : "";
  // `useId` e não a cor: dois cartões da mesma cor dividiam o mesmo id de
  // degradê, e no SVG o primeiro nó com aquele id vence para todos.
  const id = useId().replace(/:/g, "");
  const wrap = useRef<HTMLDivElement>(null);
  const [hi, setHi] = useState<number | null>(null);

  // Ponteiro em vez de mouse: no celular não existe hover, então a data/valor do
  // ponto só apareciam no desktop. Com pointer, o toque (pointerdown) marca o
  // ponto; o arrastar do dedo NÃO é capturado, senão roubaria a rolagem da página.
  const onMove = (e: React.PointerEvent) => {
    const el = wrap.current;
    if (!el || n === 0) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHi(Math.round(frac * (n - 1)));
  };
  const hx = hi != null ? (x(hi) / W) * 100 : 0;
  const pt = hi != null ? days[hi] : null;

  return (
    <div ref={wrap} style={{ position: "relative", touchAction: "pan-y" }}
      onPointerDown={onMove}
      onPointerMove={(e) => { if (e.pointerType !== "touch") onMove(e); }}
      onPointerLeave={() => setHi(null)}
      onPointerCancel={() => setHi(null)}>
      {/* `color: var(--mono-tinta)` no SVG é o que alimenta o `currentColor` das
          paradas do degradê — parada de gradiente não enxerga a cor de quem
          referencia o `fill`, só a que ela própria herda. */}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block", color: "var(--mono-tinta)" }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id})`} />
        {/* Sem `data-mt="desenhar"` aqui, de propósito: `.mono-serie` usa
            `non-scaling-stroke`, e com ele o navegador mede o tracejado em
            PIXELS DE TELA. Num viewBox de 220 esticado para 380px, o
            `--mono-comp` (220 e poucos) viraria dash de 220px + vão de 220px e
            o fim do traço nasceria invisível — medido no Chrome. */}
        <path className="mono-serie" d={linha} />
        {pt && <line className="mono-cursor" x1={x(hi!)} y1={pad} x2={x(hi!)} y2={H - pad} />}
        <circle cx={pt ? x(hi!) : x(n - 1)} cy={y(pt ? pt.value : days[n - 1]?.value ?? 0)} r="3.5" fill={color} />
      </svg>
      {pt && (
        <div style={{
          position: "absolute", top: 1, left: `${hx}%`,
          transform: `translateX(${hx > 72 ? "-100%" : hx < 14 ? "0" : "-50%"})`,
          background: "color-mix(in srgb, var(--surface-2,#1c1c22) 85%, transparent)", backdropFilter: "blur(10px)",
          border: "1px solid var(--border)", borderRadius: 8,
          padding: "3px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", pointerEvents: "none",
          boxShadow: "0 6px 20px rgba(0,0,0,.35)", zIndex: 5,
        }}>
          <span style={{ color: "var(--text-dim)" }}>{dmLabel(pt.day)}</span>{" "}
          <span style={{ color }}>{fmt(pt.value)}</span>
        </div>
      )}
    </div>
  );
}

// Card grande com estado atual + variação + série 7d + média.
export function TrendCard({
  icon, label, current, trend, color, unit = "/dia",
}: { icon: string; label: string; current: number; trend: Trend; color: string; unit?: string }) {
  return (
    // Casca Monocharts; a série da faísca é a TINTA DA PESSOA — quem diz qual
    // métrica é são o ícone e o número, não o traço.
    <div className="mc-card" style={{ minHeight: 0, justifyContent: "flex-start", padding: "18px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
        <span style={{ width: 38, height: 38, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
          <Icon name={icon} size={21} color={color} />
        </span>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{label}</span>
        <span style={{ marginLeft: "auto" }}><DeltaChip pct={trend.deltaPct} /></span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 4 }}>
        <span className="stat" style={{ fontSize: "clamp(38px, 17cqi, 52px)", color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{fmt(current)}</span>
        <span style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 6 }}>na fila agora</span>
      </div>

      <div style={{ marginTop: 14 }}>
        <Sparkline days={trend.days} color="var(--graf-1)" />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--text-dim)", marginTop: 10 }}>
        <span>Média {trend.avg}{unit} (7d)</span>
        <span>Hoje {trend.today} · ontem {trend.yesterday}</span>
      </div>
    </div>
  );
}

// Card compacto de fluxo com mini série. Por padrão mostra o valor de hoje;
// com period=true mostra o TOTAL do período selecionado (com hoje no rodapé).
export function FlowCard({ icon, label, trend, color, period }: { icon: string; label: string; trend: Trend; color: string; period?: boolean }) {
  return (
    <div className="mc-card" style={{ minHeight: 0, justifyContent: "flex-start", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Icon name={icon} size={15} color={color} />
        <span className="mc-rot" style={{ flex: 1 }}>{label}</span>
        <span style={{ marginLeft: "auto", flex: "none" }}><DeltaChip pct={trend.deltaPct} /></span>
      </div>
      <div className="stat" style={{ fontSize: 30, color, fontVariantNumeric: "tabular-nums" }}>{fmt(period ? trend.total : trend.today)}</div>
      <div style={{ marginTop: 8 }}><Sparkline days={trend.days} color="var(--graf-1)" height={32} /></div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>
        {period ? `no período · hoje ${fmt(trend.today)} · média ${trend.avg}/dia` : `média ${trend.avg}/dia · ${trend.days.length} dias`}
      </div>
    </div>
  );
}

// Card de status estático (contagem na fila) — usado em Design/Logística.
export function StatusCard({ icon, label, value, desc, color }: { icon: string; label: string; value: number; desc?: string; color: string }) {
  return (
    <div className="mc-card" style={{ minHeight: 0, justifyContent: "flex-start", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
          <Icon name={icon} size={18} color={color} />
        </span>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{label}</span>
      </div>
      <div className="stat" style={{ fontSize: "clamp(30px, 14cqi, 38px)", color, fontVariantNumeric: "tabular-nums" }}>{fmt(value)}</div>
      {desc && <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>{desc}</div>}
    </div>
  );
}

export function SectionTitle({ children, icon }: { children: React.ReactNode; icon: string }) {
  return (
    <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em", margin: "22px 0 10px" }}>
      <Icon name={icon} size={16} />
      {children}
    </h2>
  );
}

// A fileira de abas que morava aqui virou o `Abas` de ui/Abas.tsx — a mesma
// peça de Pessoas, com UMA pílula que viaja em vez de cada botão pintar o
// próprio fundo. Ver o comentário lá.

export function Loading({ title, err }: { title: string; err: boolean }) {
  if (err) {
    return (
      // O mesmo `PageHead` do estado carregado, e não um h1 à mão: era daqui
      // que vinha o salto de tamanho do título quando os dados chegavam.
      <div>
        {title && <PageHead title={title} />}
        <div className="glass" style={{ marginTop: title ? 0 : 22, padding: 40, borderRadius: 22, textAlign: "center", color: "var(--text-dim)" }}>
          Não foi possível carregar os dados do ERP.
        </div>
      </div>
    );
  }
  // O loader do Monocharts (SmoothRing, na tinta da pessoa) no lugar do
  // esqueleto genérico — pedido explícito: os loaders também vêm do repo.
  return (
    <div>
      {title && <PageHead title={title} />}
      <McCarregando />
    </div>
  );
}

// `agoLabel` também foi para ui/mobile.tsx, ao lado de quem o exibe. Existia
// copiado em cinco arquivos.
