"use client";

// Porte de `src/components/mono-charts/MonoRoundedKpiCardChart.tsx` do
// Monocharts: rótulo em CAPS + selo, número extrabold com a variação ao lado,
// e o palco embaixo com a onda-faísca em gradiente. Sem histórico o palco sai
// e o cartão vira o KPI compacto — mesma tipografia, sem estágio vazio.

import { useId } from "react";
import { ResponsiveContainer, AreaChart, Area, Tooltip, XAxis, YAxis } from "recharts";
import { McCard, McCab, McPalco, McRodape, useMcTema, useDicaNoBody, resumoDaSerie } from "./lib";
import { McTooltip } from "./tooltip";

/** O palco-faísca do KPI card, sozinho — pra cartões que têm cabeçalho
 *  próprio (ex.: o cartão de vendedora, que abre com avatar e nome). */
export function McFaisca({ valores, altura = 64, rotulos, formatar, nome = "Valor" }: {
  valores: number[]; altura?: number;
  /** Rótulo por ponto (o dia). Sem ele a dica diria só o número, e "26" sem
   *  data não responde nada. */
  rotulos?: string[];
  formatar?: (n: number) => string;
  nome?: string;
}) {
  const { tinta } = useMcTema();
  // A dica sai pro <body>: o palco da faísca tem 44px e recorta tudo.
  const { host, alvo, aoEntrar } = useDicaNoBody();
  const id = useId().replace(/:/g, "");
  const fmtA = formatar ?? ((n: number) => n.toLocaleString("pt-BR"));
  const dados = valores.map((v, i) => ({ v, dia: rotulos?.[i] ?? String(i + 1) }));
  if (!valores || valores.length < 2) return null;
  return (
    // A faísca MOSTRA vinte e um dias — ela não é enfeite, e o ponteiro em cima
    // dela tem que dizer qual dia e quanto. Antes ela era `aria-hidden` e sem
    // dica nenhuma: passar o mouse não fazia absolutamente nada.
    <McPalco style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
      resumo={fmtA ? resumoDaSerie("Faísca", nome, dados.map((d) => ({ rotulo: d.dia, valor: d.v })), fmtA) : undefined}>
      <div ref={alvo} onPointerEnter={aoEntrar} style={{ width: "100%", height: altura }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={dados} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`${id}fGrad`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={tinta} stopOpacity={0.3} />
                <stop offset="100%" stopColor={tinta} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            {/* Eixos escondidos: eles não cabem num cartão de KPI, mas o
                recharts precisa deles pra saber onde está cada ponto — sem o
                XAxis a dica não tem o que anunciar como "quando". */}
            <XAxis dataKey="dia" hide />
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Tooltip portal={host} content={<McTooltip indicator="dot" formatter={(v) => fmtA(Number(v))} />} />
            <Area type="monotone" dataKey="v" name={nome} stroke={tinta} strokeWidth={2.5} strokeLinecap="round"
              fill={`url(#${id}fGrad)`} isAnimationActive={false}
              activeDot={{ r: 4, fill: tinta, stroke: "var(--mc-palco)", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </McPalco>
  );
}

export function MonoRoundedKpiCardChart({
  rotulo, selo, valor, sufixo, delta, deltaBom, historico, rotulos, formatar, rodapeEsq, rodapeDir, aoClicar, alturaFaisca = 96,
}: {
  rotulo: string;
  selo?: string;
  valor: React.ReactNode;
  sufixo?: string;
  /** Texto pronto ("+14,2%"), verde/vermelho por `deltaBom`. */
  delta?: string | null;
  deltaBom?: boolean | null;
  historico?: number[];
  /** Rótulo por ponto do histórico (o dia) — é o "quando" da dica. */
  rotulos?: string[];
  formatar?: (n: number) => string;
  rodapeEsq?: React.ReactNode;
  rodapeDir?: React.ReactNode;
  aoClicar?: () => void;
  alturaFaisca?: number;
}) {
  const temFaisca = !!historico && historico.length > 1;

  return (
    <McCard onClick={aoClicar} style={{ minHeight: 0, ...(temFaisca ? null : { gap: 0 }) }}>
      <McCab rotulo={rotulo} selo={selo} valor={valor} sufixo={sufixo} delta={delta} deltaBom={deltaBom} />
      {temFaisca && <McFaisca valores={historico!} altura={alturaFaisca} rotulos={rotulos} formatar={formatar} nome={rotulo} />}
      {(rodapeEsq != null || rodapeDir != null) && <McRodape esq={rodapeEsq} dir={rodapeDir} />}
    </McCard>
  );
}
