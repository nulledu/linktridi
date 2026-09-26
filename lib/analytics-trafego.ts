import type { AdsOverview, AdMetrics, CampaignRow, Funil } from "./meta-ads";

/**
 * Projeção COMPACTA do panorama do Meta Ads para a aba "Tráfego pago" do
 * Analytics.
 *
 * Por que existe em vez de a tela chamar `/api/trafego/overview` direto: o
 * panorama cru carrega campanhas, conjuntos, anúncios, criativos e
 * recomendações — centenas de KB por período. A aba do Analytics é um RESUMO
 * (oito números, duas curvas e três listas curtas), e mandar meio mega pro
 * navegador a cada troca de período é exatamente o padrão que estourou o
 * egress em julho/2026. Aqui o servidor lê o MESMO cache do Tridify e manda
 * ~6 KB.
 *
 * Módulo puro de propósito (só tipos entram): assim o banco de provas
 * `/dev-analytics` projeta o retrato de exemplo pela função de verdade, em vez
 * de manter uma segunda cópia do formato que diverge com o tempo.
 */

export interface TrafegoKpis {
  spend: number;
  clicks: number;
  cpc: number;
  ctr: number;
  impressions: number;
  revenue: number;
  purchases: number;
  /** Receita ÷ compras. Zero quando não houve compra — não é `null` porque o
   *  cartão mostra "R$ 0,00" e não um traço: o período existiu, o ticket é 0. */
  ticket: number;
  roas: number | null;
  cpa: number | null;
}

/** Um dia da série — o mínimo que as duas curvas da tela precisam. */
export interface TrafegoDia { day: string; spend: number; revenue: number; roas: number | null }

/** Uma linha das listas (conta ou campanha). */
export interface TrafegoLinha { nome: string; spend: number; revenue: number; purchases: number; roas: number | null }

/**
 * Uma etapa do funil, já com as DUAS conversões calculadas:
 * `pctTopo` compara com o primeiro degrau (é o número que a pessoa cita) e
 * `pctAnterior` compara com o degrau de cima (é o que diz ONDE está o furo).
 */
export interface TrafegoEtapa { nome: string; valor: number; pctTopo: number | null; pctAnterior: number | null }

export interface TrafegoResumo {
  updatedAt: string;
  periodLabel: string;
  contasAtivas: number;
  kpis: TrafegoKpis;
  /** Mesma janela, imediatamente antes — de onde saem os "vs período anterior". */
  prev: TrafegoKpis | null;
  serie: TrafegoDia[];
  contas: TrafegoLinha[];
  campanhas: TrafegoLinha[];
  funil: TrafegoEtapa[];
  /**
   * OS NÚMEROS DO TRIDIFY (cartões principais), lidos do mesmo `snapshotVendas`.
   * Até 26/09/2026 esta aba abria com "Vendas atribuídas" e o ROAS da Meta
   * (1,96× no dia em que o Tridify mostrava 1,17×): a janela de atribuição do
   * pixel, sem imposto e sem gasto manual. As duas telas davam o mesmo nome a
   * números diferentes. A régua da Meta continua aqui, na faixa de baixo.
   */
  tridify?: { atual: TridifyKpis; anterior: TridifyKpis | null; serie: { day: string; faturamento: number }[] };
}

/** Os cartões do Tridify: faturamento do tráfego contra gasto + imposto. */
export interface TridifyKpis {
  faturamentoTrafego: number; pedidosTrafego: number;
  gasto: number; gastoComImposto: number;
  roas: number | null; lucro: number; cpa: number | null;
}

/** Recorte dos cartões do Tridify a partir do snapshot (pura). */
export function tridifyKpis(t: { faturamentoTrafego: number; pedidosTrafego: number; gasto: number; gastoComImposto: number; roas: number | null; lucro: number; cpaTrafego: number | null }): TridifyKpis {
  const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
  return {
    faturamentoTrafego: Math.round(t.faturamentoTrafego), pedidosTrafego: t.pedidosTrafego,
    gasto: Math.round(t.gasto), gastoComImposto: Math.round(t.gastoComImposto),
    roas: r2(t.roas), lucro: Math.round(t.lucro), cpa: r2(t.cpaTrafego),
  };
}

function kpisDe(m: AdMetrics): TrafegoKpis {
  return {
    spend: m.spend,
    clicks: m.clicks,
    cpc: m.cpc,
    ctr: m.ctr,
    impressions: m.impressions,
    revenue: m.revenue,
    purchases: m.purchases,
    ticket: m.purchases > 0 ? m.revenue / m.purchases : 0,
    roas: m.roas,
    cpa: m.cpa,
  };
}

/** Soma as campanhas por uma chave (o nome da conta) e ordena por gasto. */
function agrupar(campanhas: CampaignRow[], chave: (c: CampaignRow) => string, limite: number): TrafegoLinha[] {
  const mapa = new Map<string, TrafegoLinha>();
  for (const c of campanhas) {
    const nome = chave(c) || "—";
    const l = mapa.get(nome) ?? { nome, spend: 0, revenue: 0, purchases: 0, roas: null };
    l.spend += c.spend;
    l.revenue += c.revenue;
    l.purchases += c.purchases;
    mapa.set(nome, l);
  }
  return [...mapa.values()]
    // ROAS é RAZÃO: some as pontas e divida no fim. Somar o ROAS de cada
    // campanha daria 12x numa conta que rendeu 3x — foi assim que o painel
    // antigo inflava o retorno das contas com muitas campanhas pequenas.
    .map((l) => ({ ...l, roas: l.spend > 0 ? Math.round((l.revenue / l.spend) * 100) / 100 : null }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limite);
}

/**
 * Etapas do funil, do clique à compra.
 *
 * Degrau intermediário ZERADO sai do desenho: sem o pixel de "visualização de
 * página" ou de "carrinho" configurado a Meta simplesmente não devolve a ação,
 * e uma barra vazia no meio lê-se como "ninguém chegou aqui" — que é a
 * conclusão errada. Clique e compra ficam sempre, mesmo em zero: são as duas
 * pontas e sem elas não há funil nenhum.
 */
export function funilEtapas(f: Funil): TrafegoEtapa[] {
  const brutas: { nome: string; valor: number; fixa: boolean }[] = [
    { nome: "Cliques no link", valor: f.cliques, fixa: true },
    { nome: "Visualizações de página", valor: f.lpv, fixa: false },
    { nome: "Adições ao carrinho", valor: f.addCart, fixa: false },
    { nome: "Checkouts iniciados", valor: f.checkout, fixa: false },
    { nome: "Compras", valor: f.purchases, fixa: true },
  ].filter((e) => e.fixa || e.valor > 0);

  const topo = brutas[0]?.valor ?? 0;
  return brutas.map((e, i) => {
    const anterior = i > 0 ? brutas[i - 1].valor : null;
    return {
      nome: e.nome,
      valor: e.valor,
      pctTopo: i === 0 || topo <= 0 ? null : Math.round((e.valor / topo) * 1000) / 10,
      pctAnterior: anterior == null || anterior <= 0 ? null : Math.round((e.valor / anterior) * 1000) / 10,
    };
  });
}

export function resumoDoOverview(d: AdsOverview, opts: { contas?: number; campanhas?: number } = {}): TrafegoResumo {
  const limiteContas = opts.contas ?? 8;
  const limiteCamp = opts.campanhas ?? 6;
  return {
    updatedAt: d.updatedAt,
    periodLabel: d.periodLabel,
    contasAtivas: d.contasAtivas,
    kpis: kpisDe(d.kpis),
    // Período anterior inteiramente zerado não é comparação: é a primeira
    // janela de dados. Mostrar "+100% vs período anterior" ali seria inventar
    // um crescimento que ninguém teve.
    prev: d.kpisPrev && d.kpisPrev.spend > 0 ? kpisDe(d.kpisPrev) : null,
    serie: (d.serie ?? []).map((p) => ({ day: p.day, spend: p.spend, revenue: p.revenue, roas: p.roas })),
    contas: agrupar(d.campanhas, (c) => c.account, limiteContas),
    campanhas: agrupar(d.campanhas, (c) => c.name, limiteCamp)
      // A lista de campanhas responde "de onde veio a VENDA", então ela ordena
      // por receita — a de contas, que responde "onde está o dinheiro", segue
      // por gasto.
      .sort((a, b) => b.revenue - a.revenue),
    funil: funilEtapas(d.funil),
  };
}

/** Variação percentual entre dois números, `null` quando não há base. */
export function variacao(atual: number, anterior: number | undefined | null): number | null {
  if (anterior == null || anterior === 0) return null;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}
