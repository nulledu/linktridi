"use client";

// Tráfego Pago — tabela unificada de desempenho (estilo mockup): abas
// Contas · Campanhas · Conjuntos · Anúncios, ordenável, com linha de totais,
// export CSV e sparkline por campanha. Dados REAIS do Meta (AdsOverview).
// Contas são agregadas no cliente a partir das campanhas (por conta).
import { useMemo, useState } from "react";
import type { AdsOverview, AdMetrics, CampaignRow, SparkPonto } from "@/lib/meta-ads";
import { fmtBRL2, fmtNum } from "@/lib/format";
import { Icon } from "../Icon";
import { Fila, TrocaIcone, useOnda } from "../ui/micro";
import { GavetaDetalhe, type DetalheItem } from "./GavetaDetalhe";
import { Botao } from "../ui/controles";

const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const pct = (n: number) => n.toFixed(2) + "%";
const roasStr = (r: number | null) => (r == null ? "—" : r.toFixed(2) + "×");
const roasColor = (r: number | null) => (r == null ? "var(--text-dim)" : r >= 2 ? "var(--ok)" : r >= 1 ? "var(--atencao)" : "var(--perigo)");
const optBRL = (n: number | null) => (n == null ? "—" : fmtBRL2(n));
const limpar = (nome: string) => nome.replace(/\{[^}]+\}/g, "").replace(/\s{2,}/g, " ").trim() || nome;

const zeroM = (): AdMetrics => ({ spend: 0, impressions: 0, reach: 0, frequency: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, purchases: 0, revenue: 0, roas: null, leads: 0, cpa: null, cpl: null });
function somaM(a: AdMetrics, b: AdMetrics): AdMetrics {
  const spend = a.spend + b.spend, impressions = a.impressions + b.impressions, clicks = a.clicks + b.clicks;
  const revenue = a.revenue + b.revenue, purchases = a.purchases + b.purchases, reach = a.reach + b.reach, leads = a.leads + b.leads;
  return {
    spend, impressions, reach, frequency: reach > 0 ? impressions / reach : 0, clicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0, cpc: clicks > 0 ? spend / clicks : 0, cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    purchases, revenue, roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : null, leads,
    cpa: purchases > 0 ? spend / purchases : null, cpl: leads > 0 ? spend / leads : null,
  };
}

interface Linha { id: string; nome: string; sub?: string; thumb?: string | null; m: AdMetrics; count?: number; spark?: SparkPonto[] }
type ColKey = "count" | "spend" | "revenue" | "roas" | "purchases" | "cpa" | "ctr" | "cpc";
interface ColDef { label: string; get: (l: Linha) => number | null; fmt: (v: number) => string; color?: (v: number | null) => string }
const COL: Record<ColKey, ColDef> = {
  count: { label: "Camp.", get: (l) => l.count ?? null, fmt: (v) => fmtNum(v) },
  spend: { label: "Investido", get: (l) => l.m.spend, fmt: brl },
  revenue: { label: "Faturamento", get: (l) => l.m.revenue, fmt: brl },
  roas: { label: "ROAS", get: (l) => l.m.roas, fmt: roasStr, color: roasColor },
  purchases: { label: "Compras", get: (l) => l.m.purchases, fmt: (v) => fmtNum(v) },
  cpa: { label: "CPA", get: (l) => l.m.cpa, fmt: (v) => fmtBRL2(v) },
  ctr: { label: "CTR", get: (l) => l.m.ctr, fmt: pct },
  cpc: { label: "CPC", get: (l) => l.m.cpc, fmt: fmtBRL2 },
};

type TabKey = "contas" | "campanhas" | "conjuntos" | "anuncios";
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "contas", label: "Contas", icon: "user" },
  { key: "campanhas", label: "Campanhas", icon: "checklist" },
  { key: "conjuntos", label: "Conjuntos", icon: "layout-grid" },
  { key: "anuncios", label: "Anúncios", icon: "sparkles" },
];

function contasDe(campanhas: CampaignRow[]): Linha[] {
  const m = new Map<string, { nome: string; acc: AdMetrics; count: number }>();
  for (const c of campanhas) {
    const e = m.get(c.accountId) || { nome: c.account, acc: zeroM(), count: 0 };
    e.acc = somaM(e.acc, c); e.count += 1; e.nome = c.account || e.nome; m.set(c.accountId, e);
  }
  return [...m.entries()].map(([id, e]) => ({ id, nome: e.nome, m: e.acc, count: e.count }));
}

// Mini-sparkline (spend/dia) — igual à da tabela de campanhas.
function Spark({ pts, roas }: { pts?: SparkPonto[]; roas: number | null }) {
  if (!pts || pts.length < 2) return <span style={{ fontSize: 11, color: "var(--text-dim)" }}>—</span>;
  const w = 78, h = 24, pad = 2, vals = pts.map((p) => p.spend);
  const max = Math.max(...vals), min = Math.min(...vals), rng = max - min || 1;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / rng) * (h - pad * 2);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.spend).toFixed(1)}`).join(" ");
  const cor = roasColor(roas);
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }} aria-hidden><path d={line} fill="none" stroke={cor} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

export function DesempenhoTabela({ d }: { d: AdsOverview }) {
  const [tab, setTab] = useState<TabKey>("campanhas");
  const [sort, setSort] = useState<{ col: ColKey; dir: "asc" | "desc" }>({ col: "spend", dir: "desc" });
  const [limite, setLimite] = useState(10);
  const [sel, setSel] = useState<DetalheItem | null>(null);
  const onda = useOnda();
  const tipoDe: Record<TabKey, DetalheItem["tipo"]> = { contas: "conta", campanhas: "campanha", conjuntos: "conjunto", anuncios: "anuncio" };

  const contas = useMemo(() => contasDe(d.campanhas), [d.campanhas]);
  const cfg = useMemo(() => {
    switch (tab) {
      case "contas": return { rows: contas, cols: ["count", "spend", "revenue", "roas", "purchases", "cpa", "ctr"] as ColKey[], nomeCol: "Conta", spark: false, thumb: false };
      case "campanhas": return { rows: d.campanhas.map((c): Linha => ({ id: c.id, nome: limpar(c.name), sub: c.account, m: c, spark: c.spark })), cols: ["spend", "revenue", "roas", "purchases", "cpa", "ctr", "cpc"] as ColKey[], nomeCol: "Campanha", spark: true, thumb: false };
      case "conjuntos": return { rows: d.conjuntos.map((c): Linha => ({ id: c.id, nome: c.name, sub: c.campaign, m: c })), cols: ["spend", "revenue", "roas", "purchases", "cpa", "ctr"] as ColKey[], nomeCol: "Conjunto", spark: false, thumb: false };
      case "anuncios": return { rows: d.anuncios.map((a): Linha => ({ id: a.id, nome: a.name, sub: a.campaign, thumb: a.thumb, m: a })), cols: ["spend", "revenue", "roas", "purchases", "ctr", "cpc"] as ColKey[], nomeCol: "Anúncio", spark: false, thumb: true };
    }
  }, [tab, contas, d]);

  const rowsOrd = useMemo(() => {
    const arr = [...cfg.rows];
    const g = (l: Linha) => { const v = COL[sort.col].get(l); return v == null ? -Infinity : v; };
    arr.sort((a, b) => (sort.dir === "desc" ? g(b) - g(a) : g(a) - g(b)));
    return arr;
  }, [cfg.rows, sort]);

  const totais = useMemo(() => cfg.rows.reduce((acc, l) => somaM(acc, l.m), zeroM()), [cfg.rows]);
  const totalCount = tab === "contas" ? cfg.rows.reduce((s, l) => s + (l.count || 0), 0) : cfg.rows.length;

  const visiveis = limite >= 9999 ? rowsOrd : rowsOrd.slice(0, limite);
  const clicarCol = (c: ColKey) => setSort((s) => (s.col === c ? { col: c, dir: s.dir === "desc" ? "asc" : "desc" } : { col: c, dir: "desc" }));

  function exportarCSV() {
    const cab = [cfg.nomeCol, ...cfg.cols.map((c) => COL[c].label)];
    const linhas = rowsOrd.map((l) => [l.nome, ...cfg.cols.map((c) => { const v = COL[c].get(l); return v == null ? "" : String(Math.round(v * 100) / 100).replace(".", ","); })]);
    const csv = [cab, ...linhas].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `desempenho-${tab}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const grid = `minmax(min(100%, 150px), 2.1fr)${cfg.spark ? " 84px" : ""} repeat(${cfg.cols.length}, minmax(58px, 0.9fr))`;
  const Cel = ({ c, l, totalRow }: { c: ColKey; l?: Linha; totalRow?: boolean }) => {
    const col = COL[c];
    const v = l ? col.get(l) : (c === "count" ? totalCount : c === "roas" ? totais.roas : c === "cpa" ? totais.cpa : (totais as unknown as Record<string, number>)[c]);
    const cor = col.color ? col.color(v as number | null) : "var(--text)";
    return <span className="tf-num" data-l={col.label} style={{ fontSize: 13, textAlign: "right", color: totalRow ? "var(--text)" : cor, fontWeight: totalRow ? 800 : 600, overflow: "hidden", textOverflow: "ellipsis" }}>{v == null ? "—" : col.fmt(v as number)}</span>;
  };

  return (
    <div className="tf-panel" style={{ padding: 0, overflow: "hidden" }}>
      {/* Cabeçalho: abas + toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--tf-line-soft)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 2, background: "var(--surface-2)", padding: 3, borderRadius: 11 }}>
          {TABS.map((t) => {
            const on = tab === t.key;
            const n = t.key === "contas" ? contas.length : t.key === "campanhas" ? d.campanhas.length : t.key === "conjuntos" ? d.conjuntos.length : d.anuncios.length;
            return (
              <button key={t.key} onClick={() => { setTab(t.key); setSort({ col: "spend", dir: "desc" }); }} className="mt-anel" onPointerDown={onda}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: on ? "var(--surface)" : "transparent", color: on ? "var(--text)" : "var(--text-dim)", boxShadow: on ? "0 1px 3px rgba(15,20,35,.14)" : "none" }}>
                <Icon name={t.icon} size={14} color={on ? "var(--primary-texto)" : "var(--text-dim)"} /> {t.label}
                <span className="tf-num" style={{ fontSize: 11, fontWeight: 800, color: on ? "var(--text-dim)" : "var(--text-dim)", opacity: 0.8 }}>{n}</span>
              </button>
            );
          })}
        </div>
        <Botao variante="secundario" icone="download" onClick={exportarCSV} style={{ marginLeft: "auto" }}>Exportar CSV</Botao>
      </div>

      {/* No celular o cabeçalho de colunas vira card e some — sem isto a pessoa
          perdia a ordenação, que só existia clicando no título da coluna. */}
      {cfg.rows.length > 1 && (
        <div className="mob-only tab-strip" style={{ gap: 6, padding: "10px 12px" }}>
          <span style={{ alignSelf: "center", fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)" }}>Ordenar</span>
          {cfg.cols.map((c) => (
            <button key={c} onClick={() => clicarCol(c)} className="tap-m mt-anel" onPointerDown={onda}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                border: `1px solid ${sort.col === c ? "var(--primary)" : "var(--tf-line)"}`,
                background: sort.col === c ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "var(--surface)",
                color: sort.col === c ? "var(--primary-texto)" : "var(--text-dim)" }}>
              {COL[c].label}
              {sort.col === c && <TrocaIcone ligado={sort.dir === "desc"} a="chevron-up" b="chevron-down" size={12} corA="var(--primary-texto)" corB="var(--primary-texto)" />}
            </button>
          ))}
        </div>
      )}

      {cfg.rows.length === 0 ? (
        <div style={{ padding: 36, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Sem dados no período para esta aba.</div>
      ) : (
        <div className="tf-tabela-rolagem" style={{ overflowX: "auto" }}>
          <div className="tf-tabela-largura" style={{ minWidth: 640 }}>
            {/* Header de colunas */}
            <div className="tab-linha-head" style={{ display: "grid", gridTemplateColumns: grid, gap: 8, padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".03em", borderBottom: "1px solid var(--tf-line-soft)" }}>
              <span>{cfg.nomeCol}</span>
              {cfg.spark && <span style={{ textAlign: "left" }}>Tend.</span>}
              {cfg.cols.map((c) => (
                <button key={c} onClick={() => clicarCol(c)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 3, background: "none", border: "none", cursor: "pointer", color: sort.col === c ? "var(--primary-texto)" : "var(--text-dim)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", padding: 0 }}>
                  {COL[c].label}{sort.col === c && <TrocaIcone ligado={sort.dir === "desc"} a="chevron-up" b="chevron-down" size={12} corA="var(--primary-texto)" corB="var(--primary-texto)" />}
                </button>
              ))}
            </div>
            {/* Linhas. `Fila` carimba `--mt-i` em cada filho: a lista CHEGA em
                cascata em vez de as 50 linhas piscarem juntas. O realce de
                ponteiro/toque e o fio da linha aberta são do `.mt-linha` — o
                `.tf-row:hover` escrito à mão saiu junto, que era a mesma
                intenção com outra duração. */}
            <Fila>
              {visiveis.map((l) => (
              <div key={l.id || l.nome} className="mt-linha tab-linha"
                data-mt-sel={sel && sel.nome === l.nome ? "1" : undefined}
                onClick={() => setSel({ tipo: tipoDe[tab], id: l.id, nome: l.nome, sub: l.sub, thumb: l.thumb, m: l.m, spark: l.spark })}
                style={{ display: "grid", gridTemplateColumns: grid, gap: 8, padding: "10px 16px", alignItems: "center", borderBottom: "1px solid var(--tf-line-soft)", cursor: "pointer" }}>
                <div className="tl-titulo" style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  {cfg.thumb && (l.thumb
                    ? <img src={l.thumb} alt="" style={{ width: 30, height: 30, borderRadius: 7, objectFit: "cover", flex: "none", border: "1px solid var(--tf-line)" }} />
                    : <span style={{ width: 30, height: 30, borderRadius: 7, flex: "none", background: "var(--surface-2)", display: "grid", placeItems: "center" }}><Icon name="photo" size={14} color="var(--text-dim)" /></span>)}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.nome}>{l.nome}</div>
                    {l.sub && <div style={{ fontSize: 10.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.sub}</div>}
                  </div>
                </div>
                {cfg.spark && <span className="desk-only"><Spark pts={l.spark} roas={l.m.roas} /></span>}
                {cfg.cols.map((c) => <Cel key={c} c={c} l={l} />)}
              </div>
              ))}
            </Fila>
            {/* Totais */}
            <div className="tab-linha" style={{ display: "grid", gridTemplateColumns: grid, gap: 8, padding: "11px 16px", alignItems: "center", background: "var(--surface-2)" }}>
              <span className="tl-titulo" style={{ fontSize: 12, fontWeight: 800, color: "var(--text-dim)" }}>Total · {tab === "contas" ? `${cfg.rows.length} conta(s)` : `${cfg.rows.length} ${cfg.nomeCol.toLowerCase()}(s)`}</span>
              {cfg.spark && <span className="desk-only" />}
              {cfg.cols.map((c) => <Cel key={c} c={c} totalRow />)}
            </div>
          </div>
        </div>
      )}

      {/* Rodapé: exibir N */}
      {cfg.rows.length > 10 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", fontSize: 12, color: "var(--text-dim)" }}>
          <span>Exibir</span>
          {[10, 25, 50, 9999].map((n) => (
            <button key={n} onClick={() => setLimite(n)} className="mt-anel" onPointerDown={onda} style={{ padding: "4px 10px", borderRadius: 8, border: `1px solid ${limite === n ? "var(--primary)" : "var(--tf-line)"}`, background: limite === n ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--surface)", color: limite === n ? "var(--primary-texto)" : "var(--text)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{n >= 9999 ? "Todos" : n}</button>
          ))}
          <span style={{ marginLeft: "auto" }}>{visiveis.length} de {rowsOrd.length}</span>
        </div>
      )}
      {sel && <GavetaDetalhe item={sel} onClose={() => setSel(null)} />}
    </div>
  );
}
