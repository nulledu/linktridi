"use client";

import { Icon } from "../../Icon";
import { METRIC_DEFINITIONS } from "@/lib/creative-intelligence/metrics";
import type { CreativeMetricKey, CreativeMetrics } from "@/lib/creative-intelligence/types";

export type MetricTone = "result" | "attention" | "acquisition" | "efficiency" | "conversion";

export function metricTone(metric: CreativeMetricKey): MetricTone {
  if (["hookRate", "holdRate", "videoPlays", "videoViews3s", "videoViews2s", "videoViews25", "videoViews50", "videoViews75", "videoViews95", "videoViews100", "thruPlays"].includes(metric)) return "attention";
  if (["impressions", "reach", "frequency", "clicks", "ctr", "cpc", "landingPageViews", "clickToLandingPageViewRate", "impressionToClickRate"].includes(metric)) return "acquisition";
  if (["spend", "cpm", "cpa", "costPerInitiateCheckout", "videoAvgWatchTime"].includes(metric)) return "efficiency";
  if (["initiateCheckout", "landingPageViewToInitiateCheckoutRate", "clickToInitiateCheckoutRate", "initiateCheckoutToPurchaseRate", "clickToPurchaseRate"].includes(metric)) return "conversion";
  return "result";
}

export function formatMetric(key: CreativeMetricKey, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "–";
  const format = METRIC_DEFINITIONS[key].format;
  if (format === "currency") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: value >= 100 ? 0 : 2 }).format(value);
  if (format === "percent") return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  if (format === "ratio") return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`;
  if (format === "seconds") return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
  return value.toLocaleString("pt-BR", { maximumFractionDigits: value < 10 ? 2 : 0 });
}

export function MetricTooltip({ metric }: { metric: CreativeMetricKey }) {
  const definition = METRIC_DEFINITIONS[metric];
  const text = definition.formula ? `${definition.description} Fórmula: ${definition.formula}.` : definition.description;
  return (
    <span className="ci-tooltip" tabIndex={0} title={text} aria-label={text} data-tip={text}>
      <Icon name="info-circle" size={13} color="var(--text-dim)" />
    </span>
  );
}

export function MetricCard({ metric, metrics, emphasis = false, difference }: {
  metric: CreativeMetricKey;
  metrics: CreativeMetrics;
  emphasis?: boolean;
  difference?: number | null;
}) {
  const definition = METRIC_DEFINITIONS[metric];
  const value = metrics[metric];
  return (
    <div className={`ci-metric${emphasis ? " ci-metric-emphasis" : ""}`} data-tone={metricTone(metric)}>
      <div className="ci-metric-label">
        <span>{definition.label}</span>
        {(definition.formula || ["reach", "frequency", "initiateCheckout"].includes(metric)) && <MetricTooltip metric={metric} />}
      </div>
      <div className="ci-metric-value">{formatMetric(metric, value)}</div>
      {difference != null && Number.isFinite(difference) && (
        <div className="ci-metric-delta" data-positive={difference >= 0}>{difference >= 0 ? "+" : ""}{difference.toFixed(0)}% vs mediana</div>
      )}
    </div>
  );
}

export function SectionTitle({ children, icon }: { children: React.ReactNode; icon?: string }) {
  return (
    <div className="ci-section-title">
      {icon && <Icon name={icon} size={15} color="var(--primary-texto)" />}
      <span>{children}</span>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="ci-empty"><Icon name="database" size={22} color="var(--text-dim)" /><span>{children}</span></div>;
}
