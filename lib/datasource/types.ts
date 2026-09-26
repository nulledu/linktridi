import type { PanelConfig, SalesSnapshot } from "@/lib/types";

// Interface única de dados. Trocar a implementação (Mock → Supabase → API/Sheets)
// não deve exigir mudança em API routes nem na UI.
export interface DataSource {
  getSales(): Promise<SalesSnapshot>;
  getConfig(): Promise<PanelConfig>;
  setConfig(config: PanelConfig): Promise<PanelConfig>;
}
