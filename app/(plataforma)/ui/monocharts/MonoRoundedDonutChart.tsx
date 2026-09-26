"use client";

// Porte de `src/components/mono-charts/MonoRoundedDonutChart.tsx` do
// Monocharts: rosca de pontas arredondadas (cornerRadius 8, paddingAngle 6),
// número no centro que troca no hover, legenda no rodapé. A escada de
// opacidade 1 → 0.7 → 0.4 → 0.2 do original fica — só que sobre a tinta da
// pessoa em vez do branco/preto.

import { useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { McCard, McCab, McPalco, useMcTema, useDicaNoBody } from "./lib";
import { McTooltip } from "./tooltip";

export interface McFatia {
  name: string;
  value: number;
  /** Degrau da escada carimbado por QUEM CHAMA, quando a lista de fatias pode
   *  encolher (canal que zerou some do desenho). Sem ele o tom viria do índice
   *  pós-filtro, e os sobreviventes seriam repintados — quem aprendeu "Comercial
   *  é o mais escuro" passaria a ser enganado no mês seguinte. */
  degrau?: number;
}

// A escada do arquivo original tinha 4 degraus; fatia extra continua descendo.
// Exportada porque a legenda que vive FORA do cartão precisa repetir a mesma
// opacidade da fatia, senão ela mente.
export const DEGRAUS = [1, 0.7, 0.4, 0.2, 0.12];
export const degrau = (i: number) => DEGRAUS[Math.min(i, DEGRAUS.length - 1)];

export function MonoRoundedDonutChart({
  rotulo, selo, valor, sufixo, fatias, formatar, centroRotulo = "total", totalTexto, compact = false, altura, semCartao = false,
}: {
  rotulo?: string;
  selo?: string;
  valor?: React.ReactNode;
  sufixo?: string;
  fatias: McFatia[];
  formatar?: (n: number) => string;
  /** O que fica escrito no centro quando nada está sob o ponteiro. */
  centroRotulo?: string;
  /** Total já formatado, quando a soma das fatias NÃO é o total verdadeiro
   *  (ex.: no Financeiro os valores negativos são cortados do desenho, mas
   *  continuam no total). Sem isto o centro contradiria a tela. */
  totalTexto?: string;
  compact?: boolean;
  altura?: number;
  /** Só o palco (pra viver dentro de outro cartão). */
  semCartao?: boolean;
}) {
  const { isDark, tinta } = useMcTema();
  // A dica sai pro <body>: cartão e palco recortam (overflow: hidden).
  const { host, alvo, aoEntrar } = useDicaNoBody();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const total = fatias.reduce((acc, f) => acc + f.value, 0);
  const fmt = formatar ?? ((n: number) => n.toLocaleString("pt-BR"));
  const h = altura ?? (compact ? 130 : 160);

  const resumo = `Rosca — ${fatias.length} fatias, total ${totalTexto ?? fmt(total)}. ` +
    fatias.map((f) => `${f.name}: ${fmt(f.value)}${total > 0 ? ` (${Math.round((f.value / total) * 100)}%)` : ""}`).join(", ");

  // A folga entre fatias e o arredondamento da ponta são do arquivo original,
  // que demonstra com quatro fatias parecidas (45/30/15/10). Com dado real uma
  // delas pode valer 0,4% — e aí a folga de 6° é MAIOR que a própria fatia: o
  // anel abre um rombo e a fatia minúscula vira um toco torto. Medido na tela
  // de Faturamento. A folga passa a caber na menor fatia.
  const menorFrac = total > 0 ? Math.min(...fatias.map((f) => f.value / total)) : 1;
  const grausDaMenor = menorFrac * 360;
  const folga = Math.max(0, Math.min(6, grausDaMenor - 1));
  const pontaRedonda = Math.max(2, Math.min(8, Math.round(grausDaMenor)));
  const palco = (
    // Sem `centro` (flex) de propósito: dentro de um contêiner flex o
    // ResponsiveContainer do recharts mede 0 de largura e a rosca não desenha
    // fatia nenhuma. Ela já se centra sozinha (cx/cy em 50%), e o número do
    // meio é `position: absolute`.
    <McPalco style={{ flex: 1, position: "relative" }} resumo={resumo}>
      <div ref={alvo} onPointerEnter={aoEntrar} style={{ width: "100%" }}>
        <ResponsiveContainer width="100%" height={h}>
          <PieChart>
            <Tooltip portal={host} content={<McTooltip indicator="dot" formatter={(v) => fmt(Number(v))} />} />
            <Pie
              data={fatias}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={compact ? 38 : 46}
              outerRadius={compact ? 58 : 68}
              paddingAngle={folga}
              cornerRadius={pontaRedonda}
              onMouseEnter={(_, idx) => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
              // Ver a nota no MonoRoundedBarChart: setor animado a partir do zero
              // fica invisível quando a animação do recharts não roda.
              isAnimationActive={false}
            >
              {fatias.map((f, index) => {
                const isHovered = hoverIndex === index;
                return (
                  <Cell
                    key={`mono-cell-${index}`}
                    fill={tinta}
                    fillOpacity={f.degrau ?? degrau(index)}
                    stroke={isDark ? "#181818" : "#FFFFFF"}
                    strokeWidth={2}
                    style={{
                      transform: isHovered ? "scale(1.05)" : "scale(1)",
                      transformOrigin: "center center",
                      transition: "transform var(--duration-quick) var(--ease-smooth-out)",
                      cursor: "pointer",
                    }}
                  />
                );
              })}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* O número no centro: total em repouso, a fatia sob o ponteiro no hover. */}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none", textAlign: "center", padding: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {hoverIndex !== null && fatias[hoverIndex] ? fmt(fatias[hoverIndex].value) : (totalTexto ?? fmt(total))}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-dim)", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {hoverIndex !== null && fatias[hoverIndex]
            ? `${fatias[hoverIndex].name} · ${total > 0 ? Math.round((fatias[hoverIndex].value / total) * 100) : 0}%`
            : centroRotulo}
        </span>
      </div>
    </McPalco>
  );

  if (semCartao) return palco;

  return (
    <McCard compact={compact}>
      {rotulo && <McCab rotulo={rotulo} selo={selo} valor={valor} sufixo={sufixo} />}
      {palco}
      {/* Legenda do rodapé, como no arquivo original — o ponto repete a
          opacidade da fatia pra legenda não mentir. */}
      <div className="mc-rodape" style={{ justifyContent: "flex-start", flexWrap: "wrap", columnGap: 12 }}>
        {fatias.map((f, idx) => (
          <span key={f.name + idx} style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: tinta, opacity: f.degrau ?? degrau(idx), flex: "none" }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
          </span>
        ))}
      </div>
    </McCard>
  );
}
