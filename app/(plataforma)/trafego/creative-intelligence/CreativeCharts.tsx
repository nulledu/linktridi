"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { METRIC_DEFINITIONS } from "@/lib/creative-intelligence/metrics";
import type { CreativeHistoryPoint, CreativeMetricKey, CreativeMetrics } from "@/lib/creative-intelligence/types";
import { EmptyState, MetricCard, SectionTitle, formatMetric } from "./ui";

const RETENTION: Array<{ key: CreativeMetricKey; label: string }> = [
  { key: "videoPlays", label: "Início" },
  { key: "videoViews3s", label: "3 s" },
  { key: "videoViews25", label: "25%" },
  { key: "videoViews50", label: "50%" },
  { key: "videoViews75", label: "75%" },
  { key: "videoViews95", label: "95%" },
  { key: "videoViews100", label: "100%" },
];

export function CreativeRetention({ metrics }: { metrics: CreativeMetrics }) {
  const data = RETENTION.map((point) => ({
    label: point.label,
    value: metrics[point.key],
    key: point.key,
    percentage: metrics.videoPlays && metrics[point.key] != null ? (metrics[point.key]! / metrics.videoPlays) * 100 : null,
    definition: METRIC_DEFINITIONS[point.key].description,
  })).filter((point) => point.value != null);
  const drops = data.slice(1).map((point, index) => ({
    from: data[index], to: point,
    loss: data[index].value! > 0 ? ((data[index].value! - point.value!) / data[index].value!) * 100 : 0,
  }));
  const biggest = [...drops].sort((a, b) => b.loss - a.loss)[0];
  if (data.length < 2) return <EmptyState>Sem pontos de retenção coletados neste período.</EmptyState>;
  return (
    <div className="ci-stack">
      <div className="ci-three-metrics">
        <MetricCard metric="hookRate" metrics={metrics} />
        <MetricCard metric="holdRate" metrics={metrics} />
        <MetricCard metric="videoAvgWatchTime" metrics={metrics} />
        <MetricCard metric="thruPlays" metrics={metrics} />
      </div>
      <div className="ci-chart-card">
        <SectionTitle icon="chart-line">Curva de retenção</SectionTitle>
        <div className="ci-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
              <defs><linearGradient id="ciRetention" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--text-dim)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-dim)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value, _name, item) => {
                const point = item.payload as { percentage: number | null; definition: string };
                const percentage = point.percentage == null ? "" : ` · ${point.percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% das reproduções`;
                return [`${Number(value).toLocaleString("pt-BR")}${percentage} · ${point.definition}`, "Retenção"];
              }} contentStyle={{ maxWidth: 290, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 11 }} />
              <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2.2} fill="url(#ciRetention)" connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      {biggest && <p className="ci-note">Maior queda observada entre {biggest.from.label} e {biggest.to.label}: {biggest.loss.toFixed(0)}%.</p>}
    </div>
  );
}

const HISTORY_KEYS: CreativeMetricKey[] = ["spend", "roas", "cpa", "cpm", "ctr", "hookRate", "holdRate", "initiateCheckout", "purchases"];

export function CreativeHistory({ history }: { history: CreativeHistoryPoint[] }) {
  const [metric, setMetric] = useState<CreativeMetricKey>("roas");
  const data = useMemo(() => history.map((point) => ({ day: point.day.slice(5).split("-").reverse().join("/"), value: point.metrics[metric] })), [history, metric]);
  if (!history.length) return <EmptyState>Sem série diária para este criativo no período.</EmptyState>;
  return (
    <div className="ci-stack">
      <div className="ci-chart-head">
        <SectionTitle icon="history">Performance no tempo</SectionTitle>
        <select value={metric} onChange={(event) => setMetric(event.target.value as CreativeMetricKey)} aria-label="Métrica do histórico" className="ci-select">
          {HISTORY_KEYS.map((key) => <option key={key} value={key}>{METRIC_DEFINITIONS[key].label}</option>)}
        </select>
      </div>
      <div className="ci-chart-card">
        <div className="ci-chart ci-chart-history">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "var(--text-dim)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-dim)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value) => [formatMetric(metric, Number(value)), METRIC_DEFINITIONS[metric].label]} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }} />
              <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2.2} dot={{ r: 2.5, fill: "var(--primary)" }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
