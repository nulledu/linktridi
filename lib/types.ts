// Modelo de domínio compartilhado entre API, dashboard e (espelhado no) tv-app.

import type { PainelLayout, Perfil } from "./painel-layout";
import type { TridifyResumo } from "./painel-tridify";

export type Period = "daily" | "weekly" | "monthly";

export interface PeriodValues {
  daily: number;
  weekly: number;
  monthly: number;
}

export interface Salesperson {
  id: string;
  name: string;
  photoUrl: string | null;
  team: "marketing" | "comercial";
  sales: PeriodValues;
  goal: PeriodValues;
  orders?: PeriodValues; // nº de pedidos por período
}

export interface Team {
  id: "marketing" | "comercial";
  name: string;
  current: number; // faturamento atual no período de referência (mensal)
  goal: number;
  progressPct: number; // 0..100+
}

export interface Product {
  id: string;
  name: string;
  imageUrl: string | null;
  qty: number;
  revenue: number;
}

export interface Revenue {
  daily: number;
  weekly: number;
  monthly: number;
  trendPct: number; // variação vs período anterior
}

export interface SalesSnapshot {
  updatedAt: string; // ISO-8601
  salespeople: Salesperson[];
  teams: Team[];
  revenue: Revenue;
  topProducts: Product[];
  metrics?: Metrics; // Fase 2 — métricas de acompanhamento (opcional)
  /**
   * Eficiência de tráfego vinda do TRIDIFY — fonte única de ROAS/ROI/CPA/lucro.
   * Ausente quando o Tridify não responde; os widgets caem no cálculo local.
   * Ver `lib/painel-tridify.ts` para por que a TV não calcula isso sozinha.
   */
  tridify?: TridifyResumo | null;
}

// Fase 2 — métricas de acompanhamento. Campos de tráfego são null até a Meta Ads
// estar conectada.
export interface RevenueCount {
  revenue: number;
  count: number;
}

export interface Metrics {
  totalSales: RevenueCount; // Vendas Totais (preco_total)
  yampi: {
    paid: RevenueCount; // Carimbos Tridi (tráfego pago)
    organic: RevenueCount; // Carimbos (Organico)
    total: RevenueCount; // preco_yampi total
    ticketMedio: number;
  };
  comercial: RevenueCount; // vendas do setor 2
  projection: number; // run-rate do mês
  // Tráfego (Meta Ads) — null até conectar.
  trafficSpend: number | null;
  trafficSpendReal: number | null; // spend * 1.1383
  // Receita de tráfego pago (Carimbos Tridi) ao longo do tempo + tendência.
  paidTrendPct: number; // últimos 7d vs 7d anteriores
  trafficSeries: { day: string; value: number }[]; // receita tráfego pago, ~30 dias
  revenueSeries: { day: string; value: number }[]; // faturamento total, ~30 dias
}

export interface Theme {
  primary: string;
  secondary: string;
  background: string;
  logoUrl: string | null;
}

export interface PanelConfig {
  theme: Theme;
  slideIntervalMs: number;
  refreshIntervalMs: number;
  goalSoundUrl: string | null;
  monthlyRevenueGoal: number; // meta de faturamento do mês (Fase 2)
  trafficTaxPct: number; // imposto do Facebook somado ao tráfego (ex: 13.83)
  /**
   * Montagem do painel (slides e widgets), editada em Administração → Painéis.
   * Opcional: sem ela o painel usa o carrossel fixo de sempre — é o que mantém
   * as TVs já instaladas funcionando sem ninguém precisar reconfigurar nada.
   */
  layout?: PainelLayout | null;
  /** Os modelos de tela disponíveis. Ver `perfisPadrao()`. */
  perfis?: Perfil[] | null;
}

export const DEFAULT_CONFIG: PanelConfig = {
  theme: {
    primary: "#0A84FF",
    secondary: "#30D158",
    background: "#000000",
    logoUrl: null,
  },
  slideIntervalMs: 20000,
  refreshIntervalMs: 30000,
  goalSoundUrl: null,
  monthlyRevenueGoal: 300000,
  trafficTaxPct: 13.83,
};
