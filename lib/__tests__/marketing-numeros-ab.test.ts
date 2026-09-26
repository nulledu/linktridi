import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// PostgREST de mentira com `max-rows = 1000`: `.limit(50000)` não sobe o teto,
// e `{ error }` volta no objeto — o supabase-js não lança.
const banco = vi.hoisted(() => ({
  tabelas: {} as Record<string, Array<Record<string, unknown>>>,
  erros: {} as Record<string, { message: string; code?: string }>,
}));

vi.mock("@/lib/supabase/server", () => {
  const consulta = (tabela: string) => {
    const filtros: Array<(r: Record<string, unknown>) => boolean> = [];
    let range: [number, number] | null = null;
    let limite: number | null = null;
    const resposta = () => {
      const erro = banco.erros[tabela];
      if (erro) return { data: null, error: erro };
      const todas = (banco.tabelas[tabela] ?? []).filter((r) => filtros.every((f) => f(r)));
      const de = range?.[0] ?? 0;
      const ate = range?.[1] ?? (limite ?? Number.MAX_SAFE_INTEGER) - 1;
      return { data: todas.slice(de, Math.min(ate + 1, de + 1000)), error: null };
    };
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { filtros.push((r) => r[c] === v); return q; },
      order: () => q,
      limit: (n: number) => { limite = n; return q; },
      range: (de: number, ate: number) => { range = [de, ate]; return q; },
      maybeSingle: async () => { const r = resposta(); return { data: r.data?.[0] ?? null, error: r.error }; },
      then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve(resposta()).then(ok, falha),
    };
    return q;
  };
  return { createSupabaseAdminClient: () => ({ from: (t: string) => consulta(t) }) };
});

import { abTag, resultados } from "../trafego-ab";

const ID = "0f0e0d0c-0b0a-4990-8877-665544332211";
const TESTE = {
  id: ID, nome: "Oferta", slug: "oferta", ativo: true, created_at: "2026-09-01T00:00:00Z",
  variantes: [{ id: "a", nome: "A", url: "https://a.example", peso: 1 }, { id: "b", nome: "B", url: "https://b.example", peso: 1 }],
};

// ERP legado: também corta em 1000 por resposta, qualquer que seja o Range pedido.
let pedidos: Array<{ tag_utm: string }> = [];
function erpComTeto() {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const faixa = String((init?.headers as Record<string, string> | undefined)?.Range ?? "0-999");
    const [de, ate] = faixa.split("-").map(Number);
    return new Response(JSON.stringify(pedidos.slice(de, Math.min(ate + 1, de + 1000))), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }));
}

describe("resultados do teste A/B", () => {
  beforeEach(() => {
    banco.erros = {};
    // Os 1.500 cliques da A chegaram antes; os 600 da B vêm depois — sem
    // página, a B inteira ficava fora e o "vencedor" era decidido no escuro.
    banco.tabelas = {
      trafego_ab_testes: [TESTE],
      trafego_ab_visitas: [
        ...Array.from({ length: 1_500 }, (_, i) => ({ id: `v${i}`, teste_id: ID, variante_id: "a", visitante: `pa${i % 700}`, device: i % 3 ? "mobile" : "desktop" })),
        ...Array.from({ length: 600 }, (_, i) => ({ id: `w${i}`, teste_id: ID, variante_id: "b", visitante: `pb${i}`, device: "mobile" })),
      ],
      trafego_ab_conversoes: [
        ...Array.from({ length: 1_100 }, (_, i) => ({ id: `c${i}`, teste_id: ID, variante_id: "a", valor: 10 })),
        ...Array.from({ length: 50 }, (_, i) => ({ id: `d${i}`, teste_id: ID, variante_id: "b", valor: 100 })),
      ],
    };
    pedidos = Array.from({ length: 1_200 }, () => ({ tag_utm: abTag("oferta", "b") }));
    erpComTeto();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("conta todos os cliques, conversões e vendas, não só os primeiros 1000", async () => {
    const r = await resultados(ID);
    expect(r?.total).toBe(2_100);
    expect(r?.variantes.find((v) => v.id === "a")).toMatchObject({
      cliques: 1_500, visitantes: 700, mobile: 1_000, desktop: 500, vendasManuais: 1_100, receitaManual: 11_000,
    });
    expect(r?.variantes.find((v) => v.id === "b")).toMatchObject({
      cliques: 600, visitantes: 600, mobile: 600, vendasManuais: 50, receitaManual: 5_000, vendasUtm: 1_200,
    });
  });

  it("erro do banco não vira zero clique", async () => {
    banco.erros.trafego_ab_visitas = { message: "canceling statement due to statement timeout", code: "57014" };
    await expect(resultados(ID)).rejects.toThrow();
  });

  it("tabela ausente continua avisando que falta o SQL", async () => {
    banco.erros.trafego_ab_visitas = { message: 'relation "public.trafego_ab_visitas" does not exist', code: "42P01" };
    expect(await resultados(ID)).toMatchObject({ total: 0, semTabela: true });
  });
});
