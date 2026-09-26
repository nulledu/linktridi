import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hojeISO } from "@/lib/financeiro/calculos";

/**
 * "Hoje" da venda é o dia de São Paulo, não o da UTC.
 *
 * A Vercel roda em UTC. `new Date().toISOString().slice(0, 10)` às 22h30 de
 * 30/09 em São Paulo já devolve 01/10 — e a venda lançada na última noite do
 * mês entrava no total e na comissão do mês seguinte. O formulário do
 * navegador pré-preenchia do mesmo jeito, então os dois concordavam no erro.
 */

const { inseridos, upserts } = vi.hoisted(() => ({
  inseridos: [] as Record<string, unknown>[],
  upserts: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/require-auth", () => ({
  getProfile: async () => ({ id: "u1", role: "admin", name: "Ana", username: "ana" }),
}));
vi.mock("@/lib/acesso", () => ({ papelOuChave: async () => true }));
vi.mock("@/lib/comercial", () => ({
  listComercial: async () => [],
  marcarLeadVendido: async () => {},
  listMarketingDias: async () => [],
  upsertMarketingDia: async (d: Record<string, unknown>) => { upserts.push(d); },
}));
vi.mock("@/lib/comercial-pedidos", () => ({ donoDoPedido: async () => null, erpIdDoPerfil: async () => null }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inseridos.push(row);
        return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
      },
    }),
  }),
}));

const { POST: lancarPedido } = await import("../route");
const { POST: lancarMarketing } = await import("../marketing/route");

const pedido = <T extends (r: never) => unknown>(corpo: Record<string, unknown>) =>
  ({ json: async () => corpo }) as unknown as Parameters<T>[0];

// 22h30 do último dia do mês em São Paulo = 01h30 de 01/10 na UTC.
const NOITE_DO_DIA_30 = new Date("2026-09-30T22:30:00-03:00");

beforeEach(() => {
  inseridos.length = 0; upserts.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOITE_DO_DIA_30);
});
afterEach(() => vi.useRealTimers());

describe("comercial · data padrão da venda é o dia de São Paulo", () => {
  it("o próprio relógio do teste: na UTC já é 01/10", () => {
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(hojeISO()).toBe("2026-09-30");
  });

  it("pedido sem data_venda às 22h30 de 30/09 fica em 30/09", async () => {
    const r = await lancarPedido(pedido<typeof lancarPedido>({ cliente_nome: "Maria", fonte: "facebook" }));
    expect(r.status).toBe(200);
    expect(inseridos[0]?.data_venda).toBe("2026-09-30");
  });

  it("data_venda informada continua valendo", async () => {
    await lancarPedido(pedido<typeof lancarPedido>({ cliente_nome: "Maria", fonte: "facebook", data_venda: "2026-09-15" }));
    expect(inseridos[0]?.data_venda).toBe("2026-09-15");
  });

  it("lançamento de marketing sem data às 22h30 de 30/09 fica em 30/09", async () => {
    const r = await lancarMarketing(pedido<typeof lancarMarketing>({ valor_usado: 100, leads: 3 }));
    expect(r.status).toBe(200);
    expect(upserts[0]?.data).toBe("2026-09-30");
  });

  it("o formulário pré-preenche com o dia de São Paulo, não com a UTC", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../../../(plataforma)/comercial/ComercialClient.tsx", import.meta.url)),
      "utf8",
    );
    expect(src).not.toMatch(/data_venda:\s*new Date\(\)\.toISOString\(\)/);
    expect(src).toMatch(/data_venda:\s*hojeISO\(\)/);
  });
});
