import type { PanelConfig, Product, Salesperson, SalesSnapshot, Team } from "@/lib/types";
import { DEFAULT_CONFIG } from "@/lib/types";
import type { DataSource } from "./types";

// Lê/escreve no Postgres do Supabase. Recebe um client já construído (admin ou
// server) para não acoplar a fonte ao mecanismo de auth.
export class SupabaseDataSource implements DataSource {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly db: any) {}

  async getSales(): Promise<SalesSnapshot> {
    const [sp, tm, pr, rv] = await Promise.all([
      this.db.from("salespeople").select("*").limit(500),
      this.db.from("teams").select("*").limit(100),
      this.db.from("products").select("*").order("revenue", { ascending: false }).limit(500),
      this.db.from("revenue").select("*").eq("id", 1).single(),
    ]);
    if (sp.error) throw sp.error;
    if (tm.error) throw tm.error;
    if (pr.error) throw pr.error;
    if (rv.error) throw rv.error;

    const salespeople: Salesperson[] = (sp.data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      name: r.name as string,
      photoUrl: (r.photo_url as string) ?? null,
      team: r.team as "marketing" | "comercial",
      sales: { daily: Number(r.daily_sales), weekly: Number(r.weekly_sales), monthly: Number(r.monthly_sales) },
      goal: { daily: Number(r.daily_goal), weekly: Number(r.weekly_goal), monthly: Number(r.monthly_goal) },
    }));

    const teams: Team[] = (tm.data ?? []).map((r: Record<string, unknown>) => {
      const current = Number(r.current);
      const goal = Number(r.goal);
      return {
        id: r.id as "marketing" | "comercial",
        name: r.name as string,
        current,
        goal,
        progressPct: goal > 0 ? Math.round((current / goal) * 1000) / 10 : 0,
      };
    });

    const topProducts: Product[] = (pr.data ?? []).slice(0, 5).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      name: r.name as string,
      imageUrl: (r.image_url as string) ?? null,
      qty: Number(r.qty),
      revenue: Number(r.revenue),
    }));

    const rvd = rv.data as Record<string, unknown>;
    return {
      updatedAt: new Date().toISOString(),
      salespeople,
      teams,
      revenue: {
        daily: Number(rvd.daily),
        weekly: Number(rvd.weekly),
        monthly: Number(rvd.monthly),
        trendPct: Number(rvd.trend_pct),
      },
      topProducts,
    };
  }

  async getConfig(): Promise<PanelConfig> {
    const { data, error } = await this.db.from("config").select("data").eq("id", 1).maybeSingle();
    if (error) throw error;
    if (!data?.data) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...(data.data as PanelConfig) };
  }

  async setConfig(config: PanelConfig): Promise<PanelConfig> {
    const { error } = await this.db.from("config").upsert({ id: 1, data: config });
    if (error) throw error;
    return config;
  }
}
