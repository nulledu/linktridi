"use client";

// ── Tridify · Fonte das vendas do tráfego ────────────────────────────────────
// Seletor: qual loja (Yampi) conta como vendas do TRÁFEGO PAGO. Ex.: "Carimbos
// Tridi" = tráfego; "Carimbos (Organico)" = orgânico. Salva na config e as
// métricas (faturamento atribuído, ROAS real, qualidade) passam a usar essa loja.

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { GlassSelect } from "../GlassPicker";

export function FonteVendasSelector() {
  const [atual, setAtual] = useState("");
  const [opcoes, setOpcoes] = useState<string[]>([]);
  const [estado, setEstado] = useState<"" | "salvando" | "salvo">("");

  useEffect(() => {
    fetch("/api/trafego/fonte-vendas", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { setAtual(j.atual || ""); setOpcoes(j.opcoes || []); }).catch(() => {});
  }, []);

  async function salvar(fonte: string) {
    setAtual(fonte); setEstado("salvando");
    try {
      const r = await fetch("/api/trafego/fonte-vendas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fonte }) });
      setEstado((await r.json()).ok ? "salvo" : "");
      setTimeout(() => setEstado(""), 2500);
    } catch { setEstado(""); }
  }

  return (
    <div className="tf-panel" style={{ padding: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <span style={{ width: 38, height: 38, borderRadius: 11, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 14%, transparent)" }}>
        <Icon name="building-warehouse" size={20} color="var(--primary-texto)" />
      </span>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>Fonte das vendas do tráfego</div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>Só as vendas desta loja entram nas métricas de tráfego (faturamento atribuído, ROAS real). O resto é orgânico/outros.</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <GlassSelect value={atual} onChange={salvar} style={{ minWidth: 190, width: 220 }}
          options={[...(atual && !opcoes.includes(atual) ? [{ value: atual, label: atual }] : []), ...opcoes.map((o) => ({ value: o, label: o }))]} />
        {estado === "salvando" && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>salvando…</span>}
        {estado === "salvo" && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "var(--tf-pos)" }}><Icon name="check" size={13} color="var(--tf-pos)" /> salvo</span>}
      </div>
    </div>
  );
}
