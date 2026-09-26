"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "../../Icon";
import { KpiIcone, Selo } from "../../ui/primitives";
import { Avatar } from "../../ui/Avatar";
import { CartaoPainel, VazioPainel } from "../../ui/CartaoPainel";
import { Dropdown } from "../../ui/Dropdown";
import { MonoRoundedBarChart } from "../../ui/monocharts/MonoRoundedBarChart";
import { MonoRoundedDonutChart, degrau } from "../../ui/monocharts/MonoRoundedDonutChart";
import type { Comparado, LinhaProxima, LinhaUltima, VisaoAtividades } from "@/lib/operacao-visao";
import "./visao-geral.css";

export interface DadosOperacao {
  hoje: string;
  atividades: VisaoAtividades | null;
  producao: VisaoAtividades | null;
  listas: { proximas: LinhaProxima[]; ultimas: LinhaUltima[] } | null;
  estoque: { abaixo: number; zerados: number; conferir: number; total: number | null; grupos: { rotulo: string; itens: number }[] } | null;
  logistica: { separacao: Comparado; etiqueta: Comparado; prontos: Comparado; enviados: Comparado; faltandoPeca: number } | null;
}

const TZ = "America/Sao_Paulo";
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const diaDaSemana = (iso: string) => DIAS[new Date(`${iso}T12:00:00-03:00`).getDay()];
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const diaSP = (d: Date) => new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);

function prazoCurto(prazo: string | null, hoje: string): string {
  if (!prazo) return "Fila";
  const h = diaSP(new Date(hoje));
  if (prazo < h) return "Atrasada";
  if (prazo === h) return "Hoje";
  if (prazo === diaSP(new Date(new Date(hoje).getTime() + 86_400_000))) return "Amanhã";
  const [, m, d] = prazo.split("-");
  return `${d}/${m}`;
}

const PRIORIDADE: Record<LinhaProxima["prioridade"], { rotulo: string; tom: "perigo" | "atencao" | "ok" }> = {
  alta: { rotulo: "Alta", tom: "perigo" },
  media: { rotulo: "Média", tom: "atencao" },
  baixa: { rotulo: "Baixa", tom: "ok" },
};

interface Alerta { texto: string; area: string; href: string; tom: "perigo" | "atencao" }

/** O que trava o fluxo agora, do mais grave pro menos. Vazio = dia limpo. */
function alertasDe(d: DadosOperacao): Alerta[] {
  const a: Alerta[] = [];
  const n = (v: number, um: string, varios: string) => `${v} ${v === 1 ? um : varios}`;
  const at = d.atividades ?? d.producao;
  if (at?.impedidas) a.push({ tom: "perigo", area: "Atividades", href: "/atividades", texto: n(at.impedidas, "atividade impedida", "atividades impedidas") });
  if (d.estoque?.zerados) a.push({ tom: "perigo", area: "Estoque", href: "/estoque", texto: `${n(d.estoque.zerados, "item zerado", "itens zerados")} no estoque` });
  if (d.logistica?.faltandoPeca) a.push({ tom: "perigo", area: "Logística", href: "/logistica", texto: `${n(d.logistica.faltandoPeca, "pedido pronto", "pedidos prontos")} faltando peça` });
  if (at?.urgentes) a.push({ tom: "atencao", area: "Atividades", href: "/atividades", texto: n(at.urgentes, "atividade urgente", "atividades urgentes") });
  if (d.estoque?.abaixo) a.push({ tom: "atencao", area: "Estoque", href: "/estoque", texto: `${n(d.estoque.abaixo, "item abaixo", "itens abaixo")} do mínimo` });
  if (d.estoque?.conferir) a.push({ tom: "atencao", area: "Estoque", href: "/estoque", texto: n(d.estoque.conferir, "conferência esperando", "conferências esperando") });
  return a;
}

export function VisaoGeralOperacao({ dados }: { dados: DadosOperacao }) {
  const router = useRouter();
  const ir = (href: string) => () => router.push(href);
  const { atividades, producao, estoque, logistica, listas } = dados;
  const at = atividades ?? producao;
  const alertas = alertasDe(dados);
  const hojeRotulo = new Date(dados.hoje).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });

  const acoes = [
    atividades && { id: "atv", rotulo: "Distribuir atividade", icone: "list-check", href: "/atividades" },
    producao && { id: "maq", rotulo: "Quadro das máquinas", icone: "settings", href: "/producao" },
    estoque && { id: "gal", rotulo: "App do galpão", icone: "building-warehouse", href: "/operacao" },
    estoque && { id: "est", rotulo: "Conferir estoque", icone: "clipboard-list", href: "/estoque" },
    logistica && { id: "log", rotulo: "Pedidos da logística", icone: "truck", href: "/logistica" },
  ].filter(Boolean) as { id: string; rotulo: string; icone: string; href: string }[];

  return (
    <div className="og">
      <header className="og-cab">
        <span className="og-cab-icone" aria-hidden><Icon name="layout-grid" size={22} color="var(--primary)" /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="og-titulo">Operação</h1>
          <p className="og-sub">Tudo o que movimenta a sua produção, do pedido à entrega.</p>
        </div>
        <div className="og-cab-acoes">
          <span className="og-data"><Icon name="calendar" size={15} color="var(--text-dim)" />Hoje, {hojeRotulo}</span>
          {acoes.length > 0 && <Dropdown titulo="Ações rápidas" rotulo="Ações rápidas" icone="bolt" alinhar="fim" itens={acoes} />}
        </div>
      </header>

      <div className="og-grade">
        <div className="og-principal">
          {/* ── Os quatro números do topo ───────────────────────────── */}
          <div className="og-kpis kpi-row">
            {at && <KpiIcone label="Tarefas pendentes" value={at.pendentes} icon="list-check" onClick={ir("/atividades")} />}
            {at && <KpiIcone label="Em andamento" value={at.emAndamento} icon="player-play" cor="var(--ok)" onClick={ir("/atividades")} />}
            {estoque && <KpiIcone label="Estoque baixo" value={estoque.abaixo} icon="alert-triangle" cor="var(--atencao)" onClick={ir("/estoque")} />}
            {logistica && <KpiIcone label="Expedições hoje" value={logistica.enviados.valor} anterior={logistica.enviados.ontem} icon="truck" cor="var(--info)" onClick={ir("/logistica")} />}
          </div>

          {/* ── Produção da semana + estoque ────────────────────────── */}
          {(at || estoque) && (
            <div className="og-duo og-duo-largo">
              {at && (
                <CartaoPainel icone="settings" titulo="Produção" sub="Peças concluídas nos últimos 7 dias" href={producao ? "/producao" : "/atividades"}>
                  <div className="og-producao">
                    <div style={{ minWidth: 0 }}>
                      <MonoRoundedBarChart semCartao eixoY altura={210} nomePrimario="Peças" destaque={6}
                        pontos={at.semana.map((p) => ({ label: diaDaSemana(p.dia), primary: p.pecas }))} />
                    </div>
                    <div className="og-producao-lado">
                      <Lateral icone="player-play" rotulo="Em andamento" valor={at.emAndamento} unidade="atividades" />
                      <Lateral icone="circle-check" rotulo="Finalizadas hoje" valor={at.concluidas.valor} unidade="atividades" />
                      <Lateral icone="box" rotulo="Total do dia" valor={at.pecas.valor} unidade="peças" />
                    </div>
                  </div>
                </CartaoPainel>
              )}
              {estoque && (
                <CartaoPainel icone="box" titulo="Estoque" sub="Itens ativos por tipo" href="/estoque">
                  {estoque.grupos.length === 0 ? <VazioPainel texto="Sem itens classificados." /> : (
                    <div className="og-estoque">
                      <div className="og-rosca">
                        <MonoRoundedDonutChart semCartao compact altura={150} centroRotulo="itens"
                          fatias={estoque.grupos.map((g, i) => ({ name: g.rotulo, value: g.itens, degrau: i }))} />
                      </div>
                      <ul className="og-legenda">
                        {estoque.grupos.map((g, i) => (
                          <li key={g.rotulo}>
                            <span className="og-ponto" style={{ opacity: degrau(i) }} />
                            <span className="og-legenda-rot">{g.rotulo}</span>
                            <b className="mt-num">{g.itens.toLocaleString("pt-BR")}</b>
                            <span className="og-legenda-pct">{estoque.total ? Math.round((g.itens / estoque.total) * 100) : 0}%</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CartaoPainel>
              )}
            </div>
          )}

          {/* ── Atividades + Produção ───────────────────────────────── */}
          {(atividades || producao) && (
            <div className="og-duo">
              {atividades && (
                <CartaoPainel icone="list-check" titulo="Atividades" sub="Tarefas e processos do dia" href="/atividades">
                  <div className="og-celulas">
                    <KpiIcone size="sm" label="Pendentes" value={atividades.pendentes} icon="clock" onClick={ir("/atividades")} />
                    <KpiIcone size="sm" label="Em andamento" value={atividades.emAndamento} icon="player-play" onClick={ir("/atividades")} />
                    <KpiIcone size="sm" label="Concluídas hoje" value={atividades.concluidas.valor} anterior={atividades.concluidas.ontem} icon="circle-check" cor="var(--ok)" onClick={ir("/atividades/historico")} />
                  </div>
                </CartaoPainel>
              )}
              {producao && (
                <CartaoPainel icone="settings" titulo="Produção" sub="Processos e máquinas" href="/producao">
                  <div className="og-celulas">
                    <KpiIcone size="sm" label="Peças hoje" value={producao.pecas.valor} anterior={producao.pecas.ontem} icon="box" onClick={ir("/producao")} />
                    <KpiIcone size="sm" label="Operadores ativos" value={producao.operadores.valor} anterior={producao.operadores.ontem} icon="users" onClick={ir("/producao")} />
                    <KpiIcone size="sm" label="Tempo médio" icon="clock" onClick={ir("/producao")} invert
                      value={producao.tmaMin.valor == null ? "—" : `${Math.round(producao.tmaMin.valor)} min`}
                      atual={producao.tmaMin.valor ?? 0} anterior={producao.tmaMin.valor == null ? null : producao.tmaMin.ontem} />
                  </div>
                </CartaoPainel>
              )}
            </div>
          )}

          {/* ── Logística + últimas atividades ──────────────────────── */}
          {(logistica || listas) && (
            <div className="og-duo">
              {logistica && (
                <CartaoPainel icone="truck" titulo="Logística" sub="Pedidos e envios" href="/logistica">
                  <div className="og-celulas og-celulas-4">
                    <KpiIcone size="sm" label="Em separação" value={logistica.separacao.valor} anterior={logistica.separacao.ontem} icon="package" onClick={ir("/logistica")} />
                    <KpiIcone size="sm" label="Etiqueta pendente" value={logistica.etiqueta.valor} anterior={logistica.etiqueta.ontem} invert icon="clipboard-list" cor="var(--atencao)" onClick={ir("/logistica")} />
                    <KpiIcone size="sm" label="Prontos p/ envio" value={logistica.prontos.valor} anterior={logistica.prontos.ontem} icon="circle-check" cor="var(--ok)" onClick={ir("/logistica")} />
                    <KpiIcone size="sm" label="Enviados hoje" value={logistica.enviados.valor} anterior={logistica.enviados.ontem} icon="truck" cor="var(--info)" onClick={ir("/logistica")} />
                  </div>
                </CartaoPainel>
              )}
              {listas && (
                <CartaoPainel icone="history" titulo="Últimas atividades" sub="O que aconteceu recentemente" href="/atividades/historico">
                  {listas.ultimas.length === 0 ? <VazioPainel texto="Nada começou nem terminou nos últimos dias." /> : (
                    <ul className="og-lista">
                      {listas.ultimas.map((u) => (
                        <li key={u.id} className="og-ultima">
                          <Avatar url={u.fotoUrl} nome={u.nome} size={32} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="og-linha-tit">{u.nome}</div>
                            <div className="og-linha-sub">{[u.setor, u.tarefa].filter(Boolean).join(" · ")}</div>
                          </div>
                          <span className="og-hora">{hora(u.quando)}</span>
                          <Selo tom={u.status === "concluida" ? "ok" : "destaque"}>{u.status === "concluida" ? "Concluída" : "Em andamento"}</Selo>
                        </li>
                      ))}
                    </ul>
                  )}
                </CartaoPainel>
              )}
            </div>
          )}
        </div>

        {/* ── Coluna direita: alertas, próximas, atalho ─────────────── */}
        <aside className="og-lado">
          <CartaoPainel icone="bell" titulo="Alertas">
            {alertas.length === 0 ? (
              <p className="og-limpo"><Icon name="circle-check" size={17} color="var(--ok)" /> Nada travado agora.</p>
            ) : (
              <ul className="og-lista">
                {alertas.map((al) => (
                  <li key={al.texto}>
                    <Link href={al.href} className="og-alerta">
                      <Icon name="alert-triangle" size={19} color={`var(--${al.tom})`} style={{ flex: "none" }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="og-linha-tit">{al.texto}</span>
                        <span className="og-linha-sub">{al.area}</span>
                      </span>
                      <Icon name="chevron-right" size={16} color="var(--text-dim)" style={{ flex: "none" }} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CartaoPainel>

          {listas && (
            <CartaoPainel icone="calendar" titulo="Próximas atividades" href="/atividades">
              {listas.proximas.length === 0 ? <VazioPainel texto="A fila está vazia." /> : (
                <ul className="og-lista">
                  {listas.proximas.map((p) => (
                    <li key={p.id} className="og-proxima">
                      <span className="og-prazo" data-atrasada={prazoCurto(p.prazo, dados.hoje) === "Atrasada" ? "1" : undefined}>{prazoCurto(p.prazo, dados.hoje)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="og-linha-tit">{p.tarefa}</div>
                        {p.setor && <div className="og-linha-sub">{p.setor}</div>}
                      </div>
                      <Selo tom={PRIORIDADE[p.prioridade].tom}>{p.urgente ? "Urgente" : PRIORIDADE[p.prioridade].rotulo}</Selo>
                    </li>
                  ))}
                </ul>
              )}
            </CartaoPainel>
          )}

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
    </div>
  );
}

function Lateral({ icone, rotulo, valor, unidade }: { icone: string; rotulo: string; valor: number; unidade: string }) {
  return (
    <div className="og-lateral">
      <span className="og-cartao-icone" aria-hidden><Icon name={icone} size={16} color="var(--primary)" /></span>
      <div>
        <div className="og-linha-sub" style={{ marginTop: 0 }}>{rotulo}</div>
        <div className="stat mt-num" style={{ fontSize: 20, lineHeight: 1.2 }}>{valor.toLocaleString("pt-BR")}</div>
        <div className="og-linha-sub" style={{ marginTop: 0 }}>{unidade}</div>
      </div>
    </div>
  );
}
