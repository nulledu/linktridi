"use client";

// Porte de `src/components/mono-charts/MonoRoundedLineChart.tsx` do Monocharts:
// spline de 3px com ponto redondo no vértice, série de apoio tracejada em
// cinza, grade pontilhada 3 3. A principal pinta com a tinta da pessoa; a de
// apoio fica cinza de propósito — ela é a meta / a linha de base, e colori-la
// faria disputar atenção com o dado.

import { useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { McCard, McCab, McPalco, McRodape, McPills, McTabela, McBotaoNumeros, useMcTema, useDicaNoBody, mcGrade, mcTick, resumoDaSerie } from "./lib";
import { McTooltip } from "./tooltip";
import { curto } from "../graficos";

export interface McLinhaPonto { rotulo: string; valor: number; apoio?: number }

export function MonoRoundedLineChart({
  rotulo, selo, valor, sufixo, delta, deltaBom, pontos, nome = "Valor", nomeApoio = "Meta",
  formatar, rotuloDe, rodapeEsq, rodapeDir, compact = false, altura, eixoY = true, semCartao = false,
}: {
  rotulo?: string;
  selo?: string;
  valor?: React.ReactNode;
  sufixo?: string;
  delta?: string | null;
  deltaBom?: boolean | null;
  pontos: McLinhaPonto[];
  nome?: string;
  nomeApoio?: string;
  formatar?: (n: number) => string;
  rotuloDe?: (r: string) => string;
  rodapeEsq?: React.ReactNode;
  rodapeDir?: React.ReactNode;
  compact?: boolean;
  altura?: number;
  eixoY?: boolean;
  /** Só o palco (pra viver dentro de outro cartão). */
  semCartao?: boolean;
}) {
  const { isDark, tinta } = useMcTema();
  // A dica sai pro <body>: cartão e palco recortam (overflow: hidden).
  const { host, alvo, aoEntrar } = useDicaNoBody();
  const temApoio = pontos.some((p) => p.apoio != null);
  // O seletor "Dual/Single" do arquivo original só faz sentido quando existe
  // a segunda série — sem ela seria um controle que não muda nada.
  const [serie, setSerie] = useState<"all" | "value">("all");
  const [numeros, setNumeros] = useState(false);
  const data = pontos.map((p) => ({ label: rotuloDe ? rotuloDe(p.rotulo) : p.rotulo, value: p.valor, secondary: p.apoio }));
  const h = altura ?? (compact ? 130 : 160);
  // O ponto no vértice some quando há muitos dias — 30 bolinhas viram serrilha.
  const comPonto = data.length <= 14;

  const fmtA = formatar ?? ((n: number) => n.toLocaleString("pt-BR"));
  const palco = (
    <McPalco style={{ flex: 1 }} resumo={resumoDaSerie("Linha", nome, pontos, fmtA)}>
      <div ref={alvo} onPointerEnter={aoEntrar} style={{ width: "100%" }}>
        <ResponsiveContainer width="100%" height={h}>
          {/* `left` não passa de -4: com -22 o rótulo "4,5 mil" virava "5 mil". */}
          <LineChart accessibilityLayer data={data} margin={{ top: 12, right: 12, left: eixoY ? -4 : 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={mcGrade(isDark)} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: mcTick(isDark) }} minTickGap={22} />
            {eixoY && <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: mcTick(isDark) }} tickFormatter={(v: number) => curto(v)} width={52} />}
            <Tooltip portal={host} content={<McTooltip indicator="dot" formatter={formatar ? (v) => formatar(Number(v)) : undefined} />} />

            {temApoio && serie === "all" && (
              <Line
                type="monotone"
                dataKey="secondary"
                name={nomeApoio}
                stroke={isDark ? "#52525B" : "#A1A1AA"}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
              />
            )}

            <Line
              type="monotone"
              dataKey="value"
              name={nome}
              stroke={tinta}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={comPonto ? { r: 4, fill: tinta, stroke: isDark ? "#181818" : "#FFFFFF", strokeWidth: 2 } : false}
              activeDot={{ r: 5, fill: tinta, stroke: isDark ? "#181818" : "#FFFFFF", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </McPalco>
  );

  // Legenda: obrigatória a partir de DUAS séries. Ela repete o TRAÇO (cheio ×
  // tracejado), não só a cor — as duas séries aqui são tinta e cinza, então cor
  // sozinha as deixaria idênticas em preto e branco ou pra quem não distingue
  // matiz. Com uma série só ela não existe: o rótulo do cartão já a nomeia.
  const legenda = temApoio && serie === "all" ? (
    <div className="mono-legenda">
      <span><i />{nome}</span>
      <span data-mono="apoio"><i />{nomeApoio}</span>
    </div>
  ) : null;

  const corpo = numeros
    ? <McTabela formatar={fmtA} nome={nome} nomeApoio={temApoio ? nomeApoio : undefined}
        // O MESMO rótulo do eixo: a tabela mostrando "2026-08-01" onde o
        // gráfico mostra "01/08" são duas leituras do mesmo dia que não se
        // reconhecem uma na outra.
        linhas={pontos.map((p) => ({ ...p, rotulo: rotuloDe ? rotuloDe(p.rotulo) : p.rotulo }))} />
    : palco;
  const alternar = <McBotaoNumeros ver={numeros} onMuda={setNumeros} />;

  if (semCartao) return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        {legenda}
        <span style={{ marginLeft: "auto" }}>{alternar}</span>
      </div>
      {corpo}
    </>
  );

  return (
    <McCard compact={compact}>
      <McCab
        rotulo={rotulo ?? ""} selo={selo} valor={valor} sufixo={sufixo} delta={delta} deltaBom={deltaBom}
        acoes={temApoio ? (
          // Os rótulos eram "com meta" / "só real", fixos. Só UM dos cinco
          // gráficos que usam esta peça tem meta como série de apoio: nos
          // outros o apoio é "Enviado", "Anterior", "Investimento" — e a pílula
          // prometia um recorte de meta que não existe no desenho. Agora ela
          // diz o que faz (as duas séries, ou só a principal) e empresta o nome
          // de quem chamou.
          <McPills
            itens={[{ valor: "all", rotulo: "as duas" }, { valor: "value", rotulo: `só ${nome.toLowerCase()}` }]}
            valor={serie} onMuda={setSerie} ariaLabel="Séries do gráfico"
          />
        ) : undefined}
      />
      {legenda}
      {corpo}
      <McRodape esq={rodapeEsq ?? alternar} dir={rodapeEsq != null ? alternar : rodapeDir} />
    </McCard>
  );
}
