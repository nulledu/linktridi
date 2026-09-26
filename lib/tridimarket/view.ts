import type { FinancialStatus } from "./types";

export type MarketTab = "overview" | "employees" | "products" | "inventory" | "finance" | "devices" | "settings";

export const MARKET_TABS: Array<{ key: MarketTab; label: string; icon: string }> = [
  { key: "overview", label: "Visão geral", icon: "layout-grid" },
  { key: "employees", label: "Funcionários", icon: "users" },
  // Estoque não é mais uma aba: virou ação dentro de Produtos (a empresa é
  // escolhida na hora do ajuste, porque o saldo é por empresa).
  { key: "products", label: "Produtos", icon: "package" },
  { key: "finance", label: "Financeiro", icon: "receipt" },
  { key: "devices", label: "Dispositivos", icon: "device-mobile" },
  { key: "settings", label: "Ajustes", icon: "settings" },
];

const STATUS_LABEL: Record<FinancialStatus, string> = {
  good: "Em dia",
  near_limit: "Próximo do limite",
  overdraft: "Crédito extra",
  overdue: "Em atraso",
  blocked: "Bloqueado",
};

export function marketStatusLabel(status: FinancialStatus): string {
  return STATUS_LABEL[status];
}

export function formatMarketCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function normalizeMarketTab(value: string | null | undefined): MarketTab {
  return MARKET_TABS.some((tab) => tab.key === value) ? value as MarketTab : "overview";
}
