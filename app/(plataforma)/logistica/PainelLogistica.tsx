"use client";

import { Icon } from "../Icon";
import { KpiIcone, Selo } from "../ui/primitives";
import { Dropdown } from "../ui/Dropdown";
import { DataList, type Coluna } from "../ui/DataList";
import { CartaoPainel, VazioPainel } from "../ui/CartaoPainel";
import { MonoRoundedLineChart } from "../ui/monocharts/MonoRoundedLineChart";
import { MonoRoundedBarChart } from "../ui/monocharts/MonoRoundedBarChart";
import { degrau } from "../ui/monocharts/MonoRoundedDonutChart";
import type { FaltaCategoria, LogiPedido } from "@/lib/logistica";
import { DIAS_ATRASO, type LinhaPedido, type VisaoLogistica } from "@/lib/logistica-visao";
import "../operacao/geral/visao-geral.css";
import "./logistica.css";

const TZ = "America/Sao_Paulo";
const fmt = (n: number) => n.toLocaleString("pt-BR");
const diaMes = (iso: string) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };
const dataCurta = (iso: string | null) => (iso ? diaMes(iso.slice(0, 10)) : "—");

/**
 * Logística — o painel do topo, no desenho da Operação: quatro números,
 * envios por dia com as etapas ao lado, o que trava em rosca, falta produzir,
 * idade da fila, prontos pra despachar, a fila que mais espera e, à direita,
 * alertas e próximas expedições.
 *
 * Só apresenta: a conta é do `montarVisaoLogistica` e o snapshot vem do
 * `LogisticaClient` (o mesmo /api/logistica de antes, com o mesmo recuo).
 * `onAbrir` abre a ficha do pedido; `onFila` rola pra fila completa.
 */
export function PainelLogistica({ visao, falta, hoje, onAbrir, onFila, onBusca }: {
  visao: VisaoLogistica;
  falta: FaltaCategoria[];
  hoje: string;
  onAbrir: (p: LogiPedido) => void;
  onFila: () => void;
  onBusca: () => void;
}) {
  const v = visao;
  const hojeRotulo = new Date(hoje).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
  const serie = v.serie.slice(-14);

  const colunas: Coluna<LinhaPedido>[] = [
    { chave: "aprovado", titulo: "Aprovado", render: (l) => <span className="lg-num">{dataCurta(l.pedido.dataAprovado)}</span>, ordenar: (l) => l.pedido.dataAprovado ?? "" },
    { chave: "pedido", titulo: "Pedido", papel: "titulo", render: (l) => <b>#{l.pedido.idProprio ?? l.pedido.id}</b> },
    { chave: "cliente", titulo: "Cliente", render: (l) => <span className="lg-corta">{l.pedido.nome ?? l.pedido.cliente}</span> },
    { chave: "etapa", titulo: "Etapa", render: (l) => l.etapa },
    { chave: "caixa", titulo: "Caixa", render: (l) => (l.pedido.caixa ? `#${l.pedido.caixa}` : "—") },
    { chave: "status", titulo: "Status", render: (l) => <Selo tom={l.status.tom}>{l.status.rotulo}</Selo> },
    { chave: "resp", titulo: "Responsável", render: (l) => l.pedido.responsavel?.split(" ").slice(0, 2).join(" ") ?? "—" },
    { chave: "dias", titulo: "Na fila", alinhar: "right", render: (l) => <span className="lg-num" data-atraso={l.pedido.dias >= DIAS_ATRASO ? "1" : undefined}>{l.pedido.dias} d</span>, ordenar: (l) => l.pedido.dias },
  ];

  return (
    <div className="og">
      <header className="og-cab">
        <span className="og-cab-icone" aria-hidden><Icon name="truck" size={22} color="var(--primary)" /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="og-titulo">Logística</h1>
          <p className="og-sub">Do pedido à expedição. Acompanhe todo o fluxo de saída.</p>
        </div>
        <div className="og-cab-acoes">
          <span className="og-data"><Icon name="calendar" size={15} color="var(--text-dim)" />Hoje, {hojeRotulo}</span>
          <Dropdown titulo="Ações rápidas" rotulo="Ações rápidas" icone="bolt" alinhar="fim" itens={[
            { id: "busca", rotulo: "Buscar caixa ou pedido", icone: "search", onSelect: onBusca },
            { id: "fila", rotulo: "Ver fila completa", icone: "list-details", onSelect: onFila },
            { id: "galpao", rotulo: "App do galpão", icone: "building-warehouse", href: "/operacao" },
          ]} />
        </div>
      </header>

      <div className="og-grade">
        <div className="og-principal">
          {/* ── Os quatro números do topo ───────────────────────────── */}
          <div className="og-kpis kpi-row">
            <KpiIcone label="Em separação" value={v.separacao.valor} anterior={v.separacao.ontem} invert icon="package" onClick={onFila} rodape="vs. antes" />
            <KpiIcone label="Prontos p/ envio" value={v.prontos.valor} anterior={v.prontos.ontem} icon="truck-loading" cor="var(--info)" onClick={onFila} rodape="vs. antes" />
            <KpiIcone label="Enviados hoje" value={v.enviados.valor} anterior={v.enviados.ontem} icon="circle-check" cor="var(--ok)" onClick={onFila} />
            <KpiIcone label="Atrasados" value={v.atrasados} icon="alert-triangle" cor="var(--perigo)" onClick={onFila} rodape={`${DIAS_ATRASO}+ dias na fila`} />
          </div>

          {/* ── Envios por dia + o que trava ────────────────────────── */}
          <div className="og-duo og-duo-largo">
            <CartaoPainel icone="trending-up" titulo="Envios por dia" sub="Pedidos enviados nos últimos 14 dias e a fila por etapa" onVer={onFila}>
              <div className="lg-cq"><div className="lg-envios">
                <div style={{ minWidth: 0 }}>
                  <MonoRoundedLineChart semCartao eixoY altura={180} nome="Enviados"
                    pontos={serie.map((p) => ({ rotulo: diaMes(p.dia), valor: p.valor }))} />
                </div>
                <ul className="lg-etapas">
                  {v.etapas.map((e, i) => (
                    <li key={e.rotulo}>
                      <span className="og-ponto" style={{ opacity: degrau(i) }} />
                      <span className="lg-etapa-rot">
                        {e.rotulo}
                        <span className="lg-barra"><span style={{ width: `${e.pct}%`, opacity: degrau(i) }} /></span>
                      </span>
                      <b className="mt-num">{fmt(e.valor)}</b>
                      <span className="og-legenda-pct">{e.pct}%</span>
                    </li>
                  ))}
                </ul>
              </div></div>
            </CartaoPainel>

            <CartaoPainel icone="list-details" titulo="O que trava" sub="Pedidos parados por pendência" onVer={onFila}>
              {v.travas.length === 0 ? <VazioPainel texto="Nenhum pedido com pendência." /> : (
                // Ranking em barras e não rosca: são pendências que se SOBREPÕEM
                // (um pedido pode faltar carimbo e chancela), então "fatia do
                // todo" mentia. A barra compara o tamanho de cada trava com a maior.
                <ul className="lg-rank">
                  {v.travas.map((t) => (
                    <li key={t.rotulo}>
                      <span className="lg-rank-cab">
                        <span className="lg-corta">{t.rotulo}</span>
                        <b className="mt-num">{fmt(t.valor)} <span>{t.valor === 1 ? "pedido" : "pedidos"}</span></b>
                      </span>
                      <span className="lg-barra lg-barra-grossa"><span style={{ width: `${Math.max(4, Math.round((t.valor / v.travas[0].valor) * 100))}%` }} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </CartaoPainel>
          </div>

          {/* ── Falta produzir · tempo na fila ────────────── */}
          <div className="og-duo">
            <CartaoPainel icone="alert-triangle" titulo="Falta produzir" sub="O que segura a liberação dos pedidos" onVer={onFila}>
              {falta.length === 0 ? (
                <p className="og-limpo"><Icon name="circle-check" size={17} color="var(--ok)" /> Nada faltando.</p>
              ) : (
                <div className="lg-falta" role="list">
                  <div className="lg-falta-cab" aria-hidden><span>Categoria</span><span>Itens</span><span>Pedidos</span></div>
                  {falta.slice(0, 4).map((f) => (
                    <div key={f.categoria} className="lg-falta-linha" role="listitem">
                      <span className="lg-corta">{f.categoria}</span>
                      <b className="mt-num" style={{ color: "var(--perigo)" }}>{fmt(f.total)}</b>
                      <span className="mt-num">{fmt(f.pedidos)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CartaoPainel>

            <CartaoPainel icone="clock" titulo="Tempo na fila" sub="Dias desde a aprovação">
              <div className="lg-cq"><div className="lg-tempo">
                <div className="lg-tempo-num">
                  <div className="stat mt-num lg-grande">{v.idade.mediaDias == null ? "—" : `${v.idade.mediaDias.toLocaleString("pt-BR")} dias`}</div>
                  <div className="og-linha-sub" style={{ whiteSpace: "normal" }}>
                    média{v.idade.maisAntigo != null && <> · mais antigo: <b style={{ color: v.idade.maisAntigo >= DIAS_ATRASO ? "var(--perigo)" : undefined }}>{v.idade.maisAntigo} d</b></>}
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <MonoRoundedBarChart semCartao compact eixoY={false} altura={110} nomePrimario="Pedidos"
                    pontos={v.idade.faixas.map((f) => ({ label: f.rotulo, primary: f.valor }))} />
                </div>
              </div></div>
            </CartaoPainel>

          </div>

          {/* ── A fila que mais espera ──────────────────────────────── */}
          <CartaoPainel icone="history" titulo="Pedidos que mais esperam" sub="Os mais antigos por aprovação — toque pra abrir" onVer={onFila}>
            <DataList itens={v.fila} colunas={colunas} chaveDe={(l) => String(l.pedido.id)} onAbrir={(l) => onAbrir(l.pedido)}
              rotulo="Pedidos que mais esperam" vazio="A fila está vazia." densa minWidth={720} />
          </CartaoPainel>
        </div>

        {/* ── Coluna direita: alertas, próximas expedições, atalho ──── */}
        <aside className="og-lado">
          <CartaoPainel icone="bell" titulo="Alertas" onVer={v.alertas.length ? onFila : undefined}>
            {v.alertas.length === 0 ? (
              <p className="og-limpo"><Icon name="circle-check" size={17} color="var(--ok)" /> Nada travado agora.</p>
            ) : (
              <ul className="og-lista">
                {v.alertas.map((al) => (
                  <li key={al.texto}>
                    <button type="button" className="og-alerta lg-alerta" onClick={onFila}>
                      <Icon name="alert-triangle" size={19} color={`var(--${al.tom})`} style={{ flex: "none" }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="og-linha-tit">{al.texto}</span>
                        <span className="og-linha-sub">{al.sub}</span>
                      </span>
                      <Icon name="chevron-right" size={16} color="var(--text-dim)" style={{ flex: "none" }} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CartaoPainel>

          <CartaoPainel icone="calendar" titulo="Próximas expedições" onVer={onFila}>
            {v.proximos.length === 0 ? <VazioPainel texto="Nenhum pedido pronto ou urgente." /> : (
              <ul className="og-lista">
                {v.proximos.map((l) => (
                  <li key={l.pedido.id}>
                    <button type="button" className="og-proxima lg-alerta" onClick={() => onAbrir(l.pedido)}>
                      <span className="og-prazo">{l.pedido.caixa ? `#${l.pedido.caixa}` : "s/cx"}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="og-linha-tit">{l.pedido.nome ?? l.pedido.cliente}</span>
                        <span className="og-linha-sub">Pedido #{l.pedido.idProprio ?? l.pedido.id} · {l.etapa}</span>
                      </span>
                      {l.pedido.pronto ? <Selo tom="ok">Pronto</Selo> : <Selo tom="perigo">Urgente</Selo>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
    </div>
  );
}
