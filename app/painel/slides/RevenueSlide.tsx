"use client";

import { useEffect, useState } from "react";
import type { Period, SalesSnapshot } from "@/lib/types";
import { fmtBRL } from "@/lib/format";
import { Icon } from "@/app/(plataforma)/Icon";

const PERIODS: { key: Period; label: string }[] = [
  { key: "daily", label: "Hoje" },
  { key: "weekly", label: "Semana" },
  { key: "monthly", label: "Mês" },
];

// Faturamento — cicla diário/semanal/mensal dentro do próprio slide.
export function RevenueSlide({ sales }: { sales: SalesSnapshot }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % PERIODS.length), 4000);
    return () => clearInterval(id);
  }, []);
  const period = PERIODS[i];
  const value = sales.revenue[period.key];
  const up = sales.revenue.trendPct >= 0;

  return (
    <div style={{ textAlign: "center" }}>
      <h2 style={{ fontSize: 36, fontWeight: 700, marginBottom: 12, color: "var(--text-dim)" }}>
        Faturamento
      </h2>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 36 }}>
        {PERIODS.map((p, idx) => {
          const active = idx === i;
          return (
            <span
              key={p.key}
              style={{
                padding: "9px 20px",
                fontSize: 16,
                fontWeight: 700,
                borderRadius: 999,
                color: active ? "#fff" : "var(--text-dim)",
                background: active ? "color-mix(in srgb, var(--primary) 22%, transparent)" : "transparent",
                border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                transition: "all .3s ease",
              }}
            >
              {p.label}
            </span>
          );
        })}
      </div>
      <div key={period.key} style={{ animation: "fadeUp .5s ease" }}>
        <div className="stat" style={{ fontSize: "9vw", textShadow: "0 0 60px color-mix(in srgb, var(--secondary) 30%, transparent)" }}>
          {fmtBRL(value)}
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 24,
            fontWeight: 600,
            color: up ? "var(--secondary)" : "var(--perigo)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {/* Tabler, e não ▲/▼. Numa parede de TV isso não é preciosismo: o
              glifo tipográfico muda de desenho e de peso conforme a fonte que o
              aparelho tem, e a 3 metros de distância uma seta fina de fonte
              genérica simplesmente não se lê. O ícone tem stroke e tamanho
              próprios. O `Widgets.tsx` já havia sido convertido; este slide
              tinha ficado atrás. */}
          <Icon name={up ? "trending-up" : "trending-down"} size={26} color={up ? "var(--secondary)" : "var(--perigo)"} />
          {Math.abs(sales.revenue.trendPct).toFixed(1)}% vs período anterior
        </div>
      </div>
    </div>
  );
}
