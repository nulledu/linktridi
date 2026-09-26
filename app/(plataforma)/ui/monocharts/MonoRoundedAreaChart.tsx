"use client";

// Porte de `src/components/mono-charts/MonoRoundedAreaChart.tsx` do
// Monocharts. Mesma estrutura: cartão → cabeçalho com pílulas de curva →
// palco com a área de gradiente suave → rodapé. Os dados de demonstração
// viraram props; a série pinta com a tinta da pessoa em vez de branco/preto.

import { useId, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { McCard, McCab, McPalco, McRodape, McPills, McTabela, McBotaoNumeros, useMcTema, useDicaNoBody, mcGrade, mcTick, resumoDaSerie } from "./lib";
import { McTooltip } from "./tooltip";
import { curto } from "../graficos";

export interface McPonto { rotulo: string; valor: number }

export function MonoRoundedAreaChart({
  rotulo, selo, valor, sufixo, delta, deltaBom, pontos, nome = "Valor", formatar,
  rotuloDe, rodapeEsq, rodapeDir, compact = false, altura, curvas = false, eixoY = true, semCartao = false,
}: {
  rotulo?: string;
  selo?: string;
  valor?: React.ReactNode;
  sufixo?: string;
  delta?: string | null;
  deltaBom?: boolean | null;
  pontos: McPonto[];
  /** Nome da série na dica. */
  nome?: string;
  formatar?: (n: number) => string;
  rotuloDe?: (r: string) => string;
  rodapeEsq?: React.ReactNode;
  rodapeDir?: React.ReactNode;
  compact?: boolean;
  altura?: number;
  /** Liga o seletor monotone/natural do arquivo original. */
  curvas?: boolean;
  eixoY?: boolean;
  /** Só o palco (pra viver dentro de outro cartão). */
  semCartao?: boolean;
}) {
  const { isDark, tinta } = useMcTema();
  // A dica sai pro <body>: cartão e palco recortam (overflow: hidden).
  const { host, alvo, aoEntrar } = useDicaNoBody();
  const idPrefix = useId().replace(/:/g, "");
  const [curve, setCurve] = useState<"monotone" | "natural">("monotone");
  const [numeros, setNumeros] = useState(false);
  const data = pontos.map((p) => ({ time: rotuloDe ? rotuloDe(p.rotulo) : p.rotulo, volume: p.valor }));
  const h = altura ?? (compact ? 130 : 160);

  const fmtA = formatar ?? ((n: number) => n.toLocaleString("pt-BR"));
  const palco = (
    <McPalco style={{ flex: 1 }} resumo={resumoDaSerie("Área", nome, pontos, fmtA)}>
      <svg style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }} aria-hidden="true">
        <defs>
          <linearGradient id={`${idPrefix}mono-area-gradient`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tinta} stopOpacity={isDark ? "0.35" : "0.25"} />
            <stop offset="100%" stopColor={tinta} stopOpacity="0.0" />
          </linearGradient>
        </defs>
      </svg>
      <div ref={alvo} onPointerEnter={aoEntrar} style={{ width: "100%" }}>
        <ResponsiveContainer width="100%" height={h}>
          {/* `left` não passa de -4: com -22 sobravam 30px dos 52 do eixo, e
              "4,5 mil" perdia o "4," — o eixo lia 6 / 5 / 3 / 5 mil. */}
          <AreaChart accessibilityLayer data={data} margin={{ top: 12, right: 12, left: eixoY ? -4 : 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 2" vertical={false} stroke={mcGrade(isDark)} />
            <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: mcTick(isDark) }} minTickGap={22} />
            {eixoY && <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: mcTick(isDark) }} tickFormatter={(v: number) => curto(v)} width={52} />}
            <Tooltip portal={host} content={<McTooltip indicator="dot" formatter={formatar ? (v) => formatar(Number(v)) : undefined} />} />
            <Area
              type={curve}
              dataKey="volume"
              name={nome}
              stroke={tinta}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={`url(#${idPrefix}mono-area-gradient)`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </McPalco>
  );

  const corpo = numeros
    ? <McTabela formatar={fmtA} nome={nome} linhas={pontos.map((p) => ({ ...p, rotulo: rotuloDe ? rotuloDe(p.rotulo) : p.rotulo }))} />
    : palco;
  const alternar = <McBotaoNumeros ver={numeros} onMuda={setNumeros} />;

  if (semCartao) return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>{alternar}</div>
      {corpo}
    </>
  );

  return (
    <McCard compact={compact}>
      <McCab
        rotulo={rotulo ?? ""} selo={selo} valor={valor} sufixo={sufixo} delta={delta} deltaBom={deltaBom}
        acoes={curvas ? (
          <McPills
            itens={[{ valor: "monotone", rotulo: "suave" }, { valor: "natural", rotulo: "natural" }]}
            valor={curve} onMuda={setCurve} ariaLabel="Curva do gráfico"
          />
        ) : undefined}
      />
      {corpo}
      <McRodape esq={rodapeEsq ?? alternar} dir={rodapeEsq != null ? alternar : rodapeDir} />
    </McCard>
  );
}
