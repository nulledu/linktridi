// ── Dados de EXEMPLO da Tridify (só pra preview de desenvolvimento) ─────────
// NÃO é usado em produção: a rota /dev-tridify que consome isto retorna 404
// fora de dev. Serve pra renderizar os componentes reais (CampanhasPro, painel,
// gráficos) sem precisar de login nem da Meta — pra ver o visual de verdade.
import type { AdsOverview, AdMetrics, CampaignRow, AdRow, AdSetRow, SeriePonto } from "@/lib/meta-ads";
// A conta vem do módulo PURO; o tipo entra como `import type` (some no build).
// Importar a função de `trafego-vendas` puxava Supabase/`next/headers` pro
// bundle do cliente e quebrava o build inteiro em /dev-tridify.
import { eficienciaTrafego } from "@/lib/trafego-eficiencia";
import type { VendasSnapshot } from "@/lib/trafego-vendas";
import { chaveCriativo } from "@/lib/criativos";
import { buildCreativeIntelligenceFromRows, type CreativeWarehouseRow } from "@/lib/creative-intelligence/server";
import type { CreativeIntelligencePayload } from "@/lib/creative-intelligence/types";

function m(spend: number, revenue: number, purchases: number, over: Partial<AdMetrics> = {}): AdMetrics {
  const clicks = over.clicks ?? Math.round(spend / 1.8);
  const impressions = over.impressions ?? clicks * 42;
  return {
    spend, impressions, reach: Math.round(impressions * 0.7), frequency: 1.4 + Math.random(),
    clicks, ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0, cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    purchases, revenue, roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : null,
    leads: Math.round(purchases * 1.6), cpa: purchases > 0 ? spend / purchases : null,
    cpl: purchases > 0 ? spend / (purchases * 1.6) : null, ...over,
  };
}

const NOMES = [
  ["{MKT} Carimbos — Conversão", "Carimbos Tridi", "carimbo"],
  ["{MKT} Escala Vídeo 3", "Carimbos Tridi", "carimbo"],
  ["{SM-8660} Chancela — Remarketing", "Chancela Pro", "chancela"],
  ["{MKT} Público frio LAL 1%", "Carimbos Tridi", "carimbo"],
  ["{MKT} Teste criativo 14", "Carimbos Tridi", "carimbo"],
  ["{SM-8661} Chancela — Fundo de funil", "Chancela Pro", "chancela"],
  ["{MKT} Retargeting 7d", "Carimbos Tridi", "carimbo"],
];

function spark(base: number): { d: string; spend: number; revenue: number }[] {
  return Array.from({ length: 8 }, (_, i) => ({ d: `07-${String(6 + i).padStart(2, "0")}`, spend: base * (0.6 + i * 0.08), revenue: base * (0.6 + i * 0.08) * (1.4 + 0.5 * Math.sin(i / 2)) }));
}

export function sampleOverview(): AdsOverview {
  const specs: Array<[number, number, number]> = [
    [1204, 2911, 26], [2100, 6400, 41], [988, 1204, 9], [760, 1520, 14], [402, 0, 0], [1340, 3015, 22], [540, 1780, 16],
  ];
  const campanhas: CampaignRow[] = specs.map(([s, r, p], i) => ({
    ...m(s, r, p), id: `camp_${i}`, name: NOMES[i][0], accountId: `10${i}`, account: NOMES[i][1],
    status: null, objetivo: i % 2 ? "Conversões" : "Vendas do catálogo", categoria: NOMES[i][2],
    tags: (NOMES[i][0].match(/\{[^}]+\}/g) ?? []), spark: spark(s),
  }));
  const anuncios: AdRow[] = specs.slice(0, 6).flatMap(([s, r, p], i) => [0, 1].map((k) => ({
    ...m(Math.round(s / 2) - k * 40, Math.round(r / 2) - k * 60, Math.max(0, Math.round(p / 2) - k)),
    id: `ad_${i}_${k}`, name: `${NOMES[i][0].replace(/\{[^}]+\}\s*/, "")} — criativo ${k + 1}`,
    account: NOMES[i][1], campaign: NOMES[i][0], status: k ? "PAUSED" : "ACTIVE",
    thumb: null, videoId: null, permalink: null, criadoEm: null, tipo: (k ? "video" : "imagem") as "video" | "imagem",
    categoria: NOMES[i][2], tags: NOMES[i][0].match(/\{[^}]+\}/g) ?? [],
  })));
  const conjuntos: AdSetRow[] = specs.slice(0, 5).map(([s, r, p], i) => ({
    ...m(Math.round(s * 0.8), Math.round(r * 0.8), Math.round(p * 0.8)),
    id: `set_${i}`, name: `Conjunto — público ${20 + i * 5}-${35 + i * 5}`, account: NOMES[i][1], campaign: NOMES[i][0],
  }));

  // ── Série diária ──────────────────────────────────────────────────────────
  // Carrega os MESMOS campos que a série real (cliques, alcance, leads, LPV,
  // carrinho, checkout): sem eles metade dos KPIs do painel não tinha como
  // desenhar a própria curva no banco de provas, e um card sem linha parecia
  // decisão de design em vez de amostra incompleta.
  //
  // Cada total do funil é REPARTIDO pelos dias na proporção do gasto, então a
  // soma da série fecha exatamente com `funil` lá embaixo — que é o que a demo
  // precisa provar: o detalhe e a manchete saem da mesma conta.
  //
  // E nada de `Math.random()`: o arquivo se anuncia como amostra determinística
  // e o CTR sorteado fazia a mesma tela medir diferente a cada carga — numa
  // amostra que existe justamente pra conferir medida.
  const FUNIL_TOTAL = { impressions: 87262, reach: 61000, cliques: 1489, lpv: 1050, addCart: 340, checkout: 113, leads: 74 };
  const gastos = Array.from({ length: 14 }, (_, i) => 300 + i * 40 + (i % 3 ? 80 : -50));
  const somaGasto = gastos.reduce((a, b) => a + b, 0);
  const serie: SeriePonto[] = gastos.map((spend, i) => {
    const f = spend / somaGasto;
    const revenue = spend * (1.4 + 0.5 * Math.sin(i / 2));
    const impressions = Math.round(FUNIL_TOTAL.impressions * f);
    const clicks = Math.round(FUNIL_TOTAL.cliques * f);
    return {
      day: `2026-07-${String(6 + i).padStart(2, "0")}`,
      spend, revenue, purchases: Math.round(revenue / 176),
      roas: Math.round((revenue / spend) * 100) / 100,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      cpc: clicks > 0 ? spend / clicks : undefined,
      impressions, clicks,
      reach: Math.round(FUNIL_TOTAL.reach * f),
      leads: Math.round(FUNIL_TOTAL.leads * f),
      lpv: Math.round(FUNIL_TOTAL.lpv * f),
      addCart: Math.round(FUNIL_TOTAL.addCart * f),
      checkout: Math.round(FUNIL_TOTAL.checkout * f),
    };
  });

  const totSpend = campanhas.reduce((a, c) => a + c.spend, 0);
  const totRev = campanhas.reduce((a, c) => a + c.revenue, 0);
  const totPur = campanhas.reduce((a, c) => a + c.purchases, 0);
  const kpisBase = m(totSpend, totRev, totPur);

  return {
    updatedAt: new Date().toISOString(), periodLabel: "Últimos 14 dias",
    since: "2026-07-06", until: "2026-07-19", contasAtivas: 2,
    kpis: { ...kpisBase, prevSpend: totSpend * 0.82 },
    kpisPrev: m(totSpend * 0.82, totRev * 0.74, Math.round(totPur * 0.8)),
    serie, seriePrev: serie.map((p) => ({ ...p, spend: p.spend * 0.85, revenue: p.revenue * 0.78 })),
    saude: { score: 78, nivel: "boa", tendenciaRoas: 11, tendenciaCtr: -4, fatores: [
      { label: "ROAS acima da meta", ok: true, detalhe: "2.4× vs meta 2.0×" },
      { label: "Frequência saudável", ok: true, detalhe: "média 1.8" },
      { label: "1 campanha sem venda", ok: false, detalhe: "Teste criativo 14" },
    ] },
    campanhas, conjuntos, anuncios,
    recomendacoes: [
      { tipo: "escalar", nivel: "campanha", ref: "Escala Vídeo 3", titulo: "Escalar orçamento", detalhe: "ROAS 3.05× com folga.", severidade: "boa", impacto: "+R$ 1.800/mês est." },
      { tipo: "pausar", nivel: "campanha", ref: "Teste criativo 14", titulo: "Pausar ou revisar", detalhe: "R$ 402 sem venda.", severidade: "alta" },
    ],
    tagsAgg: [], categoriasAgg: [],
    // Os mesmos totais que a série reparte dia a dia — uma tabela só.
    funil: { spend: totSpend, revenue: totRev, ...FUNIL_TOTAL, purchases: totPur },
    funisPorTag: [], funisPorCategoria: [],
  };
}

/** Amostra determinística usada apenas pelo banco de provas /dev-tridify. */
export function sampleCreativeIntelligence(overview: AdsOverview): CreativeIntelligencePayload {
  const days = Array.from({ length: 14 }, (_, index) => `2026-07-${String(6 + index).padStart(2, "0")}`);
  const rows: CreativeWarehouseRow[] = overview.anuncios.flatMap((ad, adIndex) => days.map((date, dayIndex) => {
    const share = 1 / days.length;
    const videoPlays = Math.max(40, Math.round((ad.impressions * share) * .72));
    const variation = .92 + (dayIndex % 5) * .035;
    return {
      date,
      adId: ad.id,
      adName: ad.name,
      spend: ad.spend * share,
      impressions: Math.round(ad.impressions * share),
      clicks: Math.round(ad.clicks * share),
      purchases: ad.purchases * share,
      revenue: ad.revenue * share,
      landingPageViews: Math.round((ad.lpv ?? ad.clicks * .78) * share),
      initiateCheckout: Math.round((ad.checkout ?? Math.max(ad.purchases * 3.5, 2)) * share),
      funnelMetricsCollected: true,
      videoPlays,
      videoViews3s: Math.round(videoPlays * (.50 + (adIndex % 4) * .05) * variation),
      videoViews2s: Math.round(videoPlays * (.43 + (adIndex % 4) * .05) * variation),
      videoViews25: Math.round(videoPlays * .36 * variation),
      videoViews50: Math.round(videoPlays * .27 * variation),
      videoViews75: Math.round(videoPlays * .19 * variation),
      videoViews95: Math.round(videoPlays * .14 * variation),
      videoViews100: Math.round(videoPlays * .12 * variation),
      videoAvgWatchTime: 8.4 + (adIndex % 5) * 1.15,
      thruPlays: Math.round(videoPlays * .18 * variation),
      videoMetricsCollected: true,
      engagementMetricsCollected: true,
      reactions: Math.round(ad.impressions * share * (.009 + (adIndex % 3) * .003) * variation),
      comments: Math.round(ad.impressions * share * .0012 * variation),
      shares: Math.round(ad.impressions * share * (.0015 + (adIndex % 2) * .001) * variation),
    };
  }));
  const first = overview.anuncios[0];
  const year = 2026;
  const marks = new Map<string, string[]>();
  overview.anuncios.forEach((ad, index) => marks.set(chaveCriativo(ad, year), index % 2 ? ["Produto", "Reels"] : ["Carimbo", "Institucional"]));
  return buildCreativeIntelligenceFromRows({
    currentKey: chaveCriativo(first, year),
    currentAdIds: [first.id],
    period: { since: overview.since, until: overview.until },
    rows,
    marks,
  });
}

/**
 * Faturamento dia a dia da amostra, nos 14 dias da série do Meta.
 *
 * Reparte cada total por um peso que oscila (a mesma senóide da curva de
 * gasto), então a linha tem forma e a SOMA continua batendo com o total do
 * card — é o que a demo precisa provar: detalhe e manchete da mesma conta.
 */
function serieDiaAmostra(trafego: number, organico: number, comercial: number, empresa: number): VendasSnapshot["serieDia"] {
  const pesos = Array.from({ length: 14 }, (_, i) => 1 + 0.45 * Math.sin(i / 2) + (i % 3 ? 0.12 : -0.18));
  const soma = pesos.reduce((a, b) => a + b, 0);
  return pesos.map((w, i) => {
    const f = w / soma;
    return {
      d: `2026-07-${String(6 + i).padStart(2, "0")}`,
      trafego: trafego * f, organico: organico * f, comercial: comercial * f,
      empresa: empresa * f, marketplace: 0, vendas: Math.round(187 * f),
    };
  });
}

export function sampleVendas(): VendasSnapshot {
  // Números de eficiência vêm da MESMA função do snapshot real: escritos à mão
  // eles envelheciam calados a cada mudança de fórmula, e a demo passava a
  // mostrar um ROAS que a tela de produção não produz mais.
  const trafegoValor = 4386.93 + 25236.72 + 5193.5, trafegoN = 187;
  const organicoValor = 3320.4, comercialValor = 21480;
  const faturamentoX1 = 3100, pedidosX1 = 12;
  const faturamentoTrafego = trafegoValor + faturamentoX1;
  const pedidosTrafego = trafegoN + pedidosX1;
  const faturamentoEmpresa = trafegoValor + organicoValor + comercialValor;
  const custosConfig = { produtoPct: 20, impostoPct: 8, gatewayPct: 4, custoFixo: 3 };
  const ef = eficienciaTrafego({
    faturamentoTrafego, pedidosTrafego, faturamentoEmpresa, faturamentoPago: 4386,
    gasto: 7334, metaRevenue: 16400, custos: custosConfig,
  });
  return {
    since: "2026-07-06", until: "2026-07-19", updatedAt: new Date().toISOString(),
    faturamento: 18840, pedidos: 242, aprovados: 57, pendentes: 185, taxaAprovacao: 23.6,
    chargebacks: 2, taxaChargeback: 3.5, ticketMedio: 330.5,
    gasto: 7334, gastoMeta: 6934, gastoManual: 400, gastoComImposto: ef.gastoComImposto, custos: ef.custos, lucro: ef.lucro,
    roas: ef.roas, margem: ef.margem, roi: ef.roi, mer: ef.mer, cpaTrafego: ef.cpa, roasEquilibrio: ef.roasEquilibrio,
    metaRevenue: 16400, roasMeta: ef.roasMeta,
    faturamentoPago: 4386, pedidosPago: 23, faturamentoX1, pedidosX1,
    roasReal: ef.roasReal, pctAtribuido: 23.3, fonteTrafego: "Carimbos Tridi",
    // `yampiPagas*` é a loja Yampi INTEIRA (o "pagas" é legado: pedido válido,
    // aprovado no ERP ou não), e `yampiNaoPagas*` é o subconjunto que o ERP
    // ainda não aprovou — 137 dos 160.
    yampiPagasN: 160, yampiPagasValor: 29623.65, yampiNaoPagasN: 137, yampiNaoPagasValor: 25236.72,
    trafegoNaoPagasN: 149, trafegoNaoPagasValor: 27110.4,
    // Líquido por canal SOMA a base do tráfego (4.386,93 + 25.236,72 aguardando
    // aprovação + 5.193,50 da Vega = trafegoValor): no snapshot real as linhas
    // do detalhamento somam o próprio total, e a amostra tem que reproduzir
    // isso — senão a demo mostra um card que não fecha.
    yampiTrafegoLiquido: 29623.65, yampiOrgLiquido: 3320.4, vegaLiquidoValor: 5193.5, outrasLiquido: 0,
    yampiOrgN: 18, yampiOrgValor: 3320.4, comercialValor, comercialPedidos: 96,
    vegaN: 27, vegaValor: 5193.5,
    trafegoValor, trafegoN,
    organicoValor, organicoN: 18, marketplaceValor: 0, marketplaceN: 0,
    fontesResumo: [],
    comercialPlanilhaValor: comercialValor, comercialRegrasValor: 0, comercialUpsellValor: 0, comercialUpsellN: 0, comercialFonte: "planilha",
    faturamentoEmpresa, pedidosEmpresa: trafegoN + 18 + 96,
    operacaoPropriaValor: faturamentoEmpresa, operacaoPropriaN: trafegoN + 18 + 96,
    faturamentoTrafego, pedidosTrafego,
    // Canais coerentes com as linhas acima (a soma fecha com faturamentoEmpresa
    // + X1): é o que alimenta a rosca e a tabela "Desempenho por canal" do
    // painel — amostra vazia aqui é banco de provas que não prova nada.
    canais: [
      { key: "yampi_trafego", label: "Yampi tráfego · Carimbos Tridi", pago: true, faturamento: 29623.65, pedidos: 160, pct: 49.7 },
      { key: "comercial", label: "Comercial", pago: false, faturamento: comercialValor, pedidos: 96, pct: 36 },
      { key: "vega", label: "Vega Checkout", pago: true, faturamento: 5193.5, pedidos: 27, pct: 8.7 },
      { key: "yampi_organica", label: "Yampi orgânica", pago: false, faturamento: organicoValor, pedidos: 18, pct: 5.6 },
      { key: "x1", label: "Marketing X1", pago: true, faturamento: faturamentoX1, pedidos: pedidosX1, pct: 5.2 },
    ],
    // A série diária do ERP tem que existir e cobrir OS MESMOS dias da série do
    // Meta (`sampleOverview`, 06–19/07/2026): as duas se casam por DATA, e uma
    // amostra vazia fazia o banco de provas mostrar card sem linha nenhuma —
    // exatamente os cards que eu estava tentando conferir. Os valores são a
    // repartição do total por dia, com a mesma forma da curva de gasto, pra
    // que a soma dos dias feche com os totais acima.
    serieDia: serieDiaAmostra(trafegoValor, organicoValor, comercialValor, faturamentoEmpresa),
    custosConfig,
    metas: { roas: 2, cpa: 130, faturamento: 25000, lucro: 8000, investimento: 10000, vendas: 80, margem: 35 },
  };
}
