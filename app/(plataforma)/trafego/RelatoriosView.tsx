"use client";

// Tráfego Pago — Relatórios. Monta um relatório do período com dados REAIS
// (vendas do ERP + gasto/campanhas do Meta): KPIs financeiros, faturamento por
// origem e top campanhas. Exporta CSV e gera PDF (via impressão do navegador).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtualizacao } from "./atualizacao";
import { periodQuery, type PeriodState } from "../PeriodPicker";
import { useBuscaAtual } from "../ui/useBuscaAtual";
import type { VendasSnapshot } from "@/lib/trafego-vendas";
import type { AdsOverview } from "@/lib/meta-ads";
import { useIsMobile } from "../ui/useMediaQuery";
import { Botao, Caixa } from "../ui/controles";

const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brl2 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number | null) => (n == null ? "—" : n.toFixed(1) + "%");
const roasStr = (r: number | null) => (r == null ? "—" : r.toFixed(2) + "×");
const dm = (iso: string) => { const [, m, d] = iso.split("-"); return d && m ? `${d}/${m}` : iso; };
const limpar = (s: string) => s.replace(/\{[^}]+\}/g, "").trim() || s;

interface Bloco { campanhas: boolean; canais: boolean }

export function RelatoriosView({ period }: { period: PeriodState }) {
  const [s, setS] = useState<VendasSnapshot | null>(null);
  const [d, setD] = useState<AdsOverview | null>(null);
  const [inc, setInc] = useState<Bloco>({ campanhas: true, canais: true });
  const celular = useIsMobile();

  const buscaAtual = useBuscaAtual();
  const load = useCallback(() => {
    if (period.key === "custom" && (!period.from || !period.to)) return;
    // Resposta atrasada de outro período não sobrescreve a busca nova.
    const souAtual = buscaAtual();
    const q = periodQuery(period);
    fetch(`/api/trafego/vendas?${q}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (souAtual()) setS(j); }).catch(() => { if (souAtual()) setS(null); });
    fetch(`/api/trafego/overview?${q}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (souAtual()) setD(j); }).catch(() => { if (souAtual()) setD(null); });
  }, [period, buscaAtual]);
  useEffect(() => { load(); }, [load]);
  // Segue o botão "Atualizar" da Tridify (ver `atualizacao.ts`).
  useAtualizacao(load);

  const kpis = useMemo(() => {
    if (!s) return [];
    const roas = s.roas;   // faturamento do tráfego ÷ gasto com imposto
    // CPA do snapshot: custo real do anúncio ÷ pedidos que o anúncio trouxe.
    // Dividir pelos aprovados do ERP inteiro punha comercial e orgânico no
    // denominador e o relatório saía com um custo por venda irreal.
    const cpa = s.cpaTrafego;
    return [
      { l: "Faturamento", v: brl2(s.faturamento) },
      { l: "Investimento (Meta)", v: brl2(s.gasto) },
      { l: "Investimento + imposto", v: brl2(s.gastoComImposto) },
      { l: "Lucro", v: brl2(s.lucro), cor: s.lucro >= 0 ? "var(--ok)" : "var(--perigo)" },
      { l: "Margem", v: pct(s.margem) },
      { l: "ROAS", v: roasStr(roas) },
      { l: "ROI", v: s.roi == null ? "—" : (s.roi * 100).toFixed(0) + "%" },
      { l: "CPA", v: cpa == null ? "—" : brl2(cpa) },
      { l: "Ticket médio", v: brl2(s.ticketMedio) },
      { l: "Vendas aprovadas", v: num(s.aprovados) },
      { l: "Taxa de aprovação", v: pct(s.taxaAprovacao) },
      { l: "Custos", v: brl2(s.custos) },
      { l: "Chargebacks", v: `${num(s.chargebacks)} (${pct(s.taxaChargeback)})` },
    ];
  }, [s]);
  const canais = s ? [...s.canais].sort((a, b) => b.faturamento - a.faturamento) : [];
  const campanhas = d ? [...d.campanhas].sort((a, b) => b.spend - a.spend).slice(0, 20) : [];
  const periodoLabel = s ? `${dm(s.since)} a ${dm(s.until)}` : "";

  function exportarCSV() {
    if (!s) return;
    const linhas: string[][] = [["Relatório de Tráfego", periodoLabel], [], ["Indicador", "Valor"]];
    for (const k of kpis) linhas.push([k.l, k.v]);
    if (inc.canais && canais.length) { linhas.push([], ["Faturamento por origem"], ["Origem", "Pedidos", "% ", "Faturamento"]); for (const c of canais) linhas.push([c.label, String(c.pedidos), `${c.pct.toFixed(0)}%`, brl2(c.faturamento)]); }
    if (inc.campanhas && campanhas.length) { linhas.push([], ["Top campanhas"], ["Campanha", "Investido", "Faturamento", "ROAS", "Compras"]); for (const c of campanhas) linhas.push([limpar(c.name), brl2(c.spend), brl2(c.revenue), roasStr(c.roas), String(c.purchases)]); }
    const csv = linhas.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `relatorio-trafego-${s.since}_${s.until}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  function imprimir() {
    if (!s) return;
    const tbl = (titulo: string, cols: string[], linhas: string[][]) => `<h3>${titulo}</h3><table><thead><tr>${cols.map((c, i) => `<th${i ? ' class="r"' : ""}>${c}</th>`).join("")}</tr></thead><tbody>${linhas.map((r) => `<tr>${r.map((v, i) => `<td${i ? ' class="r"' : ""}>${v}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de Tráfego · ${periodoLabel}</title>
      <style>body{font-family:-apple-system,Segoe UI,system-ui,sans-serif;color:#1c1c1e;margin:32px;font-variant-numeric:tabular-nums}h1{font-size:22px;margin:0}h3{font-size:14px;margin:24px 0 8px;color:#333}.sub{color:#777;font-size:13px;margin-top:2px}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}.kpi{border:1px solid #e6e6ea;border-radius:10px;padding:10px 12px}.kpi .l{font-size:11px;color:#777}.kpi .v{font-size:18px;font-weight:800;margin-top:2px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #ececf0}th{color:#777;font-weight:700}.r{text-align:right}@media print{body{margin:12mm}}</style></head>
      <body><h1>Relatório de Tráfego Pago</h1><div class="sub">Período: ${periodoLabel} · gerado em ${new Date().toLocaleString("pt-BR")}</div>
      <div class="kpis">${kpis.map((k) => `<div class="kpi"><div class="l">${k.l}</div><div class="v" style="color:${k.cor || "#1c1c1e"}">${k.v}</div></div>`).join("")}</div>
      ${inc.canais && canais.length ? tbl("Faturamento por origem", ["Origem", "Pedidos", "%", "Faturamento"], canais.map((c) => [c.label, String(c.pedidos), `${c.pct.toFixed(0)}%`, brl2(c.faturamento)])) : ""}
      ${inc.campanhas && campanhas.length ? tbl("Top campanhas", ["Campanha", "Investido", "Faturamento", "ROAS", "Compras"], campanhas.map((c) => [limpar(c.name), brl2(c.spend), brl2(c.revenue), roasStr(c.roas), String(c.purchases)])) : ""}
      <script>window.onload=function(){window.print()}<\/script></body></html>`;
    const w = window.open("", "_blank"); if (!w) return; w.document.write(html); w.document.close();
  }

  const chk = (k: keyof Bloco, label: string) => (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text)", cursor: "pointer", fontWeight: 600 }}>
      <Caixa marcado={inc[k]} onChange={(marc) => setInc({ ...inc, [k]: marc })} /> {label}
    </label>
  );

  return (
    <div className="tf-scope" style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>Relatórios</h2>
          <p style={{ color: "var(--text-dim)", fontSize: 13.5, marginTop: 2 }}>Relatório do período {periodoLabel && <>· <strong>{periodoLabel}</strong></>} com dados reais. Exporte em CSV ou gere um PDF.</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Botao variante="secundario" icone="download" onClick={exportarCSV} disabled={!s}>CSV</Botao>
          <Botao variante="primario" icone="printer" onClick={imprimir} disabled={!s}>Imprimir / PDF</Botao>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>{chk("canais", "Incluir origens")}{chk("campanhas", "Incluir campanhas")}</div>

      {!s ? (
        <div className="tf-panel" style={{ padding: 30, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Carregando relatório…</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 10 }}>
            {kpis.map((k) => (
              <div key={k.l} className="tf-panel" style={{ padding: "12px 14px" }}>
                <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>{k.l}</div>
                <div className="tf-num" style={{ fontSize: 19, fontWeight: 800, color: k.cor || "var(--text)", marginTop: 2 }}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* Origens */}
          {inc.canais && canais.length > 0 && (
            <div className="tf-panel" style={{ padding: 16 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 10 }}>Faturamento por origem</div>
              {/* Celular: 46+60+100 fixos + gaps estouram o painel a 320px. O
                  faturamento sobe pra primeira fileira (é o número que importa)
                  e % / pedidos descem pra segunda. */}
              {canais.map((c) => (
                <div key={c.key} style={{ display: "flex", flexWrap: celular ? "wrap" : "nowrap", alignItems: "center", gap: celular ? 8 : 12, padding: "8px 0", borderTop: "1px solid var(--tf-line-soft)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, flex: "none", background: c.pago ? "var(--azul)" : "var(--neutro)" }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700 }}>{c.label}</span>
                  {celular ? (
                    <>
                      <span className="tf-num" style={{ flex: "none", fontSize: 13.5, fontWeight: 800 }}>{brl0(c.faturamento)}</span>
                      <span className="tf-num" style={{ flex: "1 1 100%", fontSize: 12, color: "var(--text-dim)" }}>{c.pct.toFixed(0)}% · {c.pedidos} ped.</span>
                    </>
                  ) : (
                    <>
                      <span className="tf-num" style={{ width: 46, textAlign: "right", fontSize: 12, color: "var(--text-dim)" }}>{c.pct.toFixed(0)}%</span>
                      <span className="tf-num" style={{ width: 60, textAlign: "right", fontSize: 12, color: "var(--text-dim)" }}>{c.pedidos} ped.</span>
                      <span className="tf-num" style={{ width: 100, textAlign: "right", fontSize: 13.5, fontWeight: 800 }}>{brl0(c.faturamento)}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Campanhas */}
          {inc.campanhas && campanhas.length > 0 && (
            <div className="tf-panel" style={{ padding: 16 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 10 }}>Top campanhas</div>
              {/* Celular: as 5 colunas em fr davam ~40px cada. Vira nome em cima
                  e os números em pares rótulo→valor que quebram sozinhos. */}
              {!celular && (
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 0.7fr 0.7fr", gap: 8, padding: "0 0 8px", fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".03em", borderBottom: "1px solid var(--tf-line-soft)" }}>
                  <span>Campanha</span><span style={{ textAlign: "right" }}>Investido</span><span style={{ textAlign: "right" }}>Faturamento</span><span style={{ textAlign: "right" }}>ROAS</span><span style={{ textAlign: "right" }}>Compras</span>
                </div>
              )}
              {campanhas.map((c) => {
                const corRoas = c.roas == null ? "var(--text-dim)" : c.roas >= 2 ? "var(--ok)" : c.roas >= 1 ? "var(--atencao)" : "var(--perigo)";
                if (celular) {
                  return (
                    <div key={c.id} style={{ padding: "9px 0", borderBottom: "1px solid var(--tf-line-soft)" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, overflowWrap: "anywhere" }}>{limpar(c.name)}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 12px", marginTop: 4, fontSize: 12, color: "var(--text-dim)" }}>
                        <span className="tf-num">Inv. {brl0(c.spend)}</span>
                        <span className="tf-num">Fat. {brl0(c.revenue)}</span>
                        <span className="tf-num" style={{ color: corRoas, fontWeight: 700 }}>{roasStr(c.roas)}</span>
                        <span className="tf-num">{num(c.purchases)} compra(s)</span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={c.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 0.7fr 0.7fr", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--tf-line-soft)", alignItems: "center" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{limpar(c.name)}</span>
                    <span className="tf-num" style={{ fontSize: 12.5, textAlign: "right" }}>{brl0(c.spend)}</span>
                    <span className="tf-num" style={{ fontSize: 12.5, textAlign: "right" }}>{brl0(c.revenue)}</span>
                    <span className="tf-num" style={{ fontSize: 12.5, textAlign: "right", color: corRoas }}>{roasStr(c.roas)}</span>
                    <span className="tf-num" style={{ fontSize: 12.5, textAlign: "right" }}>{num(c.purchases)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
