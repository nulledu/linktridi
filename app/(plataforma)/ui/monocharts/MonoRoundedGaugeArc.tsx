"use client";

// Porte de `src/components/mono-charts/MonoRoundedGaugeArc.tsx` do Monocharts:
// arco de 240° (startAngle 210 → endAngle -30), pontas arredondadas
// (cornerRadius 8) e folga entre a fatia cheia e o trilho (paddingAngle 4),
// com o número no pé do arco. O arco pinta com a tinta da pessoa; o trilho
// fica na mesma tinta a 10%, como o original faz com o branco/preto.

import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { McCard, McCab, McPalco, McRodape, useMcTema } from "./lib";

export function MonoRoundedGaugeArc({
  rotulo, selo, valor, sufixo, fracao, centroValor, centroRotulo, centro, cor,
  rodapeEsq, rodapeDir, compact = false, altura, semCartao = false,
}: {
  rotulo?: string;
  selo?: string;
  valor?: React.ReactNode;
  sufixo?: string;
  /** 0 a 1. Acima de 1 satura — o arco não dá a volta. */
  fracao: number;
  centroValor?: React.ReactNode;
  centroRotulo?: string;
  /** Conteúdo livre no pé do arco, quando valor+rótulo não bastam. */
  centro?: React.ReactNode;
  /** Só quando a cor SIGNIFICA estado (meta batida × estourada). */
  cor?: string;
  rodapeEsq?: React.ReactNode;
  rodapeDir?: React.ReactNode;
  compact?: boolean;
  altura?: number;
  /** Só o palco (pra viver dentro de outro cartão). */
  semCartao?: boolean;
}) {
  const { isDark, tinta } = useMcTema();
  const pintura = cor || tinta;
  const f = Math.min(1, Math.max(0, Number.isFinite(fracao) ? fracao : 0));
  const val = Math.round(f * 1000) / 10;
  const data = [
    { name: "Feito", value: val },
    { name: "Falta", value: 100 - val },
  ];
  const h = altura ?? (compact ? 120 : 140);

  const palco = (
    <McPalco style={{ flex: 1, position: "relative" }} resumo={`Medidor — ${val}% de ${rotulo ?? centroRotulo ?? "meta"}.`}>
      <ResponsiveContainer width="100%" height={h}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            cx="50%"
            cy="70%"
            startAngle={210}
            endAngle={-30}
            innerRadius={compact ? 44 : 54}
            outerRadius={compact ? 60 : 72}
            cornerRadius={8}
            paddingAngle={4}
            // Ver a nota no MonoRoundedBarChart.
            isAnimationActive={false}
          >
            <Cell fill={pintura} stroke="none" />
            {/* O trilho: a mesma tinta a 10%, como o original. */}
            <Cell fill={pintura} fillOpacity={isDark ? 0.1 : 0.1} stroke="none" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {(centro != null || centroValor != null || centroRotulo) && (
        <div style={{ position: "absolute", bottom: 14, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none", padding: "0 10px" }}>
          {centro}
          {centroValor != null && (
            <span style={{ fontSize: 19, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: cor || "var(--mc-forte)", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{centroValor}</span>
          )}
          {centroRotulo && (
            <span style={{ fontSize: 10, color: "var(--mc-muted)", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{centroRotulo}</span>
          )}
        </div>
      )}
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
