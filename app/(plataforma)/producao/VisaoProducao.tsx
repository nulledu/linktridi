"use client";

import { RoscaEtapas } from "./RoscaEtapas";
import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { KpiIcone, Selo } from "../ui/primitives";
import { CartaoPainel, VazioPainel } from "../ui/CartaoPainel";
import { AnelProgresso } from "../ui/micro";
import { MonoRoundedBarChart } from "../ui/monocharts/MonoRoundedBarChart";
import type { ProductionSnapshot } from "@/lib/producao";
import type { MaquinaControle } from "@/lib/maquina-fila";
import type { Quadro } from "@/lib/maquina-quadro";
import { duracao } from "@/lib/maquina-quadro";
import {
  ESTADO_MAQUINA, agendaProjetada, colunasControle, cumprimento, estadoMaquina, minutosDeUso, resumoMaquinas,
} from "@/lib/producao-hub";
import { useProduction, fmt } from "./parts";
import { dadoDe, useMaquinas, useQuadro } from "./dados";
import type { PermsProducao } from "./ProducaoCasca";

const TZ = "America/Sao_Paulo";
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const diaCurto = (iso: string) => DIAS[new Date(`${iso.slice(0, 10)}T12:00:00-03:00`).getDay()];
export const horaSP = (d: Date | string) => new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

interface Alerta { texto: string; sub: string; href: string; tom: "perigo" | "atencao" }

/** O que pede atenção na Produção, do mais grave pro menos. */
export function alertasProducao(snap: ProductionSnapshot | null, ms: MaquinaControle[] | null, perms: PermsProducao): Alerta[] {
  const a: Alerta[] = [];
  const hStatus = perms.status ? "/producao/status" : "/producao";
  const hCtl = perms.controle ? "/producao/controle" : "/producao";
  for (const m of ms ?? []) {
    const e = estadoMaquina(m);
    if (e === "parada" || e === "manutencao") a.push({ tom: e === "parada" ? "perigo" : "atencao", texto: `${m.nome}: ${ESTADO_MAQUINA[e].rotulo.toLowerCase()}`, sub: m.paradaMotivo ?? "", href: "/producao/maquinas" });
  }
  if (snap?.pipeline.atrasados) a.push({ tom: "perigo", texto: `${snap.pipeline.atrasados} ${snap.pipeline.atrasados === 1 ? "pedido atrasado" : "pedidos atrasados"}`, sub: "Status", href: hStatus });
  if (snap?.pipeline.urgentes) a.push({ tom: "atencao", texto: `${snap.pipeline.urgentes} ${snap.pipeline.urgentes === 1 ? "pedido urgente" : "pedidos urgentes"}`, sub: "Controle agora", href: hCtl });
  for (const ac of snap?.acoes ?? []) {
    if (ac.severidade !== "ok" && ac.value > 0) a.push({ tom: ac.severidade === "alta" ? "perigo" : "atencao", texto: `${fmt(ac.value)} · ${ac.label}`, sub: "Controle agora", href: hCtl });
  }
  const semApontar = (ms ?? []).reduce((s, m) => s + m.semApontamentoHoje, 0);
  if (semApontar) a.push({ tom: "atencao", texto: `${semApontar} ${semApontar === 1 ? "programação fechada" : "programações fechadas"} sem apontar peça`, sub: "Máquinas", href: "/producao/maquinas" });
  return a;
}

export function VisaoProducao({ perms }: { perms: PermsProducao }) {
  const router = useRouter();
  const { snap, err } = useProduction("period=7d");
  const lm = useMaquinas();
  const lq = useQuadro();
  const maquinas = dadoDe(lm)?.maquinas ?? null;
  const quadro = dadoDe(lq);

  const hStatus = perms.status ? "/producao/status" : undefined;
  const hCtl = perms.controle ? "/producao/controle" : undefined;
  const hProg = perms.programacoes ? "/producao/programacoes" : undefined;
  const ir = (href?: string) => (href ? () => router.push(href) : undefined);

  const res = maquinas ? resumoMaquinas(maquinas) : null;
  const colunas = useMemo(() => (quadro ? colunasControle(quadro) : null), [quadro]);
  const agenda = useMemo(() => (maquinas ? agendaProjetada(maquinas).filter((i) => i.estado !== "andamento").slice(0, 5) : []), [maquinas]);
  const alertas = alertasProducao(snap, maquinas, perms);
  const t = snap?.trends;
  const fab = t?.fabricados.days.slice(-7) ?? [];
  const prog = t?.progMaquina.days.slice(-7) ?? [];
  const cumpre = t ? cumprimento(t.progMaquina.total, t.fabricados.total) : null;
  // Mesma base da rosca (soma das etapas), pra o número de cima e o do centro
  // nunca diferirem por pedido sem etapa reconhecida.
  const noFluxo = snap ? snap.pipeline.stages.reduce((n, s) => n + s.count, 0) : null;

  return (
    <div className="og-grade">
      <div className="og-principal">
        {/* ── Os quatro números ─────────────────────────────────────── */}
        <div className="og-kpis kpi-row">
          <KpiIcone label="Total de pedidos" value={noFluxo ?? "—"} icon="box" onClick={ir(hStatus)} />
          <KpiIcone label="Em produção" value={snap?.pipeline.emProducao ?? "—"} icon="tools" cor="var(--primary)" onClick={ir(hCtl)} />
          <KpiIcone label="Concluídos hoje" value={t?.fabricados.today ?? "—"} anterior={t?.fabricados.yesterday ?? null} icon="circle-check" cor="var(--ok)" onClick={ir(hStatus)} />
          <KpiIcone label="Atrasados" value={snap?.pipeline.atrasados ?? "—"} icon="alert-triangle" cor="var(--perigo)" invert onClick={ir(hCtl)} />
        </div>
        {err && !snap && <p className="og-limpo"><Icon name="alert-triangle" size={16} color="var(--atencao)" /> Não deu pra ler o ERP agora — os números de pedido voltam na próxima atualização.</p>}

        {/* ── Produção em andamento + status ────────────────────────── */}
        <div className="og-duo og-duo-largo">
          <CartaoPainel icone="tools" titulo="Produção" sub="Peças fabricadas nos últimos 7 dias" href={hCtl}>
            <div className="og-producao">
              <div style={{ minWidth: 0 }}>
                {fab.length ? (
                  <MonoRoundedBarChart semCartao eixoY altura={210} nomePrimario="Fabricados" destaque={fab.length - 1}
                    pontos={fab.map((p) => ({ label: diaCurto(p.day), primary: p.value }))} />
                ) : <VazioPainel texto="Carregando o histórico…" />}
              </div>
              <div className="og-producao-lado">
                <Lateral icone="player-play" rotulo="Em andamento" valor={colunas ? colunas.andamento.length + colunas.atrasado.filter((i) => i.cartao.status === "andamento").length : null} unidade="no quadro" />
                <Lateral icone="circle-check" rotulo="Finalizadas hoje" valor={res?.feitasHoje ?? null} unidade="programações" />
                <Lateral icone="box" rotulo="Total do dia" valor={res ? res.pecasHoje : null} unidade="peças apontadas" />
              </div>
            </div>
          </CartaoPainel>

          <CartaoPainel icone="chart-bar" titulo="Status da produção" sub="Pedidos por etapa agora" href={hStatus}>
            {!snap ? <VazioPainel texto="Carregando…" /> : snap.pipeline.stages.length === 0 ? <VazioPainel texto="Nenhum pedido no fluxo." /> : (
              <RoscaEtapas stages={snap.pipeline.stages} />
            )}
          </CartaoPainel>
        </div>

        {/* ── Máquinas + quadro de máquinas ─────────────────────────── */}
        <div className="og-duo">
          <CartaoPainel icone="settings" titulo="Máquinas" sub="Status e disponibilidade de hoje" href="/producao/maquinas">
            <EstadoLeitura l={lm} vazio={!maquinas?.length}>
              <div className="pv-maq-faixa">
                {maquinas?.slice(0, 6).map((m) => {
                  const e = estadoMaquina(m);
                  return (
                    <Link key={m.id} href="/producao/maquinas" className="pv-maq ui-card-alvo">
                      <span className="pv-maq-nome">{m.nome}</span>
                      <Selo tom={ESTADO_MAQUINA[e].tom}>{ESTADO_MAQUINA[e].rotulo}</Selo>
                      <AnelProgresso valor={m.oee.disponibilidade} max={100} rotulo={`Disponibilidade de ${m.nome}`} tamanho={58} espessura={6}
                        cor={e === "parada" ? "var(--perigo)" : e === "manutencao" ? "var(--atencao)" : undefined}>
                        <b className="mt-num" style={{ fontSize: 13 }}>{Math.round(m.oee.disponibilidade)}%</b>
                      </AnelProgresso>
                      <span className="og-linha-sub" style={{ marginTop: 0 }}>{m.feitasHoje} feitas hoje</span>
                    </Link>
                  );
                })}
              </div>
            </EstadoLeitura>
          </CartaoPainel>

          <CartaoPainel icone="layout-columns" titulo="Quadro de máquinas" sub="O que cada uma está fazendo" href="/producao/maquinas">
            <EstadoLeitura l={lm} vazio={!maquinas?.length}>
              <ul className="og-lista">
                {maquinas?.slice(0, 6).map((m) => {
                  const e = estadoMaquina(m);
                  const raia = quadro?.raias.find((r) => r.maquinaId === m.id);
                  return (
                    <li key={m.id} className="og-proxima">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="og-linha-tit">{m.nome}</div>
                        <div className="og-linha-sub">{m.executando ? m.executando.referencia : m.paradaMotivo ?? `${m.fila.length} na fila`}</div>
                      </div>
                      <span className="og-hora">{minutosDeUso(raia) > 0 ? duracao(minutosDeUso(raia)) : "—"}</span>
                      <Selo tom={ESTADO_MAQUINA[e].tom}>{ESTADO_MAQUINA[e].rotulo}</Selo>
                    </li>
                  );
                })}
              </ul>
            </EstadoLeitura>
          </CartaoPainel>
        </div>

        {/* ── Produção por dia (planejado × realizado) + últimas ────── */}
        <div className="og-duo">
          <CartaoPainel icone="calendar" titulo="Produção por dia" sub="Programado para máquina × fabricado" href={hProg}>
            {fab.length ? (
              <MonoRoundedBarChart semCartao eixoY altura={190} nomePrimario="Fabricado" nomeSecundario="Programado"
                pontos={fab.map((p, i) => ({ label: diaCurto(p.day), primary: p.value, secondary: prog[i]?.value ?? 0 }))} />
            ) : <VazioPainel texto="Carregando…" />}
          </CartaoPainel>

          <CartaoPainel icone="history" titulo="Últimas produções" sub="O que rodou e fechou por último" href={hCtl}>
            <EstadoLeitura l={lq} vazio={!colunas || (colunas.concluido.length + colunas.andamento.length + colunas.atrasado.length) === 0} textoVazio="Nada rodou nos últimos dias.">
              <ul className="og-lista">
                {colunas && [...colunas.andamento, ...colunas.atrasado.filter((i) => i.cartao.status === "andamento"), ...colunas.concluido].slice(0, 5).map((i) => (
                  <li key={i.cartao.chave} className="og-proxima">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="og-linha-tit">{i.cartao.titulo}</div>
                      <div className="og-linha-sub">{[i.maquina ?? "Sem máquina", i.cartao.detalhe].filter(Boolean).join(" · ")}</div>
                    </div>
                    <span className="og-hora">{duracao(i.cartao.status === "concluida" ? i.cartao.minutos : i.cartao.rodandoHaMin)}</span>
                    <Selo tom={i.coluna === "concluido" ? "ok" : i.coluna === "atrasado" ? "perigo" : "destaque"}>
                      {i.coluna === "concluido" ? "Finalizado" : i.coluna === "atrasado" ? "Atrasado" : "Em andamento"}
                    </Selo>
                  </li>
                ))}
              </ul>
            </EstadoLeitura>
          </CartaoPainel>
        </div>
      </div>

      {/* ── Coluna direita ─────────────────────────────────────────── */}
      <aside className="og-lado">
        <CartaoPainel icone="bell" titulo="Alertas">
          {alertas.length === 0 ? (
            <p className="og-limpo"><Icon name="circle-check" size={17} color="var(--ok)" /> Nada travado na produção.</p>
          ) : (
            <ul className="og-lista">
              {alertas.slice(0, 6).map((al) => (
                <li key={al.texto}>
                  <Link href={al.href} className="og-alerta">
                    <Icon name="alert-triangle" size={19} color={`var(--${al.tom})`} style={{ flex: "none" }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="og-linha-tit">{al.texto}</span>
                      {al.sub && <span className="og-linha-sub">{al.sub}</span>}
                    </span>
                    <Icon name="chevron-right" size={16} color="var(--text-dim)" style={{ flex: "none" }} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CartaoPainel>

        <CartaoPainel icone="calendar" titulo="Próximas na máquina" href={hProg}>
          <EstadoLeitura l={lm} vazio={agenda.length === 0} textoVazio="Nenhuma programação na fila.">
            <ul className="og-lista">
              {agenda.map((p) => (
                <li key={p.id} className="og-proxima">
                  <span className="og-prazo" data-atrasada={p.estado === "pausado" ? "1" : undefined}>{horaSP(p.inicio)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="og-linha-tit">{p.referencia}</div>
                    <div className="og-linha-sub">{p.maquina}</div>
                  </div>
                  <Selo tom={p.estado === "pausado" ? "atencao" : "destaque"}>{p.estado === "pausado" ? "Pausado" : "Programado"}</Selo>
                </li>
              ))}
            </ul>
          </EstadoLeitura>
        </CartaoPainel>

        <CartaoPainel icone="chart-line" titulo="Desempenho" sub="Indicadores de hoje" href={hStatus}>
          <div className="og-celulas">
            <KpiIcone size="sm" label="OEE médio" value={res?.oee == null ? "—" : `${Math.round(res.oee)}%`} icon="chart-line" />
            <KpiIcone size="sm" label="Disponibilidade" value={res?.disponibilidade == null ? "—" : `${Math.round(res.disponibilidade)}%`} icon="settings" />
            <KpiIcone size="sm" label="Cumprimento 7d" value={cumpre == null ? "—" : `${cumpre}%`} icon="circle-check" cor="var(--ok)" />
            <KpiIcone size="sm" label="Na fila da máquina" value={snap?.pipeline.aguardandoMaquina ?? "—"} icon="hourglass-high" cor="var(--atencao)" />
          </div>
        </CartaoPainel>

        <button type="button" className="og-atalho ui-card-alvo" onClick={() => window.dispatchEvent(new Event("gaius:cmdk"))}>
          <span className="og-atalho-icone" aria-hidden><Icon name="box" size={20} color="#fff" /></span>
          <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <b>Precisa de algo?</b>
            <span>Acesse rapidamente o módulo desejado.</span>
          </span>
          <span className="og-atalho-seta" aria-hidden><Icon name="arrow-right" size={17} color="var(--primary)" /></span>
        </button>
      </aside>
    </div>
  );
}

/** Carregando / sem tabela / erro / vazio de um bloco que lê as máquinas. */
export function EstadoLeitura({ l, vazio, textoVazio = "Nenhuma máquina ativa cadastrada.", children }: {
  l: { estado: string; frase?: string }; vazio: boolean; textoVazio?: string; children: React.ReactNode;
}) {
  if (l.estado === "carregando") return <VazioPainel texto="Carregando…" />;
  if (l.estado === "erro") return <VazioPainel texto="Não deu pra ler agora." />;
  if (l.estado === "indisponivel") return <VazioPainel texto={l.frase ?? "Indisponível."} />;
  if (vazio) return <VazioPainel texto={textoVazio} />;
  return <>{children}</>;
}

export function Lateral({ icone, rotulo, valor, unidade }: { icone: string; rotulo: string; valor: number | null; unidade: string }) {
  return (
    <div className="og-lateral">
      <span className="og-cartao-icone" aria-hidden><Icon name={icone} size={16} color="var(--primary)" /></span>
      <div>
        <div className="og-linha-sub" style={{ marginTop: 0 }}>{rotulo}</div>
        <div className="stat mt-num" style={{ fontSize: 20, lineHeight: 1.2 }}>{valor == null ? "—" : valor.toLocaleString("pt-BR")}</div>
        <div className="og-linha-sub" style={{ marginTop: 0 }}>{unidade}</div>
      </div>
    </div>
  );
}
