"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../Icon";
import { Botao } from "../ui/controles";
import type { MarketOverview, MarketProfile, MarketUnitSummary } from "../../../lib/tridimarket/types";

// Toda lista que o painel percorre, garantida. Ver o comentário em `dados`.
const LISTAS = [
  "topSpenders", "topCompanies", "recentPurchases", "topProducts", "devices",
  "employeeAttention", "stockAttention", "slowProducts", "debtByEmployee",
  "units", "salesLast7", "hourly",
] as const;

function comListas(o: MarketOverview): MarketOverview {
  const copia = { ...o } as unknown as Record<string, unknown>;
  for (const chave of LISTAS) if (!Array.isArray(copia[chave])) copia[chave] = [];
  return copia as unknown as MarketOverview;
}
import { formatMarketCurrency, marketStatusLabel } from "../../../lib/tridimarket/view";
import { Cabecalho, intervaloDe, useDadosDoFiltro, useFiltros } from "./Filtros";
import { paramsDoPeriodo, periodoAnterior, rotuloPeriodo } from "../../../lib/tridimarket/periodo";
import { Avatar, Badge, Card, Empty, INDIGO, PanelTitle, Skel, SkelLinhas, SkelStats, Stat, haQuantoTempo, marketRequest } from "./ui";
import { DataList, type Coluna } from "../ui/DataList";
import { useIsMobile } from "../ui/useMediaQuery";
import { horaDePico } from "@/lib/tridimarket/dashboard";
import { Alerta } from "../ui/Alerta";

type Settings = { profiles: MarketProfile[]; schemaReady: boolean; offlineHours: number; pinAttempts: number };

// Variação contra o período anterior de MESMO tamanho. Só faz sentido para
// métricas de FLUXO (o que aconteceu no intervalo); saldo em aberto é uma foto
// do agora e comparar com "o passado" daria um número sem significado.
function variacao(atual: number, anterior: number): number | null {
  if (!Number.isFinite(anterior) || anterior <= 0) return null;
  return (atual - anterior) / anterior;
}

export function DashboardClient() {
  const [filtros, setFiltros] = useFiltros();
  const [settings, setSettings] = useState<Settings | null>(null);
  // O painel desenha uma dezena de listas (`dados.topCompanies.length`, …) e
  // uma resposta sem alguma delas derrubava a tela INTEIRA com "Cannot read
  // properties of undefined". Acontece justo na instalação nova, quando a API
  // ainda é de uma versão anterior ou não tem o que responder. Uma lista vazia
  // desenha o estado "sem dados", que é o certo — a tela nunca some por isso.
  const [dados, setDados] = useState<MarketOverview | null>(null);
  const [anterior, setAnterior] = useState<MarketOverview | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // Detecta "dado velho": ao trocar de dia/empresa, os números do recorte
  // anterior somem na hora (esqueleto) em vez de ficarem parados na tela.
  const { chave, desatualizado, marcarCarregado } = useDadosDoFiltro(filtros);

  // Hora de pico — só pro subtítulo do painel de movimento.
  const pico = dados ? horaDePico(dados.hourly) : null;

  // Filtro de unidade salvo no navegador: se ele apontar pra uma unidade que
  // NÃO está mais na lista (renomeada, desativada, de outra base), ignora e
  // volta pra "todas" — senão o painel filtra por um perfil fantasma e mostra
  // ZERO, dando a impressão de que "as vendas sumiram". Só valida depois que a
  // lista de perfis chegou (settings != null); antes disso mantém o salvo.
  const profileIdEfetivo = filtros.profileId && (!settings || settings.profiles.some((p) => p.id === filtros.profileId))
    ? filtros.profileId : "";
  const filtroFantasma = !!filtros.profileId && !profileIdEfetivo;
  const escopo = profileIdEfetivo ? `&profileId=${encodeURIComponent(profileIdEfetivo)}` : "";
  const intervalo = intervaloDe(filtros);
  const chaveIntervalo = `${intervalo.de}|${intervalo.ate}`;
  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    const atualParams = paramsDoPeriodo(intervalo);
    // A janela ANTERIOR é buscada de verdade, com o mesmo tamanho, terminando
    // onde esta começa. Antes o painel pedia o dobro do período e subtraía —
    // truque que só funcionava com "últimos N dias" e daria número errado
    // agora que existem "hoje" e "ontem".
    const anteriorParams = paramsDoPeriodo(periodoAnterior(intervalo));
    const [conf, atual, previo] = await Promise.allSettled([
      marketRequest<Settings>("settings"),
      marketRequest<MarketOverview>(`overview?${atualParams}${escopo}`),
      marketRequest<MarketOverview>(`overview?${anteriorParams}${escopo}`),
    ]);
    if (conf.status === "fulfilled") setSettings(conf.value);
    if (atual.status === "fulfilled") { setDados(comListas(atual.value)); marcarCarregado(); }
    if (previo.status === "fulfilled") setAnterior(comListas(previo.value));
    // `schema_missing` só pode ser engolido quando a tela TEM o que desenhar: o
    // aviso de migração pendente basta. Se o overview falhou, engolir o motivo
    // deixava `erro` nulo com `dados` nulo — e o gate lá embaixo escolhia o
    // esqueleto, para sempre, sem nada na tela explicando nem oferecendo saída.
    const engolivel = (r: PromiseSettledResult<unknown>) =>
      r.status === "rejected" && /schema_missing/i.test(String((r as PromiseRejectedResult).reason?.message ?? ""));
    const falha = [atual, conf].find((r) => r.status === "rejected" && !engolivel(r)) as PromiseRejectedResult | undefined;
    if (falha) setErro(falha.reason instanceof Error ? falha.reason.message : "Falha ao carregar os dados.");
    else if (atual.status === "rejected") setErro("A estrutura do TridiMarket ainda não está pronta neste banco.");
    setCarregando(false);
    // `chave` entra de propósito: ela cobre o recorte que a TELA precisa mostrar
    // (inclui a unidade crua), enquanto chaveIntervalo/escopo cobrem só o que vai
    // na consulta. Sem ela, uma mudança de chave sem mudança de consulta não
    // dispara busca nenhuma e o esqueleto fica preso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, chaveIntervalo, escopo]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Filtro fantasma detectado → limpa a preferência salva pra não reaparecer.
  useEffect(() => { if (filtroFantasma) setFiltros({ profileId: "" }); }, [filtroFantasma, setFiltros]);

  // `anterior` já É a janela anterior — não precisa mais de subtração.
  const deltas = useMemo(() => {
    if (!dados || !anterior) return null;
    return {
      consumed: variacao(dados.consumed, anterior.consumed),
      received: variacao(dados.received, anterior.received),
      purchases: variacao(dados.purchases, anterior.purchases),
      itemsSold: variacao(dados.itemsSold, anterior.itemsSold),
      ticket: variacao(dados.ticket, anterior.ticket),
    };
  }, [dados, anterior]);

  const tabletsMudos = dados?.devices.filter((d) => d.active && !d.online) ?? [];

  return (
    <>
      <Cabecalho
        titulo="Painel do mercadinho"
        descricao="Consumo, dívida e estoque"
        filtros={filtros} setFiltros={setFiltros}
        perfis={settings?.profiles ?? []}
        periodo={dados ? { inicio: dados.periodStart, fim: dados.periodEnd } : null}
        carregando={carregando}
        onAtualizar={() => void carregar()}
      />

      {settings && !settings.schemaReady && (
        <Aviso tom="warn" icone="alert-triangle" titulo="Estrutura complementar pendente">
          Rode a migração do TridiMarket para liberar razão imutável, regras de estoque e registro de tablets. Empresas, pessoas, produtos e histórico continuam funcionando.
        </Aviso>
      )}
      {erro && <Aviso tom="neg" icone="circle-x" titulo="Não foi possível carregar">{erro}</Aviso>}
      {filtroFantasma && (
        <Aviso tom="info" icone="info-circle" titulo="Filtro de unidade reiniciado">
          O painel estava filtrando por uma unidade que não existe mais na lista, então mostrava zero. Voltei para <strong>todas as empresas</strong>.
        </Aviso>
      )}
      {tabletsMudos.length > 0 && (
        <Aviso tom="warn" icone="alert-triangle" titulo={`${tabletsMudos.length} tablet(s) sem falar com o servidor`}>
          {tabletsMudos.map((d) => `${d.name} (${haQuantoTempo(d.lastSeenAt)})`).join(" · ")}. As compras feitas neles continuam guardadas e sobem sozinhas quando a rede voltar.
        </Aviso>
      )}

      {/* Três estados, nunca esqueleto infinito. Antes o gate era só
          `desatualizado || !dados` — se a requisição falhasse ou travasse, o
          esqueleto ficava eterno ("carrega e volta a ficar carregando pra
          sempre"). Agora: sem erro e ainda sem os dados do filtro atual →
          esqueleto; com erro e sem os dados atuais → "tentar de novo"; com os
          dados atuais → painel (mesmo durante um refresh, sem piscar). O timeout
          do marketRequest garante que uma chamada travada vire erro, não espera
          infinita. */}
      {(desatualizado || !dados) && !erro ? <Carregando /> : (desatualizado || !dados) ? (
        <FalhaAoCarregar onTentar={() => void carregar()} />
      ) : (
        <>
          <div className="tm-stats" style={{ marginBottom: 14 }}>
            <Stat label="Consumido" value={formatMarketCurrency(dados.consumed)} icon="shopping-cart"
              delta={deltas?.consumed} hint={`${dados.purchases} compra(s)`} />
            <Stat label="Recebido" value={formatMarketCurrency(dados.received)} icon="receipt" tone="pos"
              delta={deltas?.received} hint="pagamentos no período" />
            <Stat label="Em aberto" value={formatMarketCurrency(dados.open)} icon="clock" tone="warn"
              hint="dívida total das carteiras" />
            <Stat label="Em atraso" value={formatMarketCurrency(dados.overdue)} icon="alert-triangle"
              tone={dados.overdue > 0 ? "neg" : "neutral"} hint={`${dados.delinquentEmployees} pessoa(s)`} />
            <Stat label="Ticket médio" value={formatMarketCurrency(dados.ticket)} icon="chart-bar"
              delta={deltas?.ticket} hint="por compra" />
            <Stat label="Itens vendidos" value={String(dados.itemsSold)} icon="package"
              delta={deltas?.itemsSold} hint={`${dados.activeEmployees} pessoa(s) compraram`} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)", gap: 14, marginBottom: 14 }} className="tm-grid-2">
            <Card>
              <PanelTitle title="Vendas — últimos 7 dias" hint="quanto saiu por dia, sempre a última semana" />
              <Vendas7Dias serie={dados.salesLast7} />
            </Card>
            <Card>
              <PanelTitle title="O que sai mais" hint={`${dados.itemsSold} itens no período`} />
              <Mix categorias={dados.categories} />
            </Card>
          </div>

          {/* Quem mais gastou × quem mais vendeu — duas perguntas diferentes da
              dívida (que é "quem deve"). */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 14, marginBottom: 14 }} className="tm-grid-2">
            <Card>
              <PanelTitle title="Quem mais gastou" hint="no período" right={<LinkPainel href="/tridimarket/vendas">ver vendas</LinkPainel>} />
              {dados.topSpenders.length ? (
                <div style={{ display: "grid", gap: 2 }}>
                  {dados.topSpenders.map((p, i) => (
                    <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-dim)", width: 16, flex: "none" }}>{i + 1}</span>
                      <Avatar name={p.name} url={p.imageUrl} size={30} />
                      <div style={{ minWidth: 0, flex: 1, fontSize: 13, fontWeight: 650, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                      <strong style={{ fontSize: 13.5, fontWeight: 750, color: "var(--text)", flex: "none" }}>{formatMarketCurrency(p.spent)}</strong>
                    </div>
                  ))}
                </div>
              ) : <Empty icon="users" title="Ninguém consumiu no período" />}
            </Card>
            <Card>
              <PanelTitle title="Empresas que mais venderam" hint="receita no período" />
              {dados.topCompanies.length ? (
                <div style={{ display: "grid", gap: 2 }}>
                  {dados.topCompanies.map((c, i) => (
                    <div key={c.profileId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-dim)", width: 16, flex: "none" }}>{i + 1}</span>
                      <span style={{ width: 30, height: 30, borderRadius: "var(--r-xs)", flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${INDIGO} 12%, transparent)` }}>
                        <Icon name="building-warehouse" size={16} color={INDIGO} />
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 650, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{c.purchases} {c.purchases === 1 ? "compra" : "compras"}</div>
                      </div>
                      <strong style={{ fontSize: 13.5, fontWeight: 750, color: "var(--text)", flex: "none" }}>{formatMarketCurrency(c.revenue)}</strong>
                    </div>
                  ))}
                </div>
              ) : <Empty icon="building-warehouse" title="Sem vendas no período" />}
            </Card>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 14, marginBottom: 14 }} className="tm-grid-2">
            <Card>
              <PanelTitle title="Compras recentes" hint="as últimas que chegaram" />
              {dados.recentPurchases.length ? (
                <div style={{ display: "grid", gap: 2 }}>
                  {dados.recentPurchases.map((c) => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                      <Avatar name={c.employeeName} url={c.employeeImage} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 650, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.employeeName}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {haQuantoTempo(c.at)} · {c.items} {c.items === 1 ? "item" : "itens"}{c.unitName ? ` · ${c.unitName}` : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flex: "none" }}>
                        <strong style={{ fontSize: 13.5, fontWeight: 750, color: "var(--text)" }}>{formatMarketCurrency(c.total)}</strong>
                        <div style={{ marginTop: 2 }}><Badge tone={c.paid ? "pos" : "neutral"}>{c.paid ? "pago" : "em aberto"}</Badge></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <Empty icon="shopping-cart" title="Nenhuma compra no período" text="Assim que alguém comprar num tablet, aparece aqui." />}
            </Card>

            <Card>
              <PanelTitle title="Mais vendidos" hint="por valor no período" />
              {dados.topProducts.length ? (
                <div style={{ display: "grid", gap: 2 }}>
                  {dados.topProducts.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)", width: 14, flex: "none" }}>{i + 1}</span>
                      <Foto url={p.imageUrl} nome={p.name} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 650, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{p.units} {p.units === 1 ? "unidade" : "unidades"}</div>
                      </div>
                      <strong style={{ fontSize: 13, fontWeight: 750, color: "var(--text)", flex: "none" }}>{formatMarketCurrency(p.revenue)}</strong>
                    </div>
                  ))}
                </div>
              ) : <Empty icon="package" title="Sem vendas no período" />}
            </Card>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 14, marginBottom: 14 }}>
            <Card>
              <PanelTitle title="Tablets" hint="quem está falando com o servidor" right={<LinkPainel href="/tridimarket/tablets">ver todos</LinkPainel>} />
              {dados.devices.length ? (
                <div style={{ display: "grid", gap: 2 }}>
                  {dados.devices.slice(0, 5).map((d) => (
                    <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--border)" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", flex: "none", background: !d.active ? "var(--tf-neutral)" : d.online ? "var(--tf-pos)" : "var(--tf-warn)" }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 650, color: "var(--text)" }}>{d.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{d.unitName ?? "sem unidade"} · visto {haQuantoTempo(d.lastSeenAt)}</div>
                      </div>
                      {!d.active ? <Badge>revogado</Badge> : d.online ? <Badge tone="pos">online</Badge> : <Badge tone="warn">sem contato</Badge>}
                    </div>
                  ))}
                </div>
              ) : <Empty icon="device-mobile" title="Nenhum tablet ativado" text="Gere um código de ativação na aba Tablets." />}
            </Card>

            <Card>
              <PanelTitle title="Quem precisa de atenção" hint={`${dados.delinquentEmployees} em atraso`} right={<LinkPainel href="/tridimarket/pessoas">ver pessoas</LinkPainel>} />
              {dados.employeeAttention.length ? (
                <div style={{ display: "grid", gap: 2 }}>
                  {dados.employeeAttention.map((e) => (
                    <div key={e.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                      <Avatar name={e.name} url={e.imageUrl} size={28} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 650, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {formatMarketCurrency(e.open)} em aberto
                          {/* Deixa explícito que o valor é a SOMA de mais de um
                              cadastro — senão o número parece não bater com a
                              tela de Pessoas de quem só olha uma empresa. */}
                          {e.unified && ` · somado de ${e.accounts.length} empresas`}
                        </div>
                      </div>
                      <Badge tone={e.status === "good" ? "pos" : e.status === "overdue" || e.status === "blocked" ? "neg" : "warn"}>{marketStatusLabel(e.status)}</Badge>
                    </div>
                  ))}
                </div>
              ) : <Empty icon="users" title="Ninguém em atraso" />}
            </Card>

            <Card>
              <PanelTitle title="Estoque para repor" hint={`${dados.criticalStock} abaixo do mínimo`} right={<LinkPainel href="/tridimarket/estoque">ver estoque</LinkPainel>} />
              {dados.stockAttention.length ? (
                <div style={{ display: "grid", gap: 2 }}>
                  {dados.stockAttention.map((p) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                      <Foto url={p.imageUrl} nome={p.name} />
                      <div style={{ minWidth: 0, flex: 1, fontSize: 13, fontWeight: 650, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                      <Badge tone={p.stock <= 0 ? "neg" : p.stock <= p.minimumStock ? "warn" : "pos"}>{p.stock} un.</Badge>
                    </div>
                  ))}
                </div>
              ) : <Empty icon="building-warehouse" title="Estoque saudável" />}
            </Card>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 14 }}>
            <Card>
              <PanelTitle title="Horários de maior movimento" hint={pico ? `pico às ${String(pico.hora).padStart(2, "0")}h · ${pico.compras} compras` : "sem compras no período"} />
              <HorasBarras horas={dados.hourly} />
            </Card>

            <Card>
              <PanelTitle title="Produtos que menos saem" hint="inclui os que não venderam nada no período" />
              {dados.slowProducts.length ? (
                <div style={{ display: "grid", gap: 2 }}>
                  {dados.slowProducts.map((p) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                      <div style={{ minWidth: 0, flex: 1, fontSize: 13, fontWeight: 650, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                      <Badge tone={p.semVenda ? "neg" : "warn"}>{p.semVenda ? "0 no período" : `${p.units} un.`}</Badge>
                    </div>
                  ))}
                </div>
              ) : <Empty icon="package" title="Sem produtos ativos" />}
            </Card>

            <Card>
              <PanelTitle title="Dívida por funcionário" hint="saldo atual, não do período" right={<LinkPainel href="/tridimarket/financeiro">ver financeiro</LinkPainel>} />
              {dados.debtByEmployee.length ? (
                <div style={{ display: "grid", gap: 2 }}>
                  {dados.debtByEmployee.map((p) => (
                    <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                      <Foto url={p.imageUrl} nome={p.name} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 650, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                        <div style={{ height: 5, borderRadius: 3, background: "var(--border)", marginTop: 4, overflow: "hidden" }}>
                          <div style={{ width: `${Math.round(p.share * 100)}%`, height: "100%", background: INDIGO, borderRadius: 3 }} />
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", flex: "none" }}>{formatMarketCurrency(p.open)}</div>
                    </div>
                  ))}
                </div>
              ) : <Empty icon="circle-check" title="Ninguém devendo" />}
            </Card>
          </div>

          {dados.units.length > 1 && (
            <Card>
              <PanelTitle title="Por empresa e unidade" hint="a dívida segue a pessoa · o estoque fica na unidade do tablet" />
              {/* Tabela de 6 colunas com 560px de largura mínima: no celular ela
                  só rolava de lado e o nome da unidade sumia junto. O DataList
                  mantém a tabela no computador e vira cartão no celular. */}
              <DataList itens={dados.units} colunas={COLUNAS_UNIDADE} chaveDe={(u) => u.profileId} minWidth={560}
                vazio="Nenhuma unidade no período." />
            </Card>
          )}
        </>
      )}
    </>
  );
}

// Atalho "ver X" no canto dos painéis. Era um <a> de 17px de altura: no dedo,
// alvo praticamente inacertável. No celular ganha os 44px; no computador segue
// exatamente o mesmo texto de antes, sem mexer na altura do cabeçalho do painel.
function LinkPainel({ href, children }: { href: string; children: React.ReactNode }) {
  const celular = useIsMobile();
  return (
    <Link href={href} style={{
      display: "inline-flex", alignItems: "center", flex: "none",
      fontSize: 12, fontWeight: 700, color: INDIGO, textDecoration: "none",
      minHeight: celular ? "var(--tap)" : undefined,
      paddingLeft: celular ? 8 : undefined,
    }}>{children}</Link>
  );
}

// Colunas do quadro por unidade. Fora do componente porque não dependem de
// estado — recriar o array a cada render só daria trabalho ao React.
const COLUNAS_UNIDADE: Coluna<MarketUnitSummary>[] = [
  { chave: "nome", titulo: "Unidade", papel: "titulo", render: (u) => u.name },
  { chave: "employees", titulo: "Pessoas", render: (u) => u.employees },
  // A ordem do array é a ordem das colunas no computador — mantida igual à
  // tabela antiga. O papel "destaque" é só do cartão: põe o valor em aberto ao
  // lado do nome da unidade, que é o que se procura primeiro no celular.
  { chave: "open", titulo: "Em aberto", papel: "destaque", render: (u) => formatMarketCurrency(u.open) },
  {
    chave: "overdue", titulo: "Em atraso",
    render: (u) => <span style={{ color: u.overdue > 0 ? "var(--tf-neg)" : "var(--text-dim)" }}>{formatMarketCurrency(u.overdue)}</span>,
  },
  { chave: "products", titulo: "Itens", render: (u) => u.products },
  { chave: "criticalStock", titulo: "Repor", render: (u) => <Badge tone={u.criticalStock > 0 ? "warn" : "pos"}>{u.criticalStock}</Badge> },
];

// Movimento por hora: 24 barras. Mostra as 24 mesmo zeradas — buraco no meio
// do dia é informação (é quando o mercadinho não é usado).
function HorasBarras({ horas }: { horas: MarketOverview["hourly"] }) {
  // No computador o `title` de cada barra dá o detalhe no hover. No celular não
  // existe hover E cada barra tem ~9px (24 delas numa tela de 320), alvo
  // impossível de acertar — a informação simplesmente não existia. Aqui a
  // escolha passa a ser pela POSIÇÃO na faixa inteira (dá para arrastar e varrer
  // as horas) e o valor vira texto acima do gráfico. Só no celular: no
  // computador nada muda, nem de layout nem de comportamento.
  const celular = useIsMobile();
  const [ativa, setAtiva] = useState<number | null>(null);
  const faixa = useRef<HTMLDivElement>(null);
  const varrendo = useRef(false);
  const max = Math.max(1, ...horas.map((h) => h.compras));
  const total = horas.reduce((s, h) => s + h.compras, 0);
  const foco = ativa == null ? null : horas.find((h) => h.hora === ativa) ?? null;
  const hh = (n: number) => `${String(n).padStart(2, "0")}h`;

  function escolherPor(clientX: number) {
    const r = faixa.current?.getBoundingClientRect();
    if (!r?.width || !horas.length) return;
    const i = Math.floor(((clientX - r.left) / r.width) * horas.length);
    const h = horas[Math.min(horas.length - 1, Math.max(0, i))];
    if (h) setAtiva(h.hora);
  }

  const varredura = celular ? {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      varrendo.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      escolherPor(e.clientX);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => { if (varrendo.current) escolherPor(e.clientX); },
    onPointerUp: () => { varrendo.current = false; },
    onPointerCancel: () => { varrendo.current = false; },
  } : {};

  if (!total) return <Empty icon="clock" title="Sem compras no período" />;
  return (
    <div>
      {/* Altura reservada: o texto entra e sai sem empurrar o gráfico. */}
      {celular && (
        <div aria-live="polite" style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minHeight: 19, fontSize: 12, color: "var(--text-dim)" }}>
          {foco ? (
            <>
              <strong style={{ fontSize: 13.5, fontWeight: 750, color: "var(--text)" }}>{hh(foco.hora)}</strong>
              <span>{foco.compras} {foco.compras === 1 ? "compra" : "compras"} · {formatMarketCurrency(foco.receita)}</span>
            </>
          ) : <span>Toque ou arraste no gráfico para ver a hora.</span>}
        </div>
      )}
      <div ref={faixa} {...varredura}
        // pan-y deixa a página rolar na vertical em cima do gráfico; o
        // horizontal é nosso (a varredura das horas).
        style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 110, marginTop: 6, touchAction: celular ? "pan-y" : undefined }}>
        {horas.map((h) => (
          <div key={h.hora} title={`${hh(h.hora)} · ${h.compras} compra(s) · ${formatMarketCurrency(h.receita)}`}
            style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", minWidth: 0 }}>
            <div className="mono-barra" data-mt="crescer" style={{
              height: `${(h.compras / max) * 100}%`,
              // Piso igual à LARGURA da casa, não 3px: com raio de pílula uma
              // barra mais baixa que a própria largura sai cortada ao meio e
              // deixa de parecer uma barra. E 1px de altura não lê como
              // "pouco", lê como "nada".
              minHeight: h.compras > 0 ? 8 : 0,
              ["--mt-i" as string]: h.hora,
              background: h.hora === ativa || h.compras === max ? INDIGO : "color-mix(in srgb, " + INDIGO + " 42%, transparent)",
              // A hora escolhida também ganha contorno: destacar só pela cor não
              // serve para quem não distingue os dois tons de roxo.
              outline: h.hora === ativa ? `2px solid ${INDIGO}` : undefined,
              outlineOffset: 1,
              // Pílula, como toda barra da arte mono. O raio é generoso e o
              // `minHeight` acima garante que ele sempre fecha.
              borderRadius: 999,
            }} />
          </div>
        ))}
      </div>
      {/* Régua a cada 6h — 24 rótulos não caberiam. Cada casa tem ~10px no
          celular, então o rótulo VAZA da casa (absoluto, centrado, sem quebra)
          em vez de virar "0/0/h" em três linhas. */}
      <div style={{ display: "flex", marginTop: 6, height: 13, fontSize: 10, color: "var(--text-dim)" }}>
        {horas.map((h) => (
          <div key={h.hora} style={{ flex: 1, minWidth: 0, position: "relative" }}>
            {h.hora % 6 === 0 && (
              <span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap" }}>{hh(h.hora)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Vendas por dia dos últimos 7 dias. Uma barra por dia, com o valor em cima e o
// dia da semana embaixo. Dia sem venda vira barra mínima (buraco é informação).
function Vendas7Dias({ serie }: { serie: MarketOverview["salesLast7"] }) {
  // No celular, 7 colunas de ~30px não comportam "R$ 1.234,56" em cima de cada
  // barra: os rótulos se sobrepunham e nenhum ficava legível. Lá o valor sai de
  // cima das barras e vira UM texto acima do gráfico, com o dia escolhido no
  // toque. No computador continua tudo igual.
  const celular = useIsMobile();
  const [ativo, setAtivo] = useState<number | null>(null);
  if (!serie.length) return <Empty icon="chart-bar" title="Sem vendas" text="As vendas dos últimos 7 dias aparecem aqui." />;
  const max = Math.max(1, ...serie.map((p) => p.total));
  const total = serie.reduce((s, p) => s + p.total, 0);
  const altura = 190;
  const rotulo = (d: string, opt: Intl.DateTimeFormatOptions) =>
    new Date(d + "T12:00:00").toLocaleDateString("pt-BR", opt).replace(".", "");
  const escolhido = ativo != null ? serie[ativo] ?? null : null;

  return (
    <div onMouseLeave={() => setAtivo(null)}>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
        Total da semana: <strong style={{ color: "var(--text)", fontSize: 14 }}>{formatMarketCurrency(total)}</strong>
      </div>
      {celular && (
        <div aria-live="polite" style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minHeight: 19, marginBottom: 4, fontSize: 12, color: "var(--text-dim)" }}>
          {escolhido ? (
            <>
              <strong style={{ fontSize: 13.5, fontWeight: 750, color: "var(--text)", textTransform: "capitalize" }}>
                {rotulo(escolhido.day, { weekday: "short", day: "2-digit", month: "2-digit" })}
              </strong>
              <span>{formatMarketCurrency(escolhido.total)}</span>
            </>
          ) : <span>Toque numa barra para ver o valor do dia.</span>}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: altura }}>
        {serie.map((p, i) => {
          const destaque = ativo === i;
          const h = Math.max(4, (p.total / max) * (altura - 34));
          return (
            <div key={p.day} onMouseEnter={() => setAtivo(i)} onPointerDown={() => setAtivo(i)}
              style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              {!celular && (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: destaque ? INDIGO : "var(--text-dim)", marginBottom: 5, whiteSpace: "nowrap", minHeight: 14 }}>
                  {p.total > 0 ? formatMarketCurrency(p.total) : ""}
                </span>
              )}
              <div style={{
                width: "100%", maxWidth: 56, height: h, borderRadius: "8px 8px 0 0",
                background: destaque || p.total === max ? INDIGO : `color-mix(in srgb, ${INDIGO} 62%, transparent)`,
                // Contorno no dia escolhido: no celular o valor não fica mais em
                // cima da barra, então sem isto "escolhido" e "maior da semana"
                // ficariam com exatamente a mesma cor e nenhum outro sinal.
                outline: destaque && celular ? `2px solid ${INDIGO}` : undefined,
                outlineOffset: 2,
                transition: "background .12s",
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 7 }}>
        {serie.map((p, i) => (
          <div key={p.day} style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
            <div style={{ fontSize: 11.5, color: ativo === i ? "var(--text)" : "var(--text-dim)", fontWeight: 700, textTransform: "capitalize" }}>
              {rotulo(p.day, { weekday: "short" })}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{rotulo(p.day, { day: "2-digit", month: "2-digit" })}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// INDIGO agora é o roxo do sistema; o 2º tom é um roxo mais claro pra não
// repetir a mesma cor na rosca.
const CORES_MIX = [INDIGO, "#a855f7", "#00b3a4", "#f5a623", "#e0457b", "#5aa9e6"];

// Rosca + lista. A rosca dá a proporção de relance; a lista dá o número, que é
// o que serve pra decidir compra.
function Mix({ categorias }: { categorias: MarketOverview["categories"] }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  if (!categorias.length) return <Empty icon="chart-dots" title="Sem itens no período" />;
  const top = categorias.slice(0, 6);
  const raio = 52, circunferencia = 2 * Math.PI * raio;
  let acumulado = 0;
  const foco = ativo != null ? top[ativo] : null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }} onMouseLeave={() => setAtivo(null)}>
      <div style={{ position: "relative", flex: "none", width: 130, height: 130 }}>
        <svg width={130} height={130} viewBox="0 0 130 130" role="img" aria-label="Distribuição por categoria">
          <circle cx="65" cy="65" r={raio} fill="none" stroke="var(--surface-2)" strokeWidth="18" />
          {top.map((c, i) => {
            const traco = c.share * circunferencia;
            const deslocamento = -acumulado * circunferencia;
            acumulado += c.share;
            const destacado = ativo === i;
            return (
              <circle key={c.name} cx="65" cy="65" r={raio} fill="none"
                stroke={CORES_MIX[i % CORES_MIX.length]}
                // A fatia engorda no hover: é a forma de destacar que não
                // depende de cor, então funciona também para daltônicos.
                strokeWidth={destacado ? 24 : 18}
                strokeDasharray={`${traco} ${circunferencia - traco}`} strokeDashoffset={deslocamento}
                transform="rotate(-90 65 65)"
                onMouseEnter={() => setAtivo(i)} onPointerDown={() => setAtivo(i)}
                style={{ cursor: "pointer", transition: "stroke-width .12s ease" }} />
            );
          })}
        </svg>
        {/* O centro da rosca é espaço morto — vira o rótulo do que está sob o
            cursor, sem empurrar o resto do layout. */}
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", textAlign: "center" }}>
          {foco ? (
            // O miolo da rosca tem ~86px: nome de categoria comprido vazava por
            // cima do anel. Presa a 92px com reticências, a marca fica legível e
            // o nome inteiro continua na legenda ao lado.
            <span style={{ maxWidth: 92 }}>
              <strong style={{ display: "block", fontSize: 18, fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>{Math.round(foco.share * 100)}%</strong>
              <small style={{ display: "block", fontSize: 10, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{foco.name}</small>
            </span>
          ) : (
            <span style={{ maxWidth: 92 }}>
              <strong style={{ display: "block", fontSize: 16, fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>{top.reduce((s, c) => s + c.items, 0)}</strong>
              <small style={{ fontSize: 10, color: "var(--text-dim)" }}>itens</small>
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gap: 7, flex: 1, minWidth: 150 }}>
        {top.map((c, i) => {
          const destacado = ativo === i;
          return (
            // <button> de verdade (era <div>): no celular a fundação já lhe dá
            // os 44px de altura e o teclado passa a alcançar a legenda — que é o
            // único jeito de ver a receita da categoria sem mouse.
            <button key={c.name} type="button" aria-pressed={destacado}
              onMouseEnter={() => setAtivo(i)} onPointerDown={() => setAtivo(i)}
              onClick={() => setAtivo(i)}
              style={{
                display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "left",
                padding: "3px 6px", margin: "0 -6px", borderRadius: "var(--r-xs)", border: "none",
                fontFamily: "inherit", width: "calc(100% + 12px)",
                background: destacado ? "var(--surface-2)" : "transparent",
              }}>
              <i style={{ width: 9, height: 9, borderRadius: 3, background: CORES_MIX[i % CORES_MIX.length], flex: "none" }} />
              <span style={{ fontSize: 12.5, color: "var(--text)", fontWeight: destacado ? 700 : 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              {/* A porcentagem NUNCA some: antes ela era trocada pela receita ao
                  destacar, então a única forma de comparar duas categorias era
                  passar o mouse numa e lembrar da outra. */}
              <span style={{ fontSize: 11.5, color: "var(--text-dim)", flex: "none", whiteSpace: "nowrap" }}>
                {destacado ? `${Math.round(c.share * 100)}% · ${formatMarketCurrency(c.revenue)}` : `${c.items} · ${Math.round(c.share * 100)}%`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Foto({ url, nome }: { url: string | null; nome: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    // `contain` + fundo branco: a foto do catálogo é quadrada com fundo branco,
    // e cortar tirava marca e sabor da embalagem.
    return <img src={url} alt="" style={{ width: 30, height: 30, borderRadius: "var(--r-xs)", objectFit: "contain", flex: "none", background: "#fff" }} />;
  }
  return <span style={{ width: 30, height: 30, borderRadius: "var(--r-xs)", flex: "none", display: "grid", placeItems: "center", background: "var(--surface-2)", color: "var(--text-dim)", fontSize: 12, fontWeight: 800 }}>{nome[0]?.toUpperCase()}</span>;
}

// Casca do `Alerta` (ui/Alerta.tsx) — o aviso de sistema é um só no app.
const TOM_AVISO = { warn: "atencao", neg: "perigo", pos: "ok", info: "info" } as const;
export function Aviso({ tom, icone, titulo, children }: { tom: "warn" | "neg" | "pos" | "info"; icone: string; titulo: string; children: React.ReactNode }) {
  return <Alerta tom={TOM_AVISO[tom]} icone={icone} titulo={titulo} style={{ marginBottom: 14 }}>{children}</Alerta>;
}

// Estado de falha: em vez de esqueleto eterno, diz o que houve e oferece um
// botão pra tentar de novo. É o que fecha o "carregando pra sempre".
function FalhaAoCarregar({ onTentar }: { onTentar: () => void }) {
  return (
    <Card>
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <div style={{ width: 60, height: 60, margin: "0 auto 16px", borderRadius: "var(--r-md)", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--tf-warn) 14%, transparent)" }}>
          <Icon name="alert-triangle" size={28} color="var(--tf-warn)" />
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>Não foi possível carregar o painel</div>
        <p style={{ fontSize: 13.5, color: "var(--text-dim)", margin: "6px 0 18px", lineHeight: 1.5 }}>
          A conexão pode ter demorado demais. Nada foi perdido — é só tentar de novo.
        </p>
        <Botao variante="primario" onClick={onTentar}>Tentar de novo</Botao>
      </div>
    </Card>
  );
}

// Esqueleto com a FORMA do painel: seis indicadores, gráfico + rosca, e as
// listas. Um retângulo genérico não prepara a leitura — este já diz onde cada
// coisa vai aparecer.
function Carregando() {
  return (
    <>
      <SkelStats n={6} />
      <div className="tm-grid-2" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)", gap: 14, marginBottom: 14 }}>
        <Card>
          <Skel h={15} w={190} /><Skel h={11} w={110} style={{ marginTop: 6 }} />
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 190, marginTop: 18 }}>
            {Array.from({ length: 24 }, (_, i) => (
              <Skel key={i} h={30 + ((i * 37) % 130)} w="100%" r={4} />
            ))}
          </div>
        </Card>
        <Card>
          <Skel h={15} w={140} /><Skel h={11} w={90} style={{ marginTop: 6 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 20 }}>
            <Skel h={130} w={130} r={65} />
            <div style={{ flex: 1, display: "grid", gap: 9 }}>
              {Array.from({ length: 5 }, (_, i) => <Skel key={i} h={12} w={`${90 - i * 9}%`} />)}
            </div>
          </div>
        </Card>
      </div>
      <div className="tm-grid-2" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 14 }}>
        <Card><Skel h={15} w={160} style={{ marginBottom: 14 }} /><SkelLinhas n={5} /></Card>
        <Card><Skel h={15} w={140} style={{ marginBottom: 14 }} /><SkelLinhas n={5} /></Card>
      </div>
    </>
  );
}
