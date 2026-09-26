"use client";

// ── Tridify · Gráfico de linhas (§14) ───────────────────────────────────────
// Gráfico próprio (sem lib externa: o projeto usa SVG inline). Recursos:
// múltiplas séries, eixo secundário, legenda que OCULTA série no clique,
// tooltip por ponto com crosshair, skeleton de carregamento, estado vazio, e
// exportação (CSV sempre; PNG best-effort resolvendo as cores dos tokens).
//
// Arte mono-rounded, a mesma de `ui/graficos.tsx`: curva monótona, traço com
// ponta e junta arredondadas, grade só horizontal. A regra que organiza o
// desenho é que a COR não carrega o dado — a série principal é tinta cheia e
// as demais entram em cinza, separadas pelo RITMO do tracejado. Só continua
// colorida a série cuja cor significa alguma coisa (lucro, prejuízo,
// atenção): três linhas coloridas por card, em seis cards, viram arco-íris e
// ninguém lê qual é qual.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { caminhoSuave, comprimento, useEscalaX } from "../ui/graficos";
import { duracaoCss } from "../ui/micro";

export interface ChartSerie {
  key: string;
  label: string;
  cor: string;                       // pode ser var(--tf-chart-n)
  vals: (number | null)[];           // alinhado a `labels`
  axis?: "left" | "right";           // eixo secundário (ex.: ROAS junto de R$)
  fmt?: (v: number) => string;       // formatação no tooltip
}

const PAD = { t: 12, r: 14, b: 22, l: 14 };

// Cor COM SIGNIFICADO: verde de lucro, vermelho de prejuízo, âmbar de
// atenção. Nessas a cor É a informação, então ela manda sobre a tinta do
// conjunto. O resto (`--tf-chart-n`, `--azul`, `--roxo`) só existia pra
// diferenciar uma linha da outra — trabalho que aqui é do traço.
const SEMANTICA = /--(ok|perigo|atencao|tf-pos|tf-neg|tf-warn)\b/;
// Um tracejado por série de apoio: com duas ou três em cinza, o que separa
// uma da outra é o ritmo do traço.
const TRACEJADOS = ["4 4", "1 5", "9 4", "9 4 2 4"];
type Papel = { tinta: string; apoio: boolean; traco?: string };

export interface ChartMarcador { i: number; texto: string; cor?: string }

export function TfChart({ labels, series, height = 220, loading = false, vazio, titulo, marcadores, simples = false }: {
  labels: string[];
  series: ChartSerie[];
  height?: number;
  loading?: boolean;
  vazio?: React.ReactNode;
  titulo?: string;   // usado no nome do arquivo exportado
  marcadores?: ChartMarcador[];   // eventos (anotações) no eixo do tempo (§16)
  /**
   * Gráfico DE CARD: some a barra de legenda/CSV/PNG/zoom, que numa série
   * única viram três controles em volta de uma linha. O que fica é o que o
   * azulejo precisa — a linha, a grade discreta, os rótulos e o tooltip.
   * A aba de análise continua usando o completo.
   */
  simples?: boolean;
}) {
  const [oculta, setOculta] = useState<Set<string>>(new Set());
  const areaId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // Proporção travada (pedido do dono, 25/09): o palco era um viewBox de 640
  // esticado por `preserveAspectRatio="none"` — numa coluna de 1854px a linha
  // de 220px virava uma faixa achatada e os pontos, elipses. Agora o viewBox
  // tem a LARGURA REAL (nada estica na horizontal) e, fora do modo de card
  // (`simples`, cuja altura é a do azulejo), a altura cresce com a largura até
  // ~3:1, com teto de 420px — o gráfico largo ganha respiro em vez de achatar.
  const caixaRef = useRef<HTMLDivElement>(null);
  const [larg, setLarg] = useState(640);
  // Card de altura fixa (`container-type: size`, a grade do painel) não pode
  // crescer — quem manda na altura é ele e crescer brigaria com a medição.
  // Ali a proporção é travada pelo outro lado: a LARGURA útil tem teto de 5×
  // a altura e o gráfico fica centralizado.
  const [alturaPresa, setAlturaPresa] = useState(simples);
  useEffect(() => {
    const el = caixaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    if (!simples) {
      let a: HTMLElement | null = el.parentElement, presa = false;
      for (let k = 0; a && k < 8 && !presa; k++, a = a.parentElement) presa = getComputedStyle(a).containerType === "size";
      setAlturaPresa(presa);
    }
    const medir = () => { const w = Math.round(el.clientWidth); if (w > 0) setLarg((a) => (Math.abs(a - w) > 1 ? w : a)); };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = alturaPresa ? height : Math.round(Math.max(height, Math.min(larg / 3, 420)));
  const W = Math.max(200, alturaPresa && !simples ? Math.min(larg, H * 5) : larg);
  // O palco estica por `preserveAspectRatio="none"` e o traço é
  // `non-scaling-stroke`: o `--mono-comp` tem que sair em PIXEL DE TELA, senão
  // o `stroke-dasharray` fica curto e a linha nasce com buracos.
  const escalaX = useEscalaX(svgRef, W);

  // Zoom por arrasto: `zoom` guarda o intervalo ABSOLUTO; `L`/`SER` são a VIEW
  // (fatia) que o resto do componente usa — assim eixos, hover e export já
  // trabalham só no trecho ampliado. `drag` = seleção em andamento (rel à view).
  const [zoom, setZoom] = useState<{ a: number; b: number } | null>(null);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const L = zoom ? labels.slice(zoom.a, zoom.b + 1) : labels;
  const SER = zoom ? series.map((s) => ({ ...s, vals: s.vals.slice(zoom.a, zoom.b + 1) })) : series;

  const ativas = SER.filter((s) => !oculta.has(s.key));

  // O esqueleto SAI por cima do conteúdo (receita `.t-skel`): quando o dado
  // chega o gráfico já está montado embaixo e o esqueleto se dissolve em vez
  // de trocar por corte seco. Ele fica montado um instante DEPOIS de `loading`
  // cair — sumindo no mesmo quadro não haveria o que transicionar.
  const [esqueleto, setEsqueleto] = useState(loading);
  useEffect(() => {
    if (loading) { setEsqueleto(true); return; }
    const t = setTimeout(() => setEsqueleto(false), duracaoCss("--reveal-dur", 400) + 60);
    return () => clearTimeout(t);
  }, [loading]);

  // Min/max por EIXO (esquerdo e direito são normalizados separado).
  const faixa = useMemo(() => {
    const de = (grupo: ChartSerie[]) => {
      const nums = grupo.flatMap((s) => s.vals.filter((v): v is number => v != null));
      if (!nums.length) return { min: 0, max: 1 };
      let min = Math.min(...nums), max = Math.max(...nums);
      if (min === max) { max = min + 1; }
      return { min: Math.min(0, min), max };
    };
    return { left: de(ativas.filter((s) => s.axis !== "right")), right: de(ativas.filter((s) => s.axis === "right")) };
  }, [ativas]);

  // Papel de cada série no desenho. Sai da lista INTEIRA (não só das visíveis)
  // de propósito: se o papel dependesse de quem está ligado, ocultar a
  // primeira repintaria todas as outras e a legenda mentiria enquanto a série
  // estivesse desligada.
  const papeis = new Map<string, Papel>();
  {
    let temPrincipal = false, apoios = 0;
    for (const s of SER) {
      if (SEMANTICA.test(s.cor)) { papeis.set(s.key, { tinta: s.cor, apoio: false }); continue; }
      if (!temPrincipal) { temPrincipal = true; papeis.set(s.key, { tinta: "var(--mono-tinta)", apoio: false }); continue; }
      papeis.set(s.key, { tinta: "var(--mono-apoio)", apoio: true, traco: TRACEJADOS[apoios++ % TRACEJADOS.length] });
    }
  }
  const papelDe = (s: ChartSerie): Papel => papeis.get(s.key) ?? { tinta: "var(--mono-apoio)", apoio: true, traco: TRACEJADOS[0] };

  const n = L.length;
  const x = (i: number) => PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number, axis: "left" | "right") => {
    const f = axis === "right" ? faixa.right : faixa.left;
    const t = (v - f.min) / (f.max - f.min || 1);
    return H - PAD.b - t * (H - PAD.t - PAD.b);
  };

  // Cada TRECHO contínuo vira um caminho próprio: a série tem buraco (dia sem
  // gasto vem null) e emendar por cima do buraco inventa dado que não existe.
  const trechosDe = (s: ChartSerie) => {
    const ax = s.axis === "right" ? "right" : "left";
    const out: { x: number; y: number }[][] = [];
    let atual: { x: number; y: number }[] = [];
    s.vals.forEach((v, i) => {
      if (v == null) { if (atual.length) out.push(atual); atual = []; return; }
      atual.push({ x: x(i), y: y(v, ax) });
    });
    if (atual.length) out.push(atual);
    return out;
  };

  // Eventos de PONTEIRO (não de mouse): o gráfico só respondia a mouse, então
  // no celular não havia como ver valor nem arrastar pra dar zoom.
  const idxDe = (e: React.PointerEvent) => {
    const svg = svgRef.current; if (!svg || n === 0) return 0;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(n - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1))));
  };
  function onDown(e: React.PointerEvent) { e.currentTarget.setPointerCapture?.(e.pointerId); const i = idxDe(e); setHover(i); setDrag({ a: i, b: i }); }
  function onMove(e: React.PointerEvent) {
    const i = idxDe(e);
    setHover(i);
    if (drag) setDrag({ a: drag.a, b: i });
  }
  function onUp() {
    if (drag) {
      const a = Math.min(drag.a, drag.b), b = Math.max(drag.a, drag.b);
      // Precisa de pelo menos 2 pontos pra ampliar (senão foi só um clique).
      if (b - a >= 1) { const base = zoom ? zoom.a : 0; setZoom({ a: base + a, b: base + b }); }
      setDrag(null);
    }
  }

  const baixarCSV = () => {
    const head = ["dia", ...SER.map((s) => s.label)].join(";");
    const rows = L.map((lb, i) => [lb, ...SER.map((s) => { const v = s.vals[i]; return v == null ? "" : String(v).replace(".", ","); })].join(";"));
    baixar(`${slug(titulo)}.csv`, "﻿" + [head, ...rows].join("\n"), "text/csv;charset=utf-8");
  };

  const baixarPNG = () => {
    const svg = svgRef.current; if (!svg) return;
    try {
      const clone = svg.cloneNode(true) as SVGSVGElement;
      // O clone é um SVG SOLTO: nem a folha de estilo nem os tokens chegam
      // nele. Por isso tudo o que define o traço (cor, espessura, tracejado)
      // vem do valor COMPUTADO do elemento vivo — inclusive por cima do style
      // inline, que também é `var(--…)`. Sem isso a linha sai preta e com 1px,
      // e o PNG não parece o gráfico que a pessoa está vendo.
      const vivos = svg.querySelectorAll<SVGElement>("[data-cor]");
      clone.querySelectorAll<SVGElement>("[data-cor]").forEach((el, i) => {
        const cs = getComputedStyle(vivos[i]);
        if (cs.stroke && cs.stroke !== "none") { el.setAttribute("stroke", cs.stroke); el.style.stroke = cs.stroke; }
        if (cs.fill && cs.fill !== "none") { el.setAttribute("fill", cs.fill); el.style.fill = cs.fill; }
        if (cs.strokeWidth) { el.setAttribute("stroke-width", cs.strokeWidth); el.style.strokeWidth = cs.strokeWidth; }
        if (cs.strokeDasharray && cs.strokeDasharray !== "none") el.setAttribute("stroke-dasharray", cs.strokeDasharray);
      });
      clone.setAttribute("width", String(W)); clone.setAttribute("height", String(H));
      const fundo = getComputedStyle(document.body).backgroundColor || "#0b0d12";
      const xml = new XMLSerializer().serializeToString(clone);
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = W * 2; cv.height = H * 2;
        const ctx = cv.getContext("2d"); if (!ctx) return;
        ctx.scale(2, 2); ctx.fillStyle = fundo; ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, 0, 0);
        cv.toBlob((b) => { if (b) baixarBlob(`${slug(titulo)}.png`, b); }, "image/png");
      };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    } catch { /* export PNG é best-effort; CSV sempre funciona */ }
  };

  const semDados = !SER.length || L.length < 2 || ativas.every((s) => s.vals.every((v) => v == null));

  const corpo = semDados ? (
    <>{vazio ?? <div style={{ height: H, display: "grid", placeItems: "center", color: "var(--text-dim)", fontSize: 12.5 }}>Sem dados para o gráfico.</div>}</>
  ) : (
    <div ref={wrapRef} style={{ position: "relative", maxWidth: W, marginInline: "auto" }}>
      {/* Legenda (clicável) + exportação — fora do modo simples */}
      {!simples && <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        {series.map((s) => {
          const off = oculta.has(s.key);
          const p = papelDe(s);
          return (
            <button key={s.key} onClick={() => setOculta((prev) => { const nx = new Set(prev); nx.has(s.key) ? nx.delete(s.key) : nx.add(s.key); return nx; })}
              title={off ? "Mostrar série" : "Ocultar série"}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 2, fontSize: 12, fontWeight: 700, color: off ? "var(--text-dim)" : "var(--text)", opacity: off ? 0.55 : 1 }}>
              <Amostra papel={p} />
              <span style={{ textDecoration: off ? "line-through" : "none" }}>{s.label}{s.axis === "right" ? " (dir.)" : ""}</span>
            </button>
          );
        })}
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4, alignItems: "center" }}>
          {zoom && <button onClick={() => setZoom(null)} title="Voltar ao período todo" style={{ ...expBtn, width: "auto", padding: "0 9px", gap: 5, fontSize: 11.5, fontWeight: 700, color: "var(--primary-texto, var(--primary))" }}><Icon name="refresh" size={12} color="var(--primary-texto)" /> Zoom</button>}
          <button onClick={baixarCSV} title="Baixar CSV" style={expBtn}><Icon name="file-text" size={13} color="var(--text-dim)" /></button>
          <button onClick={baixarPNG} title="Baixar PNG" style={expBtn}><Icon name="photo" size={13} color="var(--text-dim)" /></button>
        </span>
      </div>}

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block", overflow: "visible", cursor: "crosshair", touchAction: "pan-y" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onMouseLeave={() => { setHover(null); setDrag(null); }}>
        {/* Grade só horizontal: num gráfico de tempo a linha vertical compete
            com o traço e não ajuda a ler valor nenhum. */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const yy = PAD.t + (H - PAD.t - PAD.b) * f;
          return <line key={f} data-cor className="mono-grade-linha" x1={PAD.l} y1={yy} x2={W - PAD.r} y2={yy} />;
        })}
        {/* banda de seleção (arrastando pra dar zoom) */}
        {drag && Math.abs(drag.b - drag.a) >= 1 && (
          <rect x={x(Math.min(drag.a, drag.b))} y={PAD.t} width={Math.abs(x(drag.b) - x(drag.a))} height={H - PAD.t - PAD.b}
            fill="color-mix(in srgb, var(--primary) 16%, transparent)" stroke="var(--primary)" strokeWidth={1} strokeDasharray="3 3" />
        )}
        {/* Marcadores de anotação (§16): linha vertical + bandeirinha no dia do
            evento. Ajusta o índice pra VIEW (some se está fora do zoom). */}
        {(marcadores ?? []).map((mk, k) => {
          const rel = zoom ? mk.i - zoom.a : mk.i;
          if (rel < 0 || rel >= n) return null;
          const cor = mk.cor ?? "var(--tf-gold, #b9975b)";
          return (
            <g key={k}>
              <line x1={x(rel)} y1={PAD.t} x2={x(rel)} y2={H - PAD.b} stroke={cor} strokeWidth={1} strokeDasharray="2 2" opacity={0.55} />
              <polygon points={`${x(rel)},${PAD.t} ${x(rel) + 7},${PAD.t + 3} ${x(rel)},${PAD.t + 6}`} fill={cor} />
              <title>{mk.texto}</title>
            </g>
          );
        })}
        {/* Área sob a curva — SÓ no modo simples com uma série: é a assinatura
            dos gráficos do design de referência (linha com degradê suave até a
            base). Com duas séries a área de uma cobriria a outra; ali a
            leitura é da comparação, e área não ajuda. Stops via STYLE porque
            atributo de apresentação não aceita var(). */}
        {simples && ativas.filter((s) => !papelDe(s).apoio).length === 1 && (() => {
          // A área acompanha a série PRINCIPAL; a de apoio (meta, ano passado)
          // fica só na linha tracejada — sombrear a meta afirmaria um volume
          // que ela não tem.
          const s0 = ativas.find((s) => !papelDe(s).apoio)!;
          const p = papelDe(s0);
          const base = H - PAD.b;
          return (
            <g aria-hidden>
              <defs>
                <linearGradient id={`${areaId}-a`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: p.tinta, stopOpacity: 0.18 }} />
                  <stop offset="100%" style={{ stopColor: p.tinta, stopOpacity: 0 }} />
                </linearGradient>
              </defs>
              {trechosDe(s0).map((tr, i) => tr.length >= 2 && (
                <path key={i} d={`${caminhoSuave(tr)} L${tr[tr.length - 1].x.toFixed(2)},${base} L${tr[0].x.toFixed(2)},${base} Z`}
                  fill={`url(#${areaId}-a)`} style={{ color: p.tinta }} />
              ))}
            </g>
          );
        })()}
        {/* crosshair — e a linha HORIZONTAL no valor apontado (porte do
            DGCharts/MPAndroidChart: o highlight de lá marca as duas
            coordenadas do dado, não só o dia). Segue o valor da série
            principal; a de apoio não ganha régua. */}
        {hover != null && !drag && <line className="mono-cursor" x1={x(hover)} y1={PAD.t} x2={x(hover)} y2={H - PAD.b} />}
        {hover != null && !drag && H >= 110 && (() => {
          // Régua horizontal só no gráfico alto: na faixa de 72px ela cruzava
          // a curva inteira e virava ruído, não leitura.
          const s0 = ativas.find((s) => !papelDe(s).apoio);
          const v = s0?.vals[hover];
          if (s0 == null || v == null) return null;
          return <line className="mono-cursor" x1={PAD.l} y1={y(v, s0.axis === "right" ? "right" : "left")} x2={W - PAD.r} y2={y(v, s0.axis === "right" ? "right" : "left")} />;
        })()}
        {/* linhas */}
        {ativas.map((s) => {
          const p = papelDe(s);
          const trechos = trechosDe(s);
          return (
            <path key={s.key} data-cor className="mono-serie" data-mono={p.apoio ? "apoio" : undefined} data-mt="desenhar"
              d={trechos.map(caminhoSuave).join(" ")} fill="none" stroke={p.tinta}
              style={{
                stroke: p.tinta,
                ...(p.traco ? { strokeDasharray: p.traco } : null),
                ["--mono-comp" as string]: trechos.reduce((t, tr) => t + comprimento(tr, escalaX), 0),
              }} />
          );
        })}
        {/* Geometrias de ponto — porte do LiveCharts2 (github.com/Live-Charts/
            LiveCharts2, pedido do dono 18/09): a assinatura de lá é todo dado
            MARCADO com um círculo de miolo claro e contorno na cor da série,
            não só o ponto do hover. Só na série principal (a de apoio fica
            quieta, como sempre) e só até 32 pontos — acima disso os círculos
            grudam um no outro e a linha vira colar de contas. */}
        {ativas.map((s) => {
          const p = papelDe(s);
          if (p.apoio || n > 32) return null;
          return (
            <g key={`pts-${s.key}`} aria-hidden>
              {s.vals.map((v, i) => v == null ? null : (
                <circle key={i} className="tf-ponto" cx={x(i)} cy={y(v, s.axis === "right" ? "right" : "left")} r={2.8}
                  fill="var(--surface)" strokeWidth={1.6} style={{ stroke: p.tinta, ["--tf-pi" as string]: i }} />
              ))}
            </g>
          );
        })}
        {/* pontos no hover */}
        {hover != null && ativas.map((s) => {
          const v = s.vals[hover]; if (v == null) return null;
          const p = papelDe(s);
          return <circle key={s.key} data-cor className="mono-ponto" cx={x(hover)} cy={y(v, s.axis === "right" ? "right" : "left")} r={3.6}
            fill={p.tinta} stroke="var(--bg)" style={{ fill: p.tinta }} />;
        })}
      </svg>

      {/* Tooltip como MARKER (porte do DGCharts): o balão gruda no PONTO
          apontado da série principal — acima dele, ou abaixo quando o ponto
          está no teto do gráfico. Duas contenções que a 1ª versão não tinha e
          que eram o "balão entrando pro gráfico" (18/09): num gráfico CURTO
          (a faixa de 72px dos cards de dinheiro) o balão é mais alto que o
          próprio desenho, então ali ele volta a flutuar COLADO NO TOPO — fora
          da curva, nunca por cima dela; e no gráfico alto o Y do ponto é
          GRAMPEADO pra o balão nunca vazar do card (vazando, o overflow do
          widget o cortava no meio, o "bugado"). Some enquanto arrasta. */}
      {hover != null && !drag && (() => {
        const curto = H < 110;
        const s0 = ativas.find((s) => !papelDe(s).apoio) ?? ativas[0];
        const v0 = s0?.vals[hover];
        const yBruto = v0 != null && s0 ? y(v0, s0.axis === "right" ? "right" : "left") : PAD.t + 30;
        // Grampo: acima de 96px o balão abre pra cima (precisa de ~90px);
        // abaixo disso abre pra baixo e não pode passar do pé do gráfico.
        const yPx = Math.max(PAD.t, Math.min(H - PAD.b, yBruto));
        const cabeAcima = yPx > 96;
        return (
        <div style={{
          position: "absolute",
          top: curto ? -6 : `${(yPx / H) * 100}%`,
          left: `${(x(hover) / W) * 100}%`,
          transform: `translateX(${hover > n / 2 ? "-108%" : "8px"}) translateY(${curto ? "-100%" : cabeAcima ? "calc(-100% - 10px)" : "10px"})`,
          pointerEvents: "none", background: "var(--surface-3, var(--surface-2))", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px",
          fontSize: 11.5, boxShadow: "0 8px 24px -12px rgba(0,0,0,.5)", minWidth: 120, zIndex: 2,
        }}>
          <div style={{ fontWeight: 800, color: "var(--text-dim)", marginBottom: 4 }}>{L[hover]}</div>
          {ativas.map((s) => {
            const v = s.vals[hover];
            return (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <Amostra papel={papelDe(s)} />
                <span style={{ color: "var(--text-dim)", flex: 1 }}>{s.label}</span>
                <span className="stat" style={{ fontWeight: 800, color: "var(--text)" }}>{v == null ? "—" : (s.fmt ? s.fmt(v) : String(v))}</span>
              </div>
            );
          })}
        </div>
        );
      })()}
    </div>
  );

  return (
    <div ref={caixaRef} className={`t-skel${loading ? "" : " is-revealed"}`} style={esqueleto ? { minHeight: H } : undefined}>
      {corpo}
      {esqueleto && <SkeletonGrafico />}
    </div>
  );
}

/** Amostra do traço, pra legenda e tooltip. Repete o RITMO (cheio × tracejado)
 *  e não só a cor: com as séries em tinta e cinza, duas amostras que só
 *  diferissem na cor ficariam idênticas — e no PNG em preto e branco também. */
function Amostra({ papel }: { papel: Papel }) {
  return (
    <svg width={14} height={4} viewBox="0 0 14 4" aria-hidden style={{ flex: "none", overflow: "visible" }}>
      <line x1={0} y1={2} x2={14} y2={2} stroke={papel.tinta} strokeWidth={papel.apoio ? 2 : 3}
        strokeLinecap="round" strokeDasharray={papel.traco} />
    </svg>
  );
}

const expBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 24, borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer" };

/** Esqueleto da receita `.t-skel`: fica POR CIMA do conteúdo e se dissolve
 *  quando o dado chega. Nunca captura ponteiro — depois da revelação ele ainda
 *  está montado por um instante, e um véu invisível engoliria o clique. */
function SkeletonGrafico() {
  return (
    <div className="t-skel-skeleton is-pulsing" aria-hidden style={{ pointerEvents: "none" }}>
      <div style={{ height: "100%", borderRadius: 14, background: "var(--mono-palco)", border: "1px solid var(--border)" }} />
    </div>
  );
}

const slug = (t?: string) => (t || "grafico").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
function baixar(nome: string, conteudo: string, tipo: string) { baixarBlob(nome, new Blob([conteudo], { type: tipo })); }
function baixarBlob(nome: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
