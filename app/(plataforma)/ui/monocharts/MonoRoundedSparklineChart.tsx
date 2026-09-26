"use client";

// Porte de `src/components/mono-charts/MonoRoundedSparklineChart.tsx` do
// Monocharts: fileiras de telemetria — nome + valor à esquerda, mini-spline
// arredondado à direita, todas dentro de UM palco. A linha pinta com a tinta
// da pessoa.

import { ResponsiveContainer, LineChart, Line } from "recharts";
import { McCard, McCab, McPalco, McRodape, useMcTema } from "./lib";

export interface McLinhaTelemetria { nome: string; valorTexto: string; valores: number[] }

export function MonoRoundedSparklineChart({
  rotulo, selo, valor, sufixo, linhas, rodapeEsq, rodapeDir, compact = false, semCartao = false,
}: {
  rotulo?: string;
  selo?: string;
  valor?: React.ReactNode;
  sufixo?: string;
  linhas: McLinhaTelemetria[];
  rodapeEsq?: React.ReactNode;
  rodapeDir?: React.ReactNode;
  compact?: boolean;
  /** Só o palco (pra viver dentro de outro cartão). */
  semCartao?: boolean;
}) {
  const { tinta } = useMcTema();

  const palco = (
    <McPalco style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-around", gap: 8, padding: 12 }}
      resumo={`Faíscas — ${linhas.map((l) => `${l.nome}: ${l.valorTexto}`).join(", ")}.`}>
      {linhas.map((row, idx) => (
        <div key={row.nome + idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 96, flex: "none", minWidth: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.nome}</span>
            <span style={{ fontSize: 10, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.valorTexto}</span>
          </div>
          <div style={{ flex: 1, height: 28, minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={row.valores.map((y, x) => ({ x, y }))}>
                <Line
                  type="monotone"
                  dataKey="y"
                  stroke={tinta}
                  strokeWidth={2}
                  strokeLinecap="round"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </McPalco>
  );

  if (semCartao) return palco;

  return (
    <McCard compact={compact}>
      {rotulo && <McCab rotulo={rotulo} selo={selo} valor={valor} sufixo={sufixo} />}
      {palco}
      {(rodapeEsq != null || rodapeDir != null) && <McRodape esq={rodapeEsq} dir={rodapeDir} />}
    </McCard>
  );
}
