import { beforeEach, describe, expect, it, vi } from "vitest";

// ── PostgREST de mentira, com o comportamento que derrubava os números ──────
// `max-rows = 1000`: nenhuma resposta passa de 1000 linhas, e `.limit(50_000)`
// NÃO sobe esse teto — sem `.range()` a resposta para em 1000, sem erro. Sem
// `.order()` a ordem é a do heap, e o que o sync reescreve toda hora (hoje)
// mora no FIM dele: é exatamente o que ficava de fora.
const banco = vi.hoisted(() => ({
  linhas: [] as Array<Record<string, unknown>>,
  leituras: [] as Array<{ range: [number, number] | null; ordem: string[] }>,
}));

vi.mock("@/lib/supabase/server", () => {
  const consulta = () => {
    const filtros: Array<(r: Record<string, unknown>) => boolean> = [];
    const ordem: string[] = [];
    let range: [number, number] | null = null;
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { filtros.push((r) => r[c] === v); return q; },
      gte: (c: string, v: string) => { filtros.push((r) => String(r[c]) >= v); return q; },
      lte: (c: string, v: string) => { filtros.push((r) => String(r[c]) <= v); return q; },
      in: (c: string, vs: unknown[]) => { filtros.push((r) => vs.includes(r[c])); return q; },
      order: (c: string) => { ordem.push(c); return q; },
      limit: () => q,
      range: (de: number, ate: number) => { range = [de, ate]; return q; },
      then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => {
        banco.leituras.push({ range, ordem: [...ordem] });
        const todas = banco.linhas.filter((r) => filtros.every((f) => f(r)));
        const de = range?.[0] ?? 0;
        const ate = range?.[1] ?? Number.MAX_SAFE_INTEGER;
        return Promise.resolve({ data: todas.slice(de, Math.min(ate + 1, de + 1000)), error: null }).then(ok, falha);
      },
    };
    return q;
  };
  return {
    createSupabaseAdminClient: () => ({
      from: () => consulta(),
      // Sem o SQL de agregação aplicado: força o caminho que lê linha a linha.
      rpc: async () => ({ data: null, error: { message: "function meta_totais_periodo does not exist" } }),
    }),
  };
});

import { porContaDoPeriodo, relatorioHierarquico, serieCampanha, serieDiariaLocal, totaisDoPeriodo } from "../meta-warehouse";

const ONTEM = "2026-09-09";
const HOJE = "2026-09-10";
const POR_DIA = 1_200;

function linha(dia: string, i: number) {
  return {
    ad_account_id: i % 2 ? "acc-2" : "acc-1",
    date: dia,
    campaign_id: "camp-1", campaign_name: "Campanha",
    adset_id: "set-1", adset_name: "Conjunto",
    ad_id: `ad-${String(i).padStart(5, "0")}`, ad_name: `Anúncio ${i}`,
    spend: 1, impressions: 100, clicks: 2, reach: 50,
    purchases_meta: 0, purchase_value_meta: 3, leads_meta: 0,
    lpv: 1, add_to_cart: 0, initiate_checkout: 0,
  };
}

// Toda leitura crua tem de ser paginada E ordenada: `.range()` sem `.order()`
// deixa o Postgres repetir linha numa página e pular noutra.
function leuEmPaginasOrdenadas() {
  expect(banco.leituras.length).toBeGreaterThan(1);
  for (const l of banco.leituras) {
    expect(l.range).not.toBeNull();
    expect(l.ordem.length).toBeGreaterThan(0);
  }
}

describe("armazém da Meta lido além das 1000 linhas do PostgREST", () => {
  beforeEach(() => {
    banco.leituras.length = 0;
    // Ontem primeiro, hoje no fim: é a ordem do heap depois do upsert do sync.
    banco.linhas = [
      ...Array.from({ length: POR_DIA }, (_, i) => linha(ONTEM, i)),
      ...Array.from({ length: POR_DIA }, (_, i) => linha(HOJE, i)),
    ];
  });

  it("série diária traz o dia de hoje inteiro (era o dia que sumia)", async () => {
    const serie = await serieDiariaLocal(ONTEM, HOJE);
    expect(serie?.map((d) => [d.day, d.spend, d.revenue])).toEqual([[ONTEM, 1_200, 3_600], [HOJE, 1_200, 3_600]]);
    leuEmPaginasOrdenadas();
  });

  it("gasto por conta soma todas as linhas", async () => {
    const contas = await porContaDoPeriodo(ONTEM, HOJE);
    expect(contas?.map((c) => [c.contaId, c.spend]).sort()).toEqual([["acc-1", 1_200], ["acc-2", 1_200]]);
    leuEmPaginasOrdenadas();
  });

  it("relatório hierárquico e totais batem com o banco", async () => {
    const arvore = await relatorioHierarquico(ONTEM, HOJE);
    expect(arvore?.[0]).toMatchObject({ id: "camp-1", spend: 2_400, revenue: 7_200 });
    expect(arvore?.[0].filhos?.[0].filhos).toHaveLength(POR_DIA);
    expect(await totaisDoPeriodo(ONTEM, HOJE)).toMatchObject({ spend: 2_400, linhas: 2_400, dias: 2 });
    leuEmPaginasOrdenadas();
  });

  it("dia a dia de uma campanha não perde o dia de hoje", async () => {
    const dias = await serieCampanha("camp-1", ONTEM, HOJE);
    expect(dias?.map((d) => [d.day, d.spend])).toEqual([[ONTEM, 1_200], [HOJE, 1_200]]);
    leuEmPaginasOrdenadas();
  });

  it("passou do teto: devolve null em vez de um total parcial", async () => {
    banco.linhas = Array.from({ length: 50_001 }, (_, i) => linha(HOJE, i));
    expect(await serieDiariaLocal(HOJE, HOJE)).toBeNull();
    expect(await totaisDoPeriodo(HOJE, HOJE)).toBeNull();
  });
});
