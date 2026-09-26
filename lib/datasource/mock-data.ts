import type { SalesSnapshot } from "@/lib/types";

// Dados mock determinísticos. Espelham o seed.sql do Supabase.
export const MOCK_SNAPSHOT: SalesSnapshot = {
  updatedAt: new Date().toISOString(),
  salespeople: [
    { id: "s1", name: "Ana Souza", photoUrl: null, team: "comercial", sales: { daily: 4200, weekly: 21000, monthly: 86000 }, goal: { daily: 4000, weekly: 20000, monthly: 80000 } },
    { id: "s2", name: "Bia Lima", photoUrl: null, team: "marketing", sales: { daily: 3800, weekly: 19500, monthly: 72000 }, goal: { daily: 4000, weekly: 20000, monthly: 80000 } },
    { id: "s3", name: "Carla Reis", photoUrl: null, team: "comercial", sales: { daily: 5100, weekly: 24000, monthly: 95000 }, goal: { daily: 4500, weekly: 22000, monthly: 90000 } },
    { id: "s4", name: "Duda Alves", photoUrl: null, team: "marketing", sales: { daily: 2900, weekly: 15000, monthly: 61000 }, goal: { daily: 3500, weekly: 18000, monthly: 70000 } },
    { id: "s5", name: "Elis Nunes", photoUrl: null, team: "comercial", sales: { daily: 3300, weekly: 17000, monthly: 68000 }, goal: { daily: 3500, weekly: 18000, monthly: 72000 } },
  ],
  teams: [
    { id: "marketing", name: "Marketing", current: 133000, goal: 150000, progressPct: 88.7 },
    { id: "comercial", name: "Comercial", current: 249000, goal: 242000, progressPct: 102.9 },
  ],
  revenue: { daily: 19300, weekly: 96500, monthly: 382000, trendPct: 12.4 },
  topProducts: [
    { id: "p1", name: "Plano Pro Anual", imageUrl: null, qty: 142, revenue: 142000 },
    { id: "p2", name: "Plano Start", imageUrl: null, qty: 318, revenue: 95400 },
    { id: "p3", name: "Add-on Suporte", imageUrl: null, qty: 87, revenue: 43500 },
    { id: "p4", name: "Consultoria", imageUrl: null, qty: 24, revenue: 60000 },
    { id: "p5", name: "Treinamento", imageUrl: null, qty: 41, revenue: 41000 },
  ],
};
