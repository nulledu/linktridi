"use client";

// ── Tridify · Snapshots (§5) ─────────────────────────────────────────────────
// Widget: salva uma "fotografia" dos KPIs do momento e compara com o AGORA depois
// de uma grande alteração. Self-contained (própria API). Tolerante à tabela ausente.

import { useEffect, useState } from "react";
import type { AdsOverview } from "@/lib/meta-ads";
import { fmtBRL2, fmtNum } from "@/lib/format";
import { Icon } from "../Icon";
import { IconeRumo, Vazio, type Rumo } from "./TfKit";
import { Botao, BotaoIcone } from "../ui/controles";

interface Snap { id: string; label: string; periodo: string | null; kpis: Record<string, number | null>; autor_nome: string | null; created_at: string }
const kpisDe = (d: AdsOverview) => ({ spend: d.kpis.spend, revenue: d.kpis.revenue, roas: d.kpis.roas, purchases: d.kpis.purchases, cpa: d.kpis.cpa });

const LINHAS: { key: string; label: string; fmt: (v: number | null) => string; invert?: boolean }[] = [
  { key: "revenue", label: "Faturamento", fmt: (v) => (v == null ? "—" : fmtBRL2(v)) },
  { key: "spend", label: "Investimento", fmt: (v) => (v == null ? "—" : fmtBRL2(v)), invert: true },
  { key: "roas", label: "ROAS", fmt: (v) => (v == null ? "—" : `${v.toFixed(2)}×`) },
  { key: "purchases", label: "Vendas", fmt: (v) => (v == null ? "—" : fmtNum(v)) },
  { key: "cpa", label: "CPA", fmt: (v) => (v == null ? "—" : fmtBRL2(v)), invert: true },
];

// Terceira cópia à mão da mesma conta (as outras: `deltaDe` no TfKit e
// `calcDelta` no TrafegoOverview). O rumo sai separado do texto porque ▲/▼/→
// grudado na string é glifo tipográfico fazendo papel de ícone.
function deltaTxt(now: number | null, then: number | null, invert?: boolean): { txt: string; cor: string; rumo?: Rumo } {
  if (now == null || then == null || then === 0) return { txt: "—", cor: "var(--text-dim)" };
  const ch = (now - then) / Math.abs(then);
  if (Math.abs(ch) < 0.005) return { txt: "0%", cor: "var(--text-dim)", rumo: "igual" };
  const bom = invert ? ch < 0 : ch > 0;
  return { txt: `${Math.abs(ch * 100).toFixed(0)}%`, cor: bom ? "var(--tf-pos)" : "var(--tf-neg)", rumo: ch > 0 ? "sobe" : "desce" };
}

export function Snapshots({ d }: { d: AdsOverview }) {
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [ausente, setAusente] = useState(false);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => { fetch("/api/trafego/snapshots").then((r) => r.json()).then((j) => setSnaps(j.snapshots ?? [])).catch(() => {}); }, []);

  async function salvar() {
    const label = prompt("Nome da fotografia (ex.: antes de escalar a CBO):"); if (!label) return;
    try {
      const r = await fetch("/api/trafego/snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, periodo: d.periodLabel, kpis: kpisDe(d) }) });
      const j = await r.json();
      if (j.ok) setSnaps((v) => [j.snapshot, ...v]); else if (j.error === "tabela_ausente") setAusente(true);
    } catch { /* */ }
  }
  async function remover(id: string) { setSnaps((v) => v.filter((s) => s.id !== id)); if (sel === id) setSel(null); try { await fetch(`/api/trafego/snapshots?id=${id}`, { method: "DELETE" }); } catch { /* */ } }

  const snap = snaps.find((s) => s.id === sel);
  const agora = kpisDe(d) as Record<string, number | null>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", flex: 1 }}>Snapshots</span>
        <Botao variante="secundario" tamanho="sm" icone="camera" onClick={salvar}>Salvar agora</Botao>
      </div>

      {ausente && <div style={{ fontSize: 11.5, color: "var(--tf-warn)" }}>Falta rodar trafego_snapshots.sql no servidor.</div>}

      {snap && (
        <div style={{ padding: 10, borderRadius: 11, border: "1px solid var(--primary)", background: "color-mix(in srgb, var(--primary) 7%, transparent)" }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Agora vs “{snap.label}”</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {LINHAS.map((l) => { const dt = deltaTxt(agora[l.key], snap.kpis?.[l.key] ?? null, l.invert); return (
              <div key={l.key} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, fontSize: 12, alignItems: "center" }}>
                <span style={{ color: "var(--text-dim)" }}>{l.label}</span>
                <span style={{ color: "var(--text-dim)" }}>{l.fmt(snap.kpis?.[l.key] ?? null)} → <b style={{ color: "var(--text)" }}>{l.fmt(agora[l.key])}</b></span>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 3, fontWeight: 800, color: dt.cor, minWidth: 52 }}>{dt.rumo && <IconeRumo rumo={dt.rumo} cor={dt.cor} size={13} />}{dt.txt}</span>
              </div>
            ); })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 170, overflowY: "auto" }}>
        {snaps.length === 0 && <Vazio icon="camera">Sem fotografias. Salve uma antes de mexer no orçamento ou trocar criativo — é com ela que dá pra comparar depois.</Vazio>}
        {snaps.map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 9, border: sel === s.id ? "1px solid var(--primary)" : "1px solid var(--border)", cursor: "pointer" }} onClick={() => setSel(sel === s.id ? null : s.id)}>
            <Icon name="camera" size={13} color="var(--text-dim)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{new Date(s.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}{s.periodo ? ` · ${s.periodo}` : ""}</div>
            </div>
            <BotaoIcone icone="x" titulo="Remover" tamanho="sm" onClick={(e) => { e.stopPropagation(); remover(s.id); }} />
          </div>
        ))}
      </div>
    </div>
  );
}
