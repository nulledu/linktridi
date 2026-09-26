"use client";

import { RoscaEtapas } from "../RoscaEtapas";
import { useState, type CSSProperties } from "react";
import { Icon } from "../../Icon";
import { KpiIcone, Selo } from "../../ui/primitives";
import { MonoFaisca } from "../../ui/graficos";
import { CartaoPainel, VazioPainel } from "../../ui/CartaoPainel";
import { Progresso } from "../../ui/micro";
import { MonoRoundedBarChart } from "../../ui/monocharts/MonoRoundedBarChart";
import { PeriodPicker, periodQuery, DEFAULT_PERIOD, type PeriodState } from "../../PeriodPicker";
import { useProduction, fmt } from "../parts";
import { dadoDe, useQuadro } from "../dados";
import { colunasControle, cumprimento } from "@/lib/producao-hub";

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Status: o estado da produção em análise — quanto está em cada etapa, o que
 * entrou e saiu no período e a evolução dia a dia. É o zoom do cartão "Status
 * da produção" da Visão geral (absorveu as antigas abas Status e Pedidos do dia).
 */
export function StatusProducao() {
  const [period, setPeriod] = useState<PeriodState>({ ...DEFAULT_PERIOD, key: "7d" });
  const pronto = period.key !== "custom" || (!!period.from && !!period.to);
  const { snap, err } = useProduction(pronto ? periodQuery(period) : "");
  const quadro = dadoDe(useQuadro());
  const pausados = quadro ? colunasControle(quadro).pausado.length : null;

  if (!snap) return <VazioPainel texto={err ? "Não deu pra ler o ERP agora." : "Carregando o status…"} />;
  const t = snap.trends;
  const p = snap.pipeline;
  const cumpre = cumprimento(t.progMaquina.total, t.fabricados.total);
  // Uma base só: a soma das etapas — a mesma do centro da rosca. O
  // `pipeline.total` do ERP conta pedido sem etapa reconhecida e dava
  // "1.482 no fluxo" em cima de uma rosca com 1.480.
  const etapas = [...p.stages].filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  const noFluxo = etapas.reduce((n, s) => n + s.count, 0);

  return (
    <div className="pv-pilha">
      <PeriodPicker value={period} onChange={setPeriod} />

      <div className="og-kpis kpi-row">
        <KpiIcone label="Em produção" value={p.emProducao} icon="tools" />
        <KpiIcone label="Concluídos hoje" value={t.fabricados.today} anterior={t.fabricados.yesterday} icon="circle-check" cor="var(--ok)" />
        <KpiIcone label="Atrasados" value={p.atrasados} icon="alert-triangle" cor="var(--perigo)" />
        <KpiIcone label="Pausados" value={pausados ?? "—"} icon="player-pause" cor="var(--atencao)" />
      </div>

      <div className="og-duo">
        <CartaoPainel icone="chart-bar" titulo="Status geral" sub={`${fmt(noFluxo)} pedidos no fluxo`}>
          {p.stages.length === 0 ? <VazioPainel texto="Nenhum pedido no fluxo." /> : (
            <RoscaEtapas stages={p.stages} />
          )}
        </CartaoPainel>

        <CartaoPainel icone="list-details" titulo="Por etapa" sub="Quanto do fluxo está em cada uma">
          <ul className="og-lista">
            {etapas.map((s) => (
              <li key={s.id} className="pv-etapa">
                <Icon name={s.icon} size={16} color="var(--primary)" style={{ flex: "none" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="pv-etapa-cab">
                    <span className="og-linha-tit">{s.nome}</span>
                    <span className="og-hora">{fmt(s.count)}/{fmt(noFluxo)}</span>
                  </div>
                  <Progresso valor={s.count} max={Math.max(1, noFluxo)} rotulo={`${s.nome}: ${s.count} de ${noFluxo}`} altura={6} />
                </div>
                <b className="mt-num pv-pct">{noFluxo ? Math.round((s.count / noFluxo) * 100) : 0}%</b>
              </li>
            ))}
          </ul>
        </CartaoPainel>
      </div>

      <CartaoPainel icone="chart-line" titulo="Evolução da produção" sub={`Fabricado × programado para máquina · ${snap.periodLabel}`}>
        <MonoRoundedBarChart semCartao eixoY altura={220} nomePrimario="Fabricado" nomeSecundario="Programado"
          pontos={t.fabricados.days.map((d, i) => ({ label: dm(d.day), primary: d.value, secondary: t.progMaquina.days[i]?.value ?? 0 }))} />
        <div className="og-celulas og-celulas-4">
          <KpiIcone size="sm" label="Fabricados" value={t.fabricados.total} icon="circle-check" cor="var(--ok)" />
          <KpiIcone size="sm" label="Média por dia" value={Math.round(t.fabricados.avg)} icon="chart-bar" />
          <KpiIcone size="sm" label="Cumprimento" value={cumpre == null ? "—" : `${cumpre}%`} icon="chart-line" />
          <KpiIcone size="sm" label="Enviados" value={t.enviados.total} icon="truck-delivery" cor="var(--info)" />
        </div>
      </CartaoPainel>

      <CartaoPainel icone="history" titulo="Entrou × saiu" sub={`O saldo de cada fila no período (${snap.periodLabel})`}>
        <div className="og-duo">
          <InOut label="Máquinas" entrou={t.progMaquina.total} saiu={t.entraramProducao.total} fila={p.aguardandoMaquina} />
          <InOut label="Produção" entrou={t.entraramProducao.total} saiu={t.fabricados.total} fila={p.emProducao} />
        </div>
      </CartaoPainel>

      <CartaoPainel icone="calendar" titulo="Fluxo no período" sub="Quantos pedidos passaram por cada etapa · variação de hoje contra ontem">
        <ul className="og-lista">
          {([
            ["vector-bezier", "Vetores", t.vetores], ["arrows-maximize", "Contornos", t.contornos],
            ["circle-check", "Aprovados", t.aprovados], ["printer", "Prog. máquina", t.progMaquina],
            ["tools", "Entraram produção", t.entraramProducao], ["box", "Fabricados", t.fabricados],
          ] as const).map(([icone, rotulo, tr]) => (
            <li key={rotulo} className="pv-fluxo">
              <span className="og-cartao-icone" aria-hidden><Icon name={icone} size={16} color="var(--primary)" /></span>
              <span className="pv-fluxo-rot">
                <span className="og-linha-tit">{rotulo}</span>
                <span className="og-linha-sub">hoje {fmt(tr.today)} · média {fmt(Math.round(tr.avg))}/dia</span>
              </span>
              <span className="pv-fluxo-faisca"><MonoFaisca valores={tr.days.map((d) => d.value)} altura={30} /></span>
              <b className="stat mt-num pv-fluxo-total">{fmt(tr.total)}</b>
              <Selo tom={tr.deltaPct === 0 ? "neutro" : tr.deltaPct > 0 ? "ok" : "perigo"}>{tr.deltaPct > 0 ? "+" : ""}{Math.round(tr.deltaPct)}%</Selo>
            </li>
          ))}
        </ul>
      </CartaoPainel>
    </div>
  );
}

function InOut({ label, entrou, saiu, fila, style }: { label: string; entrou: number; saiu: number; fila: number; style?: CSSProperties }) {
  const saldo = entrou - saiu;
  return (
    <div className="pv-inout" style={style}>
      <div style={{ fontSize: 14, fontWeight: 800 }}>{label}</div>
      <div className="og-celulas">
        <KpiIcone size="sm" label="Entraram" value={entrou} icon="arrow-down" cor="var(--ok)" />
        <KpiIcone size="sm" label="Saíram" value={saiu} icon="arrow-up" cor="var(--info)" />
        <KpiIcone size="sm" label="Saldo" value={`${saldo > 0 ? "+" : ""}${fmt(saldo)}`} icon="box" cor={saldo > 0 ? "var(--atencao)" : "var(--ok)"} />
      </div>
      <div className="pv-inout-pe">
        <span>Na fila agora</span>
        <b className="stat mt-num">{fmt(fila)}</b>
      </div>
    </div>
  );
}
