"use client";

import type { PanelConfig, SalesSnapshot } from "@/lib/types";
import { fmtBRL } from "@/lib/format";

// Faturamento mensal vs meta + projeção do mês (run-rate).
export function MonthGoalSlide({ sales, config }: { sales: SalesSnapshot; config: PanelConfig }) {
  // Faturamento e projeção na base do TRIDIFY (tráfego + orgânico + comercial
  // + marketplace, desde 01/09/2026 — o mesmo total do Analytics). O total do
  // ERP perdia a venda lançada pela vendedora — outro número com o mesmo
  // nome. Sem o Tridify, cai no ERP em vez de zerar a tela.
  const month = sales.tridify?.faturamentoEmpresa ?? sales.revenue.monthly;
  const goal = config.monthlyRevenueGoal || 0;
  const pct = goal > 0 ? (month / goal) * 100 : 0;
  const falta = Math.max(goal - month, 0);
  const proj = sales.tridify?.projecaoMes ?? sales.metrics?.projection ?? 0;
  const projPct = goal > 0 ? (proj / goal) * 100 : 0;
  // Cor legível: verde se bate, amarelo vivo se perto, laranja senão.
  const projColor = projPct >= 100 ? "var(--secondary)" : projPct >= 80 ? "var(--amarelo)" : "var(--atencao)";

  return (
    <div style={{ width: "100%", maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--text-dim)" }}>
            Faturamento Mensal
          </div>
          <div className="stat" style={{ fontSize: 72, marginTop: 8, textShadow: "0 0 40px color-mix(in srgb, var(--primary) 35%, transparent)" }}>{fmtBRL(month)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, color: "var(--text-dim)" }}>Meta</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{fmtBRL(goal)}</div>
        </div>
      </div>

      <div style={{ marginTop: 22, height: 18, borderRadius: 999, background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, var(--primary), var(--roxo))", transition: "width .8s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 15 }}>
        <span style={{ color: "var(--text-dim)" }}>{pct.toFixed(1)}% atingido</span>
        <span style={{ color: "var(--text-dim)" }}>Falta {fmtBRL(falta)}</span>
      </div>

      <div className="glass glass-spec" style={{ marginTop: 26, padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 18, fontWeight: 600 }}>📈 Projeção do mês</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
          <span className="stat" style={{ fontSize: 28, color: "var(--atencao)" }}>{fmtBRL(proj)}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: projColor, background: `color-mix(in srgb, ${projColor} 18%, transparent)`, padding: "5px 12px", borderRadius: 999 }}>
            {projPct.toFixed(0)}% da meta
          </span>
        </span>
      </div>
    </div>
  );
}
