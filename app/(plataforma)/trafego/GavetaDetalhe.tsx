"use client";

// Tráfego Pago — gaveta lateral de detalhes. Ao clicar numa linha da tabela
// (conta/campanha/conjunto/anúncio) abre aqui, sem tirar o usuário da tela.
// Mostra métricas completas + tendência (dados reais da própria linha).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { AdMetrics, SparkPonto } from "@/lib/meta-ads";
import { fmtBRL2, fmtNum } from "@/lib/format";
import { Icon } from "../Icon";
import { grade } from "../ui/grade";
import { LinkDeVenda } from "./LinkDeVenda";
import { BotaoIcone } from "../ui/controles";

export interface DetalheItem { tipo: "conta" | "campanha" | "conjunto" | "anuncio"; id?: string; nome: string; sub?: string; thumb?: string | null; m: AdMetrics; spark?: SparkPonto[] }

const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const pct = (n: number) => n.toFixed(2) + "%";
const roasStr = (r: number | null) => (r == null ? "—" : r.toFixed(2) + "×");
const roasColor = (r: number | null) => (r == null ? "var(--text-dim)" : r >= 2 ? "var(--ok)" : r >= 1 ? "var(--atencao)" : "var(--perigo)");
const opt = (n: number | null) => (n == null ? "—" : fmtBRL2(n));
const ICONE: Record<DetalheItem["tipo"], string> = { conta: "user", campanha: "checklist", conjunto: "layout-grid", anuncio: "sparkles" };
const ROTULO: Record<DetalheItem["tipo"], string> = { conta: "Conta de anúncio", campanha: "Campanha", conjunto: "Conjunto", anuncio: "Anúncio" };

function TrendGrande({ pts, roas }: { pts: SparkPonto[]; roas: number | null }) {
  const w = 360, h = 84, pad = 6, vals = pts.map((p) => p.spend);
  const max = Math.max(...vals), min = Math.min(...vals), rng = max - min || 1;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / rng) * (h - pad * 2);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.spend).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z`;
  const cor = roasColor(roas), gid = "g" + Math.random().toString(36).slice(2, 7);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }} aria-hidden>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={cor} stopOpacity="0.22" /><stop offset="1" stopColor={cor} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill={`url(#${gid})`} /><path d={line} fill="none" stroke={cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function GavetaDetalhe({ item, onClose }: { item: DetalheItem | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!item || !mounted) return null;
  const m = item.m;
  const metricas: { l: string; v: string; cor?: string }[] = [
    { l: "Investido", v: brl(m.spend) },
    { l: "Faturamento", v: brl(m.revenue) },
    { l: "ROAS", v: roasStr(m.roas), cor: roasColor(m.roas) },
    { l: "Compras", v: fmtNum(m.purchases) },
    { l: "CPA", v: opt(m.cpa) },
    { l: "CTR", v: pct(m.ctr) },
    { l: "CPC", v: fmtBRL2(m.cpc) },
    { l: "CPM", v: fmtBRL2(m.cpm) },
    { l: "Impressões", v: fmtNum(m.impressions) },
    { l: "Alcance", v: fmtNum(m.reach) },
    { l: "Frequência", v: m.frequency.toFixed(1) },
    { l: "Cliques", v: fmtNum(m.clicks) },
  ];
  return createPortal(
    <div onClick={onClose} className="tf-scope" style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(8,10,18,.44)", backdropFilter: "blur(2px)", display: "flex", justifyContent: "flex-end", animation: "tfFade .2s ease both" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(440px, 100%)", height: "100%", background: "var(--bg)", borderLeft: "1px solid var(--tf-line)", boxShadow: "-24px 0 60px -30px rgba(8,10,18,.8)", overflowY: "auto", animation: "tfSlideIn .26s cubic-bezier(.2,.7,.3,1) both" }}>
        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 18px 14px", borderBottom: "1px solid var(--tf-line-soft)", position: "sticky", top: 0, background: "var(--bg)", zIndex: 1 }}>
          {item.thumb
            ? <img src={item.thumb} alt="" style={{ width: 42, height: 42, borderRadius: 11, objectFit: "cover", flex: "none", border: "1px solid var(--tf-line)" }} />
            : <span style={{ width: 42, height: 42, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 12%, transparent)" }}><Icon name={ICONE[item.tipo]} size={21} color="var(--primary-texto)" /></span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--primary-texto, var(--primary))", textTransform: "uppercase", letterSpacing: ".05em" }}>{ROTULO[item.tipo]}</div>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: "var(--text)", lineHeight: 1.25, wordBreak: "break-word" }}>{item.nome}</div>
            {item.sub && <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 1 }}>{item.sub}</div>}
          </div>
          <BotaoIcone icone="x" titulo="Fechar (Esc)" variante="secundario" onClick={onClose} style={{ flex: "none" }} />
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Tendência */}
          {item.spark && item.spark.length > 1 && (
            <div className="tf-panel" style={{ padding: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-dim)", marginBottom: 8 }}>Investimento por dia</div>
              <TrendGrande pts={item.spark} roas={m.roas} />
            </div>
          )}

          {/* Pra onde este anúncio manda — só faz sentido no nível do anúncio:
              campanha e conjunto podem ter vários destinos diferentes. */}
          {item.tipo === "anuncio" && item.id && <LinkDeVenda adId={item.id} />}

          {/* Métricas */}
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-dim)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".04em" }}>Métricas do período</div>
            <div style={{ display: "grid", gridTemplateColumns: grade(130, 2, 10), gap: 10 }}>
              {metricas.map((k) => (
                <div key={k.l} className="tf-panel" style={{ padding: "11px 13px" }}>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>{k.l}</div>
                  <div className="tf-num" style={{ fontSize: 18, fontWeight: 800, color: k.cor || "var(--text)", marginTop: 2 }}>{k.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.55, display: "flex", gap: 8, alignItems: "flex-start" }}>
            <Icon name="bulb" size={15} color="var(--text-dim)" />
            <span>Ações direto na plataforma (pausar, ajustar orçamento) chegam com a fase de Integrações. Por enquanto, os números aqui são os dados reais puxados do Meta.</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
