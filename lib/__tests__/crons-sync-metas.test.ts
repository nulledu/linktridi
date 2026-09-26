import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * /api/sync é o cron noturno que copia o snapshot do ERP pro Supabase. As METAS
 * de venda moram na mesma linha do vendedor e são do gestor, não do ERP.
 *
 * Antes: lia as metas ignorando o `error`, APAGAVA a tabela inteira e regravava.
 * Um erro na leitura virava mapa vazio → todo mundo regravado com meta 0. Um
 * erro no upsert, depois do delete, deixava a tabela vazia. E nenhum `error`
 * das escritas era conferido: o cron respondia `ok: true` por cima.
 */

type Op = { tabela: string; op: string; corpo?: unknown; filtros: string[] };
const db = vi.hoisted(() => ({
  ops: [] as { tabela: string; op: string; corpo?: unknown; filtros: string[] }[],
  falha: null as null | ((o: { tabela: string; op: string }) => string | null),
  metasAntigas: [{ id: "v1", daily_goal: 100, weekly_goal: 500, monthly_goal: 2000 }],
}));
const erp = vi.hoisted(() => ({ buildErpSnapshot: vi.fn() }));

vi.mock("@/lib/erp", () => ({ buildErpSnapshot: erp.buildErpSnapshot }));
vi.mock("@/lib/logistica", () => ({ persistLogisticaSnapshot: vi.fn(async () => {}) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({
    from(tabela: string) {
      const q = (op: string, corpo?: unknown) => {
        const o: Op = { tabela, op, corpo, filtros: [] };
        db.ops.push(o);
        const b = {
          eq: (c: string, v: unknown) => { o.filtros.push(`${c}=eq.${v}`); return b; },
          neq: (c: string, v: unknown) => { o.filtros.push(`${c}=neq.${v}`); return b; },
          not: (c: string, op2: string, v: unknown) => { o.filtros.push(`${c}=not.${op2}.${v}`); return b; },
          then: (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) => {
            const msg = db.falha?.(o) ?? null;
            const data = msg ? null : op === "select" ? db.metasAntigas : null;
            return Promise.resolve({ data, error: msg ? { message: msg } : null }).then(ok, erro);
          },
        };
        return b;
      };
      return {
        select: (c: string) => q("select", c),
        upsert: (v: unknown) => q("upsert", v),
        delete: () => q("delete"),
        update: (v: unknown) => q("update", v),
      };
    },
  }),
}));

const SNAP = {
  updatedAt: "2026-09-10T03:00:00Z",
  salespeople: [
    { id: "v1", name: "Ana", photoUrl: null, team: "comercial", sales: { daily: 10, weekly: 20, monthly: 30 } },
    { id: "v2", name: "Bia", photoUrl: null, team: "marketing", sales: { daily: 1, weekly: 2, monthly: 3 } },
  ],
  teams: [{ id: "comercial", current: 30 }, { id: "marketing", current: 3 }],
  revenue: { daily: 11, weekly: 22, monthly: 33, trendPct: 5 },
  topProducts: [{ id: "p1", name: "Carimbo", imageUrl: null, qty: 4, revenue: 100 }],
};

beforeEach(() => {
  db.ops.length = 0;
  db.falha = null;
  erp.buildErpSnapshot.mockResolvedValue(SNAP);
  vi.stubEnv("CRON_SECRET", "cron-0123456789abcdef");
});
afterEach(() => vi.unstubAllEnvs());

async function rodar() {
  const { GET } = await import("@/app/api/sync/route");
  return GET(new NextRequest("https://gaius.vercel.app/api/sync", {
    headers: { authorization: "Bearer cron-0123456789abcdef" },
  }));
}
const de = (tabela: string, op: string) => db.ops.filter((o) => o.tabela === tabela && o.op === op);
const idx = (tabela: string, op: string) => db.ops.findIndex((o) => o.tabela === tabela && o.op === op);

describe("/api/sync: a meta do gestor sobrevive ao cron", () => {
  it("nenhuma linha do upsert de vendedores carrega meta — nem quando a leitura falha", async () => {
    // A leitura das metas (se ainda existir) falha: antes isso virava meta 0.
    db.falha = (o) => (o.tabela === "salespeople" && o.op === "select" ? "statement timeout" : null);
    await rodar();
    const linhas = de("salespeople", "upsert").flatMap((o) => o.corpo as Record<string, unknown>[]);
    for (const l of linhas) {
      expect(Object.keys(l).filter((k) => k.endsWith("_goal")), `upsert de ${l.id} sobrescreve a meta`).toEqual([]);
    }
  });

  it("upsert falhou → não apaga ninguém e responde 500", async () => {
    db.falha = (o) => (o.tabela === "salespeople" && o.op === "upsert" ? "connection reset" : null);
    const r = await rodar();
    expect(r.status).toBe(500);
    expect(de("salespeople", "delete")).toEqual([]);
  });

  it("apaga só quem saiu do ranking, e só DEPOIS do upsert dar certo", async () => {
    const r = await rodar();
    expect(r.status).toBe(200);
    expect(idx("salespeople", "upsert")).toBeGreaterThan(-1);
    expect(idx("salespeople", "delete")).toBeGreaterThan(idx("salespeople", "upsert"));
    expect(de("salespeople", "delete")[0].filtros).toEqual(['id=not.in.("v1","v2")']);
  });

  it("snapshot sem vendedor (dia 1º antes da primeira venda) não esvazia a tabela", async () => {
    erp.buildErpSnapshot.mockResolvedValue({ ...SNAP, salespeople: [] });
    expect((await rodar()).status).toBe(200);
    expect(de("salespeople", "delete")).toEqual([]);
  });
});

describe("/api/sync: erro do banco não é sucesso", () => {
  it.each([
    ["teams", "update"], ["revenue", "upsert"], ["products", "upsert"], ["products", "delete"],
  ])("%s.%s com erro → 500", async (tabela, op) => {
    db.falha = (o) => (o.tabela === tabela && o.op === op ? "falhou" : null);
    expect((await rodar()).status).toBe(500);
  });

  it("produtos: upsert antes da poda, e a poda só tira quem saiu do top", async () => {
    await rodar();
    expect(idx("products", "delete")).toBeGreaterThan(idx("products", "upsert"));
    expect(de("products", "delete")[0].filtros).toEqual(['id=not.in.("p1")']);
  });

  it("id com aspas ou vírgula não quebra o filtro da poda", async () => {
    erp.buildErpSnapshot.mockResolvedValue({
      ...SNAP, topProducts: [{ id: 'Kit "A", 2', name: "Kit", imageUrl: null, qty: 1, revenue: 1 }],
    });
    await rodar();
    expect(de("products", "delete")[0].filtros).toEqual(['id=not.in.("Kit \\"A\\", 2")']);
  });

  it("equipes: só o `current` (a meta da equipe é do gestor)", async () => {
    await rodar();
    const eqs = de("teams", "update");
    expect(eqs.map((o) => o.corpo)).toEqual([{ current: 30 }, { current: 3 }]);
    expect(eqs.map((o) => o.filtros)).toEqual([["id=eq.comercial"], ["id=eq.marketing"]]);
  });
});
