import type { PanelConfig, SalesSnapshot } from "@/lib/types";
import { DEFAULT_CONFIG } from "@/lib/types";
import type { DataSource } from "./types";
import { MOCK_SNAPSHOT } from "./mock-data";

// Implementação em memória. Usada em testes e como fallback quando o Supabase
// não está configurado.
export class MockDataSource implements DataSource {
  private config: PanelConfig = { ...DEFAULT_CONFIG };

  async getSales(): Promise<SalesSnapshot> {
    return { ...MOCK_SNAPSHOT, updatedAt: new Date().toISOString() };
  }

  async getConfig(): Promise<PanelConfig> {
    return this.config;
  }

  async setConfig(config: PanelConfig): Promise<PanelConfig> {
    this.config = config;
    return this.config;
  }
}
