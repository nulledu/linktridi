export type MetricDirection = "higher" | "lower" | "neutral";
export type MetricFormat = "currency" | "number" | "percent" | "ratio" | "seconds";

export interface CreativeRawMetrics {
  spend: number | null;
  revenue: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  landingPageViews: number | null;
  initiateCheckout: number | null;
  purchases: number | null;
  videoPlays: number | null;
  videoViews3s: number | null;
  videoViews2s: number | null;
  videoViews25: number | null;
  videoViews50: number | null;
  videoViews75: number | null;
  videoViews95: number | null;
  videoViews100: number | null;
  videoAvgWatchTime: number | null;
  thruPlays: number | null;
  /** Engajamento da peça. Opcional: só existe em linha sincronizada depois do
   *  `supabase/criativo_engajamento.sql` — antes disso fica ausente, nunca zero. */
  reactions?: number | null;
  comments?: number | null;
  shares?: number | null;
}

export interface CreativeMetrics extends CreativeRawMetrics {
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  frequency: number | null;
  cpm: number | null;
  ctr: number | null;
  cpc: number | null;
  cpa: number | null;
  roas: number | null;
  costPerInitiateCheckout: number | null;
  clickToLandingPageViewRate: number | null;
  landingPageViewToInitiateCheckoutRate: number | null;
  clickToInitiateCheckoutRate: number | null;
  initiateCheckoutToPurchaseRate: number | null;
  impressionToClickRate: number | null;
  clickToPurchaseRate: number | null;
  hookRate: number | null;
  holdRate: number | null;
}

export type CreativeMetricKey = keyof CreativeMetrics;

export interface MetricDefinition {
  key: CreativeMetricKey;
  label: string;
  shortLabel?: string;
  description: string;
  formula?: string;
  direction: MetricDirection;
  format: MetricFormat;
}

export interface CreativePeriod {
  since: string;
  until: string;
}

export interface CreativeBenchmark {
  period: CreativePeriod;
  sampleSize: number;
  medians: Partial<Record<CreativeMetricKey, number>>;
}

export interface CreativeScore {
  overallScore: number | null;
  hookScore: number | null;
  retentionScore: number | null;
  engagementScore: number | null;
  mediaEfficiencyScore: number | null;
  intentScore: number | null;
  conversionScore: number | null;
}

export interface CreativeInsight {
  type: "strength" | "attention" | "risk" | "neutral";
  severity: "positive" | "info" | "warning";
  metric: CreativeMetricKey;
  currentValue: number;
  benchmarkValue: number;
  difference: number;
  title: string;
  description: string;
}

export interface CreativeDiagnosis {
  title: string;
  description: string;
  rule: string;
}

export interface CreativeInsightsResult {
  insights: CreativeInsight[];
  diagnosis: CreativeDiagnosis;
  suggestedTests: string[];
}

export interface CreativeComparable {
  id: string;
  name: string;
  metrics: CreativeMetrics;
  tags?: string[];
}

export interface CreativeTagAggregate extends CreativeComparable {
  creativeCount: number;
  tags: string[];
}

export interface CreativeHistoryPoint {
  day: string;
  metrics: CreativeMetrics;
}

export interface CreativeIntelligencePayload {
  period: CreativePeriod;
  current: CreativeComparable;
  peers: CreativeComparable[];
  tags: CreativeTagAggregate[];
  benchmark: CreativeBenchmark;
  score: CreativeScore;
  analysis: CreativeInsightsResult;
  history: CreativeHistoryPoint[];
  partial: boolean;
  unavailableReason?: string;
}
