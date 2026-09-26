"use client";

import { useEffect, useRef, useState } from "react";
import { METRIC_DEFINITIONS } from "@/lib/creative-intelligence/metrics";
import type { CreativeIntelligencePayload, CreativeMetricKey, CreativeMetrics } from "@/lib/creative-intelligence/types";
import type { CreativePeriodSelection } from "@/lib/creative-intelligence/period";
import { Icon } from "../../Icon";
import { FunilForma } from "../../ui/funil";
import { CreativeComparison } from "./CreativeComparison";
import { CreativeHistory, CreativeRetention } from "./CreativeCharts";
import { CreativePresentation } from "./CreativePresentation";
import { EmptyState, MetricCard, SectionTitle, formatMetric } from "./ui";

type Tab = "overview" | "funnel" | "retention" | "history" | "compare" | "presentation";
const TABS: Array<{ key: Tab; label: string }> = [
  { key: "overview", label: "Visão geral" },
  { key: "funnel", label: "Funil" },
  { key: "retention", label: "Retenção" },
  { key: "history", label: "Histórico" },
  { key: "compare", label: "Comparar" },
  { key: "presentation", label: "Apresentação" },
];

export function CreativeIntelligencePanel({ payload, fallback, loading = false, error, openPresentationSignal = 0, previewUrl, panelPeriod, periodSelection, onPeriodSelectionChange }: {
  payload?: CreativeIntelligencePayload | null;
  fallback?: { name: string; metrics: CreativeMetrics };
  loading?: boolean;
  error?: string | null;
  openPresentationSignal?: number;
  previewUrl?: string | null;
  panelPeriod?: { since: string; until: string };
  periodSelection?: CreativePeriodSelection;
  onPeriodSelectionChange?: (selection: CreativePeriodSelection) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openPresentationSignal <= 0) return;
    setTab("presentation");
    // "Gerar apresentação" fica no rodapé do modal: sem rolar até as abas, a
    // aba troca lá em cima e ninguém vê o deck que acabou de abrir.
    const frame = requestAnimationFrame(() => {
      const suave = !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      tabsRef.current?.scrollIntoView?.({ block: "start", behavior: suave ? "smooth" : "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [openPresentationSignal]);
  const current = payload?.current ?? fallback;
  if (!current) {
    if (error) return <div className="ci-error" role="alert"><Icon name="alert-triangle" size={14} color="var(--perigo)" /> {error}</div>;
    if (loading) return <div className="ci-loading"><div className="spin" /> Carregando análise de {periodSelection?.since ?? "–"} a {periodSelection?.until ?? "–"}…</div>;
    return <EmptyState>A inteligência detalhada ainda não está disponível.</EmptyState>;
  }
  const metrics = current.metrics;
  const refreshing = loading && Boolean(payload);
  return (
    <div className="ci-panel" aria-busy={loading}>
      {refreshing && periodSelection && (
        <div className="ci-sync-status" role="status">
          <div className="spin" />
          Atualizando métricas de {formatDate(periodSelection.since)} a {formatDate(periodSelection.until)}…
        </div>
      )}
      <div className="ci-kpis ci-kpis-primary">
        {(["roas", "spend", "revenue", "purchases"] as CreativeMetricKey[]).map((key) => <MetricCard key={key} metric={key} metrics={metrics} emphasis />)}
      </div>
      <div className="ci-kpis ci-kpis-secondary">
        {(["cpa", "cpm", "ctr", "cpc"] as CreativeMetricKey[]).map((key) => <MetricCard key={key} metric={key} metrics={metrics} />)}
      </div>
      {payload?.partial && <div className="ci-partial"><Icon name="info-circle" size={14} color="var(--tf-warn)" /> Dados parciais: métricas ainda não sincronizadas aparecem como “–”.</div>}
      {error && <div className="ci-error"><Icon name="alert-triangle" size={14} color="var(--perigo)" /> {error}</div>}
      <div ref={tabsRef} className="tab-strip ci-tabs" role="tablist" aria-label="Análise do criativo">
        {TABS.map((item) => <button key={item.key} role="tab" aria-selected={tab === item.key} data-active={tab === item.key} onClick={() => setTab(item.key)}>{item.label}</button>)}
      </div>
      <div className="ci-tab-content">
        {loading && !payload ? <div className="ci-loading"><div className="spin" /> Carregando benchmark, histórico e retenção…</div> : !payload ? <EmptyState>{error || "A inteligência detalhada ainda não está disponível."}</EmptyState> : (
          <>
            {tab === "overview" && <Overview payload={payload} />}
            {tab === "funnel" && <Funnel metrics={metrics} />}
            {tab === "retention" && <CreativeRetention metrics={metrics} />}
            {tab === "history" && <CreativeHistory history={payload.history} />}
            {tab === "compare" && <CreativeComparison currentId={payload.current.id} peers={payload.peers} tags={payload.tags} />}
            {tab === "presentation" && <CreativePresentation
              payload={payload}
              previewUrl={previewUrl}
              panelPeriod={panelPeriod ?? payload.period}
              periodSelection={periodSelection ?? { preset: "panel", ...payload.period }}
              onPeriodSelectionChange={onPeriodSelectionChange}
            />}
          </>
        )}
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function ScoreCompact({ score }: { score: number | null }) {
  const sweep = score == null ? 0 : score * 3.6;
  return <div className="ci-score-compact" style={{ "--score": `${sweep}deg` } as React.CSSProperties}><div><strong>{score ?? "–"}</strong><span>/ 100</span></div><small>Creative Score</small></div>;
}

function difference(current: number | null, benchmark: number | undefined, lower = false): number | null {
  if (current == null || benchmark == null || benchmark === 0) return null;
  const delta = ((current - benchmark) / Math.abs(benchmark)) * 100;
  return lower ? -delta : delta;
}

function Overview({ payload }: { payload: CreativeIntelligencePayload }) {
  const featured: CreativeMetricKey[] = ["hookRate", "ctr", "cpm", "initiateCheckoutToPurchaseRate"];
  const scoreRows: Array<[string, number | null]> = [
    ["Hook", payload.score.hookScore], ["Retenção", payload.score.retentionScore], ["Engajamento", payload.score.engagementScore],
    ["Eficiência", payload.score.mediaEfficiencyScore], ["Intenção", payload.score.intentScore], ["Conversão", payload.score.conversionScore],
  ];
  return (
    <div className="ci-overview-grid">
      <section className="ci-analysis-card">
        <SectionTitle icon="activity">Análise do criativo</SectionTitle>
        <div className="ci-health-grid">{featured.map((key) => <MetricCard key={key} metric={key} metrics={payload.current.metrics} difference={difference(payload.current.metrics[key], payload.benchmark.medians[key], METRIC_DEFINITIONS[key].direction === "lower")} />)}</div>
        <div className="ci-diagnosis"><Icon name="bulb" size={20} color="var(--primary-texto)" /><div><strong>{payload.analysis.diagnosis.title}</strong><p>{payload.analysis.diagnosis.description}</p></div></div>
        <SectionTitle>Próximos testes sugeridos</SectionTitle>
        <div className="ci-tests">{payload.analysis.suggestedTests.map((test) => <span key={test}>{test}</span>)}</div>
      </section>
      <aside className="ci-score-card">
        <ScoreCompact score={payload.score.overallScore} />
        <p>Pontuação relativa aos outros criativos da conta no período selecionado.</p>
        <div>{scoreRows.map(([label, score]) => <div key={label}><span>{label}</span><strong>{score == null ? "–" : score}</strong></div>)}</div>
      </aside>
    </div>
  );
}

function Funnel({ metrics }: { metrics: CreativeMetrics }) {
  const stages: Array<{ key: CreativeMetricKey; label: string; rate?: CreativeMetricKey }> = [
    { key: "impressions", label: "Impressões", rate: "impressionToClickRate" },
    { key: "clicks", label: "Cliques", rate: "clickToLandingPageViewRate" },
    { key: "landingPageViews", label: "Landing Page Views", rate: "landingPageViewToInitiateCheckoutRate" },
    { key: "initiateCheckout", label: "Initiate Checkout", rate: "initiateCheckoutToPurchaseRate" },
    { key: "purchases", label: "Compras" },
  ];
  return (
    <div className="ci-funnel-layout">
      <FunilForma rotulo="Funil do criativo" etapas={stages.map((stage, index) => {
        const anterior = index > 0 ? stages[index - 1].rate : undefined;
        return {
          chave: stage.key, nome: stage.label, valor: metrics[stage.key] ?? 0,
          texto: formatMetric(stage.key, metrics[stage.key]),
          taxa: anterior ? formatMetric(anterior, metrics[anterior]) : undefined,
        };
      })} />
      <div className="ci-funnel-costs">{(["cpm", "cpc", "costPerInitiateCheckout", "cpa", "reach", "frequency"] as CreativeMetricKey[]).map((key) => <MetricCard key={key} metric={key} metrics={metrics} />)}</div>
    </div>
  );
}
