import type { CreativeMetricKey, CreativeMetrics, CreativeRawMetrics, MetricDefinition } from "./types";

export const HOOK_RATE_DEFINITION = {
  numerator: "videoViews3s",
  denominator: "videoPlays",
  formula: "visualizações de 3 segundos / reproduções × 100",
  description: "Percentual de reproduções que chegaram a pelo menos 3 segundos de vídeo.",
} as const;

export const HOLD_RATE_DEFINITION = {
  numerator: "thruPlays",
  denominator: "videoViews3s",
  formula: "ThruPlay / visualizações de 3 segundos × 100",
  description: "Percentual das visualizações de 3 segundos que chegaram a um ThruPlay da Meta.",
} as const;

export function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function safeDivide(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  const n = finiteOrNull(numerator);
  const d = finiteOrNull(denominator);
  if (n == null || d == null || d <= 0) return null;
  const result = n / d;
  return Number.isFinite(result) ? result : null;
}

const percent = (numerator: number | null | undefined, denominator: number | null | undefined) => {
  const value = safeDivide(numerator, denominator);
  return value == null ? null : value * 100;
};

export function deriveCreativeMetrics(raw: CreativeRawMetrics): CreativeMetrics {
  const spend = finiteOrNull(raw.spend);
  const revenue = finiteOrNull(raw.revenue);
  const impressions = finiteOrNull(raw.impressions);
  const reach = finiteOrNull(raw.reach);
  const clicks = finiteOrNull(raw.clicks);
  const landingPageViews = finiteOrNull(raw.landingPageViews);
  const initiateCheckout = finiteOrNull(raw.initiateCheckout);
  const purchases = finiteOrNull(raw.purchases);
  const videoPlays = finiteOrNull(raw.videoPlays);
  const videoViews3s = finiteOrNull(raw.videoViews3s);
  const videoViews2s = finiteOrNull(raw.videoViews2s);
  const videoViews25 = finiteOrNull(raw.videoViews25);
  const videoViews50 = finiteOrNull(raw.videoViews50);
  const videoViews75 = finiteOrNull(raw.videoViews75);
  const videoViews95 = finiteOrNull(raw.videoViews95);
  const videoViews100 = finiteOrNull(raw.videoViews100);
  const videoAvgWatchTime = finiteOrNull(raw.videoAvgWatchTime);
  const thruPlays = finiteOrNull(raw.thruPlays);
  const reactions = finiteOrNull(raw.reactions);
  const comments = finiteOrNull(raw.comments);
  const shares = finiteOrNull(raw.shares);

  return {
    spend, revenue, impressions, reach, clicks, landingPageViews, initiateCheckout, purchases,
    videoPlays, videoViews3s, videoViews2s, videoViews25, videoViews50, videoViews75, videoViews95,
    videoViews100, videoAvgWatchTime, thruPlays, reactions, comments, shares,
    frequency: safeDivide(impressions, reach),
    cpm: (() => { const n = safeDivide(spend, impressions); return n == null ? null : n * 1_000; })(),
    ctr: percent(clicks, impressions),
    cpc: safeDivide(spend, clicks),
    cpa: safeDivide(spend, purchases),
    roas: safeDivide(revenue, spend),
    costPerInitiateCheckout: safeDivide(spend, initiateCheckout),
    clickToLandingPageViewRate: percent(landingPageViews, clicks),
    landingPageViewToInitiateCheckoutRate: percent(initiateCheckout, landingPageViews),
    clickToInitiateCheckoutRate: percent(initiateCheckout, clicks),
    initiateCheckoutToPurchaseRate: percent(purchases, initiateCheckout),
    impressionToClickRate: percent(clicks, impressions),
    clickToPurchaseRate: percent(purchases, clicks),
    hookRate: percent(videoViews3s, videoPlays),
    holdRate: percent(thruPlays, videoViews3s),
  };
}

const def = (key: CreativeMetricKey, label: string, format: MetricDefinition["format"], direction: MetricDefinition["direction"], description: string, formula?: string): MetricDefinition => ({
  key, label, format, direction, description, formula,
});

export const METRIC_DEFINITIONS: Record<CreativeMetricKey, MetricDefinition> = {
  spend: def("spend", "Investido", "currency", "neutral", "Valor investido no período."),
  revenue: def("revenue", "Faturamento", "currency", "higher", "Valor de compras atribuído pela Meta."),
  impressions: def("impressions", "Impressões", "number", "higher", "Número de vezes que os anúncios foram exibidos."),
  reach: def("reach", "Alcance", "number", "higher", "Pessoas únicas alcançadas quando a Meta fornece um total deduplicado."),
  clicks: def("clicks", "Cliques", "number", "higher", "Cliques atribuídos ao anúncio."),
  landingPageViews: def("landingPageViews", "Landing Page Views", "number", "higher", "Carregamentos da página de destino atribuídos ao anúncio."),
  initiateCheckout: def("initiateCheckout", "IC", "number", "higher", "Initiate Checkout: eventos de início de checkout atribuídos."),
  purchases: def("purchases", "Compras", "number", "higher", "Compras atribuídas pela Meta."),
  videoPlays: def("videoPlays", "Reproduções", "number", "higher", "Inícios de reprodução do vídeo."),
  videoViews3s: def("videoViews3s", "Visualizações de 3 s", "number", "higher", "Visualizações de vídeo registradas pela Meta após pelo menos 3 segundos."),
  videoViews2s: def("videoViews2s", "Visualizações de 2 s", "number", "higher", "Reproduções contínuas que chegaram a 2 segundos."),
  videoViews25: def("videoViews25", "25% assistido", "number", "higher", "Reproduções que alcançaram 25% do vídeo."),
  videoViews50: def("videoViews50", "50% assistido", "number", "higher", "Reproduções que alcançaram 50% do vídeo."),
  videoViews75: def("videoViews75", "75% assistido", "number", "higher", "Reproduções que alcançaram 75% do vídeo."),
  videoViews95: def("videoViews95", "95% assistido", "number", "higher", "Reproduções que alcançaram 95% do vídeo."),
  videoViews100: def("videoViews100", "100% assistido", "number", "higher", "Reproduções que alcançaram 100% do vídeo."),
  videoAvgWatchTime: def("videoAvgWatchTime", "Tempo médio", "seconds", "higher", "Tempo médio assistido por reprodução, quando fornecido pela Meta."),
  thruPlays: def("thruPlays", "ThruPlay", "number", "higher", "Reproduções completas ou de pelo menos 15 segundos, conforme a definição da Meta."),
  reactions: def("reactions", "Curtidas", "number", "higher", "Reações ao anúncio (curtir, amei, uau…), como a Meta conta em post_reaction."),
  comments: def("comments", "Comentários", "number", "higher", "Comentários feitos no anúncio."),
  shares: def("shares", "Compartilhamentos", "number", "higher", "Vezes que o anúncio foi compartilhado."),
  frequency: def("frequency", "Frequência", "number", "neutral", "Média de impressões por pessoa alcançada.", "impressões / alcance"),
  cpm: def("cpm", "CPM", "currency", "lower", "Custo médio para cada 1.000 impressões.", "investimento / impressões × 1.000"),
  ctr: def("ctr", "CTR", "percent", "higher", "Percentual de impressões que geraram clique.", "cliques / impressões × 100"),
  cpc: def("cpc", "CPC", "currency", "lower", "Custo médio por clique.", "investimento / cliques"),
  cpa: def("cpa", "CPA", "currency", "lower", "Custo médio por compra.", "investimento / compras"),
  roas: def("roas", "ROAS", "ratio", "higher", "Receita atribuída para cada real investido.", "faturamento / investimento"),
  costPerInitiateCheckout: def("costPerInitiateCheckout", "Custo por IC", "currency", "lower", "Custo médio para gerar um início de checkout.", "investimento / IC"),
  clickToLandingPageViewRate: def("clickToLandingPageViewRate", "Clique → LPV", "percent", "higher", "Percentual de cliques que carregaram a página de destino.", "Landing Page Views / cliques × 100"),
  landingPageViewToInitiateCheckoutRate: def("landingPageViewToInitiateCheckoutRate", "LPV → IC", "percent", "higher", "Percentual das visitas à página que iniciaram checkout.", "IC / Landing Page Views × 100"),
  clickToInitiateCheckoutRate: def("clickToInitiateCheckoutRate", "Clique → IC", "percent", "higher", "Percentual de cliques que geraram início de checkout.", "IC / cliques × 100"),
  initiateCheckoutToPurchaseRate: def("initiateCheckoutToPurchaseRate", "IC → Compra", "percent", "higher", "Percentual de inícios de checkout que viraram compra.", "compras / IC × 100"),
  impressionToClickRate: def("impressionToClickRate", "Impressão → Clique", "percent", "higher", "Percentual de impressões que geraram clique.", "cliques / impressões × 100"),
  clickToPurchaseRate: def("clickToPurchaseRate", "Clique → Compra", "percent", "higher", "Percentual de cliques que viraram compra.", "compras / cliques × 100"),
  hookRate: def("hookRate", "Hook Rate", "percent", "higher", HOOK_RATE_DEFINITION.description, HOOK_RATE_DEFINITION.formula),
  holdRate: def("holdRate", "Hold Rate", "percent", "higher", HOLD_RATE_DEFINITION.description, HOLD_RATE_DEFINITION.formula),
};
