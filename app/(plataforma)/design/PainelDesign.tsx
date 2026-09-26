"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "../Icon";
import { KpiIcone, Selo } from "../ui/primitives";
import { Avatar } from "../ui/Avatar";
import { CartaoPainel, VazioPainel } from "../ui/CartaoPainel";
import { Progresso } from "../ui/micro";
import { MonoRoundedBarChart } from "../ui/monocharts/MonoRoundedBarChart";
import { STATUS_DESIGN, tempoCurto, type StatusDesign } from "@/lib/design-fluxo";
import { ETAPAS_DO_SETOR } from "@/lib/design-gestao";
import type { ProjetoLinha } from "@/lib/design-projetos";
import { usePainelDesign, type RespostaPainel } from "./dados";
import { DetalheProjeto, SeloStatus, naEtapa, refCurta } from "./parts";

const TZ = "America/Sao_Paulo";
export const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const fmt = (n: number) => n.toLocaleString("pt-BR");
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const rotDia = (iso: string) => DIAS[new Date(`${iso}T12:00:00-03:00`).getDay()];
const nomeEtapa = (s: StatusDesign) => STATUS_DESIGN.find((x) => x.chave === s)!.nome;
const horasCurtas = (h: number | null) => (h == null ? "—" : tempoCurto(h));

/**
 * Design — painel de GESTÃO do setor.
 *
 * Ninguém vem aqui fazer arte: vem ver o estado das coisas. Por isso a tela é
 * UMA só e responde, na ordem, as perguntas com que se gerencia uma linha de
 * produção: entrou mais do que saiu? onde o trabalho está parado? qual é o
 * gargalo? o que está envelhecendo? quanto tempo leva? quanto volta? quem está
 * com o quê? As telas de TRABALHO (kanban, biblioteca, programação) saíram do
 * módulo — ver `_guardado/LEIA-ME.md`.
 */
export function PainelDesign() {
  const l = usePainelDesign();
  const [aberto, setAberto] = useState<ProjetoLinha | null>(null);
  if (l.estado === "carregando") return <VazioPainel texto="Lendo o fluxo do Design no ERP…" />;
  if (l.estado !== "ok") return <VazioPainel texto="Não deu pra ler o ERP agora. Tente de novo em instantes." />;
  return <Painel d={l.dado} abrir={setAberto} aberto={aberto} fechar={() => setAberto(null)} />;
}

function Painel({ d, abrir, aberto, fechar }: { d: RespostaPainel; abrir: (p: ProjetoLinha) => void; aberto: ProjetoLinha | null; fechar: () => void }) {
  const { resumo: r, fluxo7: f, ciclo: c, retrabalho: rt, gargalo: g } = d;
  const doSetor = d.etapas.filter((e) => ETAPAS_DO_SETOR.includes(e.status));
  const espera = d.etapas.filter((e) => !ETAPAS_DO_SETOR.includes(e.status));
  const maxWip = Math.max(1, ...d.etapas.map((e) => e.wip));
  const maxCarga = Math.max(1, ...r.equipe.map((p) => p.total));
  const dias = d.entradas.slice(-14);
  const saiPorDia = new Map(d.saidas.map((s) => [s.dia, s.valor]));
  const cresce = f.saldo > 0;

  return (
    <div className="og-grade">
      <div className="og-principal">
        {/* 1. Os quatro números de gestão. */}
        <div className="og-kpis kpi-row">
          <KpiIcone label="Na mão do Design" value={d.wipSetor} icon="vector-bezier" rodape="fila do setor" />
          <KpiIcone label="Entrou hoje" value={d.entradas.at(-1)?.valor ?? 0} anterior={d.entradas.at(-2)?.valor ?? null} icon="inbox" cor="var(--info)" />
          <KpiIcone label="Aprovado hoje" value={d.saidas.at(-1)?.valor ?? 0} anterior={d.saidas.at(-2)?.valor ?? null} icon="circle-check" cor="var(--ok)" />
          <KpiIcone label="Urgente ou atrasado" value={r.urgentes} icon="alert-triangle" cor="var(--perigo)" invert />
        </div>

        {/* 2. A fila cresce ou encolhe? */}
        <div className="og-duo og-duo-largo">
          <CartaoPainel icone="chart-bar" titulo="Entrou × saiu" sub="Demanda que chegou e arte aprovada, por dia (14 dias)">
            <MonoRoundedBarChart semCartao eixoY altura={210} nomePrimario="Entrou" nomeSecundario="Aprovado"
              pontos={dias.map((p) => ({ label: rotDia(p.dia), primary: p.valor, secondary: saiPorDia.get(p.dia) ?? 0 }))} />
            <div className="og-celulas">
              <KpiIcone size="sm" label="Entrou (7 dias)" value={f.entrou} icon="inbox" />
              <KpiIcone size="sm" label="Aprovado (7 dias)" value={f.saiu} icon="circle-check" cor="var(--ok)" />
              <KpiIcone size="sm" label="Saldo" value={`${f.saldo > 0 ? "+" : ""}${fmt(f.saldo)}`} icon={cresce ? "trending-up" : "trending-down"} cor={cresce ? "var(--atencao)" : "var(--ok)"} />
              <KpiIcone size="sm" label="Fila atual dá para" value={f.diasDeFila == null ? "—" : `${f.diasDeFila} d`} icon="clock" />
            </div>
            <p className="og-linha-sub" style={{ whiteSpace: "normal" }}>
              {cresce
                ? `Entrou ${fmt(f.saldo)} a mais do que saiu na semana: a fila está crescendo.`
                : `Saiu ${fmt(Math.abs(f.saldo))} a mais do que entrou na semana: a fila está encolhendo.`}
              {f.diasDeFila != null && ` No ritmo atual, o que está na mão do Design leva ${f.diasDeFila} dias para vazar.`}
            </p>
          </CartaoPainel>

          <CartaoPainel icone="alert-triangle" titulo="Gargalo agora" sub="A etapa do setor que prende mais trabalho por mais tempo">
            {!g ? <p className="og-limpo"><Icon name="circle-check" size={17} color="var(--ok)" /> Nada acumulado no setor.</p> : (
              <>
                <div className="dv-gargalo">
                  <b className="stat mt-num">{fmt(g.wip)}</b>
                  <span>em <b>{nomeEtapa(g.status).toLowerCase()}</b></span>
                </div>
                <div className="og-celulas">
                  <KpiIcone size="sm" label="Espera média" value={horasCurtas(g.idadeMediaH)} icon="clock" />
                  <KpiIcone size="sm" label="A mais velha" value={horasCurtas(g.maisVelhaH)} icon="hourglass-high" cor="var(--atencao)" />
                  <KpiIcone size="sm" label="Passou do limite" value={g.estouradas} icon="alert-triangle" cor="var(--perigo)" />
                </div>
                <p className="og-linha-sub" style={{ whiteSpace: "normal" }}>
                  É aqui que a fila trava hoje. As outras etapas do setor somam {fmt(doSetor.filter((e) => e.status !== g.status).reduce((a, b) => a + b.wip, 0))}.
                </p>
              </>
            )}
          </CartaoPainel>
        </div>

        {/* 3. Onde o trabalho está parado. */}
        <CartaoPainel icone="layout-kanban" titulo="Onde o trabalho está" sub="Fila por etapa e há quanto tempo cada uma espera">
          <ul className="og-lista">
            {[...doSetor, ...espera].map((e) => (
              <li key={e.status} className="pv-etapa">
                <span className="og-cartao-icone" aria-hidden><Icon name={STATUS_DESIGN.find((s) => s.chave === e.status)!.icone} size={16} color={e.doSetor ? "var(--primary)" : "var(--text-dim)"} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="pv-etapa-cab">
                    <span className="og-linha-tit">
                      {nomeEtapa(e.status)}
                      {/* Etapa que não é trabalho do Design: ou a bola está com
                          o cliente/comercial, ou a arte já saiu (aprovada, a
                          caminho da máquina). Dizer "depende de fora" nas duas
                          confundia a leitura — aprovado não espera ninguém. */}
                      {!e.doSetor && <span className="dv-tag">{e.status === "aprovado" ? "pronta p/ máquina" : "com o cliente"}</span>}
                    </span>
                    <span className="og-hora">espera {horasCurtas(e.idadeMediaH)}</span>
                  </div>
                  <Progresso valor={e.wip} max={maxWip} rotulo={`${nomeEtapa(e.status)}: ${e.wip}`} altura={6}
                    cor={e.doSetor ? undefined : "color-mix(in srgb, var(--text) 30%, transparent)"} />
                  {e.estouradas > 0 && <span className="og-linha-sub">{e.estouradas} passou de {tempoCurto(24)} parado</span>}
                </div>
                <b className="mt-num pv-pct">{fmt(e.wip)}</b>
              </li>
            ))}
          </ul>
        </CartaoPainel>

        {/* 4. Quanto tempo leva e quanto volta. */}
        <div className="og-duo">
          <CartaoPainel icone="clock" titulo="Tempo de ciclo" sub={`Mediana das artes dos últimos 7 dias (${c.base} peças)`}>
            <div className="og-celulas">
              <KpiIcone size="sm" label="Demanda → arte" value={horasCurtas(c.ateArteH)} icon="vector-bezier" />
              <KpiIcone size="sm" label="Arte → resposta do cliente" value={horasCurtas(c.ateAprovacaoH)} icon="eye" />
            </div>
            <p className="og-linha-sub" style={{ whiteSpace: "normal" }}>
              Mediana, não média: um pedido esquecido há semanas não deve definir o tempo do setor.
            </p>
          </CartaoPainel>

          <CartaoPainel icone="adjustments" titulo="Retrabalho" sub="Arte que o cliente devolveu (7 dias)">
            <div className="og-celulas">
              <KpiIcone size="sm" label="Aprovadas de 1ª" value={rt.taxaPrimeira == null ? "—" : `${rt.taxaPrimeira}%`} icon="circle-check" cor="var(--ok)" />
              <KpiIcone size="sm" label="Devolvidas" value={rt.devolvidas} icon="adjustments" cor="var(--perigo)" invert />
              <KpiIcone size="sm" label="Voltaram mais de uma vez" value={rt.reincidentes} icon="history" cor="var(--atencao)" invert />
            </div>
          </CartaoPainel>
        </div>

        {/* 5. O que envelhece + quem está com o quê. */}
        <div className="og-duo">
          <CartaoPainel icone="hourglass-high" titulo="Envelhecendo na fila" sub="O mais velho na mão do Design">
            {d.envelhecendo.length === 0 ? <VazioPainel texto="Nada parado no setor." /> : (
              <ul className="og-lista">
                {d.envelhecendo.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="og-alerta pv-linha-btn" onClick={() => abrir(p)}>
                      <span className="og-prazo dv-prazo" data-atrasada={p.horasNaEtapa > 48 ? "1" : undefined}>{naEtapa(p)}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="og-linha-tit">{refCurta(p.ref)}</span>
                        <span className="og-linha-sub">{p.responsavel ?? "Sem responsável"} · {p.produto}</span>
                      </span>
                      <SeloStatus s={p.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CartaoPainel>

          <CartaoPainel icone="users" titulo="Equipe" sub={`${r.designersAtivos} ${r.designersAtivos === 1 ? "pessoa" : "pessoas"} com trabalho em mãos`} href="/design/equipe">
            {r.equipe.length === 0 ? <VazioPainel texto="Ninguém com projeto em mãos agora." /> : (
              <ul className="og-lista">
                {r.equipe.slice(0, 6).map((p) => (
                  <li key={p.nome} className="dv-pessoa">
                    <Avatar url={p.foto} nome={p.nome} size={32} formato="redondo" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pv-etapa-cab">
                        <span className="og-linha-tit">{p.nome}</span>
                        <span className="og-hora">{p.hoje} entregas hoje</span>
                      </div>
                      <Progresso valor={p.total} max={maxCarga} rotulo={`Carga de ${p.nome}: ${p.total}`} altura={5} />
                      <span className="og-linha-sub">{p.criacao} criando · {p.ajustes} em ajuste · {p.revisao} com o cliente</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CartaoPainel>
        </div>
      </div>

      {/* Coluna da direita: o que exige decisão. */}
      <aside className="og-lado">
        <CartaoPainel icone="bell" titulo="Precisa de decisão">
          {d.atencao.length === 0 && r.semResponsavel === 0 && r.parados === 0 ? (
            <p className="og-limpo"><Icon name="circle-check" size={17} color="var(--ok)" /> Nada travado no Design.</p>
          ) : (
            <ul className="og-lista">
              {r.semResponsavel > 0 && <Aviso tom="atencao" texto={`${fmt(r.semResponsavel)} em criação sem responsável`} sub="Ninguém pegou" />}
              {r.parados > 0 && <Aviso tom="atencao" texto={`${fmt(r.parados)} parado há mais de 1 dia`} sub="Fila do setor" />}
              {d.atencao.map((p) => (
                <li key={p.id}>
                  <button type="button" className="og-alerta pv-linha-btn" onClick={() => abrir(p)}>
                    <Icon name="alert-triangle" size={18} color="var(--perigo)" style={{ flex: "none" }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="og-linha-tit">{refCurta(p.ref)}</span>
                      <span className="og-linha-sub">{p.urgente ? "Urgente" : "Em atraso"} · {nomeEtapa(p.status)} · {naEtapa(p)}</span>
                    </span>
                    <Icon name="chevron-right" size={16} color="var(--text-dim)" style={{ flex: "none" }} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CartaoPainel>

        <CartaoPainel icone="arrow-right" titulo="No fluxo da empresa" sub="Pedido → Design → Produção">
          <div className="dv-fluxo">
            <span className="dv-fluxo-passo"><b className="mt-num">{fmt(r.porStatus.nova)}</b><span>Chegaram</span></span>
            <Icon name="chevron-right" size={16} color="var(--text-dim)" />
            <span className="dv-fluxo-passo"><b className="mt-num">{fmt(d.wipSetor + r.aguardandoAprovacao)}</b><span>No Design</span></span>
            <Icon name="chevron-right" size={16} color="var(--text-dim)" />
            <Link href="/producao" className="dv-fluxo-passo"><b className="mt-num">{fmt(r.artesProntas)}</b><span>Prontas p/ máquina</span></Link>
          </div>
        </CartaoPainel>

        {d.tarefas.length > 0 && (
          <CartaoPainel icone="list-check" titulo="Tarefas do setor" sub="Lançadas em Atividades" href="/atividades">
            <ul className="og-lista">
              {d.tarefas.filter((t) => t.status !== "concluida").slice(0, 5).map((t) => (
                <li key={t.id} className="og-proxima">
                  <span className="og-prazo dv-prazo">{t.prazo ? new Date(`${t.prazo}T12:00:00-03:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ }) : "—"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="og-linha-tit">{t.tarefa}</div>
                    <div className="og-linha-sub">{t.para}</div>
                  </div>
                  <Selo tom={t.status === "em_andamento" ? "destaque" : "neutro"}>{t.status === "em_andamento" ? "Fazendo" : "A fazer"}</Selo>
                </li>
              ))}
            </ul>
          </CartaoPainel>
        )}

        <Link href="/design/equipe" className="og-atalho ui-card-alvo">
          <span className="og-atalho-icone" aria-hidden><Icon name="users" size={20} color="#fff" /></span>
          <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <b>Desempenho por pessoa</b>
            <span>Artes, contornos, aprovações e reprovações no período.</span>
          </span>
          <span className="og-atalho-seta" aria-hidden><Icon name="arrow-right" size={17} color="var(--primary)" /></span>
        </Link>

        <span className="og-linha-sub" style={{ textAlign: "center" }}>Atualizado às {hora(d.atualizadoEm)}</span>
      </aside>
      {aberto && <DetalheProjeto p={aberto} onFechar={fechar} />}
    </div>
  );
}

function Aviso({ tom, texto, sub }: { tom: "atencao" | "perigo"; texto: string; sub: string }) {
  return (
    <li className="og-proxima">
      <Icon name="alert-triangle" size={18} color={`var(--${tom})`} style={{ flex: "none" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="og-linha-tit" style={{ whiteSpace: "normal" }}>{texto}</div>
        <div className="og-linha-sub">{sub}</div>
      </div>
    </li>
  );
}
