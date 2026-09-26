"use client";

// ── Tridify · Comando rápido (§5) — Spotlight (⌘K / Ctrl+K) ──────────────────
// Busca global: navega entre as áreas e FILTRA campanhas por comando em
// linguagem natural simples, ex.: "campanhas com CPA maior que 100",
// "roas < 1", "gasto acima de 500". Sem backend — roda sobre o overview (d).

import { Tecla } from "@/app/(plataforma)/ui/exibicao";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AdsOverview, CampaignRow } from "@/lib/meta-ads";
import { fmtBRL2, fmtNum } from "@/lib/format";
import { Icon } from "../Icon";
import { registrarPaletaLocal } from "../ui/paletaLocal";

const NAV: { label: string; tab: string; icon: string }[] = [
  { label: "Meu painel", tab: "painel", icon: "layout-grid" },
  { label: "Campanhas", tab: "campanhas", icon: "checklist" },
  { label: "Anúncios & criativos", tab: "anuncios", icon: "sparkles" },
  { label: "Funil", tab: "funil", icon: "filter" },
  { label: "Relatórios", tab: "relatorios", icon: "file-text" },
  { label: "Regras & alertas", tab: "regras", icon: "bolt" },
];

// Métricas reconhecidas no comando → getter na campanha.
const METR: { nomes: string[]; get: (c: CampaignRow) => number | null; fmt: (v: number) => string; label: string }[] = [
  { nomes: ["cpa", "custo por venda"], get: (c) => c.cpa, fmt: fmtBRL2, label: "CPA" },
  { nomes: ["roas"], get: (c) => c.roas, fmt: (v) => `${v.toFixed(2)}×`, label: "ROAS" },
  { nomes: ["gasto", "investimento", "investido", "spend"], get: (c) => c.spend, fmt: fmtBRL2, label: "Investimento" },
  { nomes: ["faturamento", "receita", "vendas em reais", "revenue"], get: (c) => c.revenue, fmt: fmtBRL2, label: "Faturamento" },
  { nomes: ["vendas", "compras", "purchases"], get: (c) => c.purchases, fmt: (v) => fmtNum(v), label: "Vendas" },
  { nomes: ["ctr"], get: (c) => c.ctr, fmt: (v) => `${v.toFixed(1)}%`, label: "CTR" },
  { nomes: ["cpc"], get: (c) => c.cpc, fmt: fmtBRL2, label: "CPC" },
  { nomes: ["cpm"], get: (c) => c.cpm, fmt: fmtBRL2, label: "CPM" },
];

// Interpreta "cpa maior que 100" / "roas < 1" / "gasto acima de 500".
function parseComando(qRaw: string): { metr: typeof METR[number]; op: ">" | "<"; val: number } | null {
  const q = qRaw.toLowerCase();
  const metr = METR.find((m) => m.nomes.some((n) => q.includes(n)));
  if (!metr) return null;
  const maior = /(maior|acima|>|mais de|>=|superior)/.test(q);
  const menor = /(menor|abaixo|<|menos de|<=|inferior)/.test(q);
  const num = q.replace(/,/g, ".").match(/(\d+(?:\.\d+)?)/);
  if (!num || (!maior && !menor)) return null;
  return { metr, op: menor ? "<" : ">", val: parseFloat(num[1]) };
}

export function ComandoRapido({ d, onNavigate }: { d: AdsOverview | null; onNavigate: (tab: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Assume o ⌘K enquanto esta página estiver montada — senão a paleta global
    // do app abre junto e ficam DUAS janelas no mesmo atalho.
    const liberar = registrarPaletaLocal();
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setAberto((v) => !v); }
      if (e.key === "Escape") setAberto(false);
    };
    // O botão "Buscar ou comandar" do topo abre por aqui. Antes ele forjava um
    // KeyboardEvent de ⌘K, que as duas paletas escutavam — mesmo problema.
    const onEvt = () => setAberto(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("tridify:busca", onEvt);
    return () => { liberar(); window.removeEventListener("keydown", onKey); window.removeEventListener("tridify:busca", onEvt); };
  }, []);
  useEffect(() => { if (aberto) { setQ(""); setI(0); setTimeout(() => inputRef.current?.focus(), 30); } }, [aberto]);

  const filtro = useMemo(() => (q.trim() ? parseComando(q) : null), [q]);
  const resultados = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (filtro && d) {
      const rows = d.campanhas
        .filter((c) => { const v = filtro.metr.get(c); return v != null && (filtro.op === ">" ? v > filtro.val : v < filtro.val); })
        .sort((a, b) => (filtro.metr.get(b) ?? 0) - (filtro.metr.get(a) ?? 0)).slice(0, 8);
      return { tipo: "filtro" as const, rows };
    }
    const navs = NAV.filter((n) => !ql || n.label.toLowerCase().includes(ql));
    const camps = ql && d ? d.campanhas.filter((c) => c.name.toLowerCase().includes(ql)).slice(0, 5) : [];
    return { tipo: "busca" as const, navs, camps };
  }, [q, filtro, d]);

  const itens: { kind: "nav" | "camp"; label: string; sub?: string; icon: string; acao: () => void }[] = useMemo(() => {
    if (resultados.tipo === "filtro") {
      return resultados.rows.map((c) => ({ kind: "camp" as const, label: c.name, sub: `${filtro!.metr.label} ${filtro!.metr.fmt(filtro!.metr.get(c) as number)} · ${c.account}`, icon: "checklist", acao: () => { onNavigate("campanhas"); setAberto(false); } }));
    }
    return [
      ...resultados.navs.map((n) => ({ kind: "nav" as const, label: n.label, icon: n.icon, acao: () => { onNavigate(n.tab); setAberto(false); } })),
      ...resultados.camps.map((c) => ({ kind: "camp" as const, label: c.name, sub: c.account ?? undefined, icon: "checklist", acao: () => { onNavigate("campanhas"); setAberto(false); } })),
    ];
  }, [resultados, filtro, onNavigate]);

  useEffect(() => { setI(0); }, [q]);

  if (!aberto) return null;
  return createPortal(
    <div onClick={() => setAberto(false)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(6,8,16,.55)", backdropFilter: "blur(3px)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "12dvh" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(620px, 92vw)", borderRadius: 18, border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "0 24px 60px -20px rgba(0,0,0,.6)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <Icon name="search" size={18} color="var(--text-dim)" />
          <input ref={inputRef} value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setI((v) => Math.min(v + 1, itens.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setI((v) => Math.max(v - 1, 0)); }
              if (e.key === "Enter") { e.preventDefault(); itens[i]?.acao(); }
            }}
            placeholder="Buscar ou comandar: “campanhas com CPA maior que 100”"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--text)", fontSize: 15 }} />
          <Tecla>Esc</Tecla>
        </div>
        {filtro && <div style={{ padding: "8px 16px", fontSize: 11.5, color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>Filtro: {filtro.metr.label} {filtro.op === ">" ? "maior" : "menor"} que {filtro.metr.fmt(filtro.val)} · {resultados.tipo === "filtro" ? resultados.rows.length : 0} campanha(s)</div>}
        <div style={{ maxHeight: "48dvh", overflowY: "auto", padding: 8 }}>
          {itens.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Nada encontrado. Tente “roas menor que 1” ou o nome de uma área.</div>}
          {itens.map((it, idx) => (
            <button key={idx} onClick={it.acao} onMouseEnter={() => setI(idx)}
              style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 11, border: "none", cursor: "pointer", background: i === idx ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "transparent" }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, flex: "none", display: "grid", placeItems: "center", background: "var(--surface-2, var(--bg))" }}><Icon name={it.icon} size={16} color={it.kind === "nav" ? "var(--primary-texto)" : "var(--text-dim)"} /></span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</div>
                {it.sub && <div style={{ fontSize: 11.5, color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.sub}</div>}
              </div>
              <span style={{ fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>{it.kind === "nav" ? "ir" : "ver"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
