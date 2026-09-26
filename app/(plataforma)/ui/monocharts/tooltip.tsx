"use client";

// Porte de `src/components/dither-charts/lib/recharts-tooltip.tsx` do
// Monocharts. Tailwind → inline com os mesmos valores; os fundos/bordas
// seguem o tema pelo `.mc-tooltip` do globals.css. A cor do indicador vem do
// payload (a tinta da pessoa), como no original.

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ReactNode } from "react";

export interface ChartTooltipContentProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  indicator?: "dot" | "line";
  formatter?: (value: any, name: string) => ReactNode;
}

export function McTooltip({ active, payload, label, indicator = "dot", formatter }: ChartTooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="mc-tooltip">
      {label && <div className="mc-tooltip-rotulo">{label}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {payload.map((item, idx) => {
          const color = item.color || item.fill || "var(--text)";
          const valueDisplay = formatter
            ? formatter(item.value, item.name)
            : typeof item.value === "number"
              ? item.value.toLocaleString("pt-BR")
              : item.value;
          return (
            <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              {/* O NOME da série primeiro, pequeno e apagado; o VALOR embaixo,
                  grande. É a hierarquia da legenda invertida de propósito: aqui
                  a pessoa JÁ sabe qual série ela apontou — o que ela veio
                  buscar é o número, e ele tem que ser a primeira coisa que o
                  olho encontra. */}
              <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                {/* Traço, não quadrado: no tamanho da dica um bloco cheio é
                    peso de dado fazendo trabalho de rótulo. */}
                <span aria-hidden style={{
                  width: 12, height: indicator === "dot" ? 3 : 2, borderRadius: 999,
                  background: color, flex: "none",
                }} />
                <span className="mc-tooltip-serie">{item.name || item.dataKey}</span>
              </span>
              <span className="mc-tooltip-valor">{valueDisplay}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
