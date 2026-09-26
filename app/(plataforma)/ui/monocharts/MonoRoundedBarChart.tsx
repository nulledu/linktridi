"use client";

// Porte de `src/components/mono-charts/MonoRoundedBarChart.tsx` do Monocharts:
// barras-pílula (raio 8 nas pontas), grade pontilhada, seletor Col/Row no
// cabeçalho. A série primária pinta com a tinta da pessoa; a secundária fica
// no cinza translúcido do original.

import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { McCard, McCab, McPalco, McRodape, McPills, McTabela, McBotaoNumeros, useMcTema, useDicaNoBody, mcGrade, mcTick, mcApoio, resumoDaSerie } from "./lib";
import { McTooltip } from "./tooltip";
import { curto } from "../graficos";

export interface McBarra { label: string; primary: number; secondary?: number }

export function MonoRoundedBarChart({
  rotulo, selo, valor, sufixo, pontos, nomePrimario = "Valor", nomeSecundario = "Apoio",
  formatar, rodapeEsq, rodapeDir, compact = false, altura, alternarLayout = false, horizontal = false,
  eixoY = true, semCartao = false, destaque, aoClicar, alturaBarra,
}: {
  rotulo?: string;
  selo?: string;
  valor?: React.ReactNode;
  sufixo?: string;
  pontos: McBarra[];
  nomePrimario?: string;
  nomeSecundario?: string;
  formatar?: (n: number) => string;
  rodapeEsq?: React.ReactNode;
  rodapeDir?: React.ReactNode;
  compact?: boolean;
  altura?: number;
  /** Liga o seletor Col/Row do arquivo original. */
  alternarLayout?: boolean;
  horizontal?: boolean;
  eixoY?: boolean;
  /** Só o palco (pra viver dentro de outro cartão). */
  semCartao?: boolean;
  /** Índice pintado cheio, com as outras barras recuadas — o "hoje", o pico.
   *  É a única leitura que alguém tira de uma distribuição de horas, e a olho
   *  nu comparar alturas parecidas não resolve. */
  destaque?: number;
  /** Clique numa barra — recebe o índice do ponto. Sem isto, uma barra que
   *  leva a algum lugar não teria como dizer isso. */
  aoClicar?: (i: number) => void;
  /** Espessura da barra. Numa fila de dez etapas, 12px vira risco. */
  alturaBarra?: number;
}) {
  const { isDark, tinta } = useMcTema();
  // A dica sai pro <body>: cartão e palco recortam (overflow: hidden).
  const { host, alvo, aoEntrar } = useDicaNoBody();
  const [layout, setLayout] = useState<"vertical" | "horizontal">(horizontal ? "horizontal" : "vertical");
  const [numeros, setNumeros] = useState(false);
  const isHorizontal = layout === "horizontal";
  const temSecundaria = pontos.some((p) => p.secondary != null);
  const h = altura ?? (compact ? 130 : 160);

  const fmtA = formatar ?? ((n: number) => n.toLocaleString("pt-BR"));
  const palco = (
    <McPalco style={{ flex: 1 }} resumo={resumoDaSerie("Barras", nomePrimario, pontos.map((p) => ({ rotulo: p.label, valor: p.primary })), fmtA)}>
        <div ref={alvo} onPointerEnter={aoEntrar} style={{ width: "100%" }}>
          <ResponsiveContainer width="100%" height={h}>
            <BarChart
              accessibilityLayer
              data={pontos}
              layout={isHorizontal ? "vertical" : "horizontal"}
              margin={{ top: 12, right: 12, left: isHorizontal ? 0 : -22, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="2 2" vertical={false} stroke={mcGrade(isDark)} />
              {isHorizontal ? (
                <>
                  <XAxis type="number" hide />
                  <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: mcTick(isDark) }} width={86} />
                </>
              ) : (
                <>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: mcTick(isDark) }} minTickGap={18} />
                  {eixoY && <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: mcTick(isDark) }} tickFormatter={(v: number) => curto(v)} width={52} />}
                </>
              )}
              <Tooltip portal={host} content={<McTooltip indicator="dot" formatter={formatar ? (v) => formatar(Number(v)) : undefined} />} cursor={{ fill: mcGrade(isDark) }} />
              {/* `isAnimationActive={false}` NÃO é preferência de gosto: a
                  animação de entrada do recharts anima a FORMA a partir do zero,
                  e quando ela não roda (React 19 + StrictMode remonta o efeito no
                  dev, e o react-smooth às vezes fica no primeiro quadro) a barra
                  simplesmente não pinta — o eixo, a grade e a dica ficam de pé e o
                  dado some. Foi assim que barra, rosca e medidor apareceram vazios
                  sem erro nenhum no console. Linha e área sobrevivem porque animam
                  um traço JÁ desenhado; aqui não há o que sobreviver.
                  O movimento de entrada, se for desejado, sai da escala do app
                  (`--duration-*`), não de um relógio próprio de biblioteca. */}
              <Bar
                dataKey="primary"
                name={nomePrimario}
                fill={tinta}
                radius={isHorizontal ? [0, 8, 8, 0] : [8, 8, 8, 8]}
                barSize={alturaBarra ?? (isHorizontal ? 12 : 16)}
                isAnimationActive={false}
                cursor={aoClicar ? "pointer" : undefined}
                onClick={aoClicar ? ((_: unknown, i: number) => aoClicar(i)) : undefined}
              >
                {/* Com destaque, o pico fica na tinta cheia e o resto recua —
                    mesma cor, só a presença muda. Sem destaque, todas iguais. */}
                {destaque != null && pontos.map((p, k) => (
                  <Cell key={p.label + k} fillOpacity={k === destaque ? 1 : 0.38} />
                ))}
              </Bar>
              {temSecundaria && (
                <Bar
                  dataKey="secondary"
                  name={nomeSecundario}
                  fill={mcApoio(isDark)}
                  radius={isHorizontal ? [0, 8, 8, 0] : [8, 8, 8, 8]}
                  barSize={isHorizontal ? 12 : 16}
                  isAnimationActive={false}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
    </McPalco>
  );

  const corpo = numeros
    ? <McTabela rotuloCol="Etapa" nome={nomePrimario} nomeApoio={temSecundaria ? nomeSecundario : undefined} formatar={fmtA}
        linhas={pontos.map((p) => ({ rotulo: p.label, valor: p.primary, apoio: p.secondary }))} />
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
        rotulo={rotulo ?? ""} selo={selo} valor={valor} sufixo={sufixo}
        acoes={alternarLayout ? (
          <McPills
            itens={[{ valor: "vertical", rotulo: "Col" }, { valor: "horizontal", rotulo: "Row" }]}
            valor={layout} onMuda={setLayout} ariaLabel="Direção das barras"
          />
        ) : undefined}
      />
      {corpo}
      <McRodape esq={rodapeEsq ?? alternar} dir={rodapeEsq != null ? alternar : rodapeDir} />
    </McCard>
  );
}
