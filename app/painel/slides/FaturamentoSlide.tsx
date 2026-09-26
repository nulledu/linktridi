"use client";

import { useEffect, useState } from "react";
import type { PanelConfig, Period, SalesSnapshot } from "@/lib/types";
import { fmtBRL } from "@/lib/format";

const PERIODS: { key: Period; label: string }[] = [
  { key: "daily", label: "DE HOJE" },
  { key: "weekly", label: "DA SEMANA" },
  { key: "monthly", label: "DO MÊS" },
];

// Faturamento em destaque máximo (estilo executivo). Cicla Hoje / Semana / Mês.
export function FaturamentoSlide({ sales, config }: { sales: SalesSnapshot; config: PanelConfig }) {
  const [pi, setPi] = useState(2);
  useEffect(() => {
    const id = setInterval(() => setPi((x) => (x + 1) % PERIODS.length), 6500);
    return () => clearInterval(id);
  }, []);
  const period = PERIODS[pi];

  const value = sales.revenue[period.key];
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthGoal = config.monthlyRevenueGoal || 0;
  const goal =
    period.key === "monthly" ? monthGoal : period.key === "weekly" ? (monthGoal * 7) / daysInMonth : monthGoal / daysInMonth;
  const pct = goal > 0 ? (value / goal) * 100 : 0;

  return (
    <div style={{ width: "100%", maxWidth: 1140, textAlign: "left" }}>
      <div key={period.key} style={{ animation: "fadeUp .5s ease" }}>
        <div style={labelStyle}>FATURAMENTO {period.label}</div>
        <div className="stat" style={{ fontSize: 150, lineHeight: 1, marginTop: 4, textShadow: "0 0 60px color-mix(in srgb, var(--primary) 30%, transparent)" }}>
          {fmtBRL(value)}
        </div>
      </div>

      <div style={{ marginTop: 36, height: 16, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, var(--azul), var(--roxo))", boxShadow: "0 0 30px -4px #6f5cff", transition: "width 1s cubic-bezier(.16,1,.3,1)" }} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span className="stat" style={{ fontSize: 72, color: "var(--roxo)" }}>{pct.toFixed(0)}%</span>
          <span style={{ fontSize: 22, fontWeight: 600, color: "var(--text-dim)" }}>da meta</span>
        </div>
        <span style={{ fontSize: 22, fontWeight: 600, color: "var(--text-dim)" }}>
          Meta: <span style={{ color: "var(--text)", fontWeight: 700 }}>{fmtBRL(goal)}</span>
        </span>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 800,
  letterSpacing: "0.08em",
  color: "var(--text-dim)",
};
