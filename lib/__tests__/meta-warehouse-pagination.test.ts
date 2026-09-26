import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = Array.from({ length: 1_501 }, (_, index) => ({
  ad_account_id: "acc-1",
  date: "2026-09-08",
  campaign_id: "camp-1",
  campaign_name: "Campanha",
  adset_id: "set-1",
  adset_name: "Conjunto",
  ad_id: `ad-${String(index).padStart(4, "0")}`,
  ad_name: `Criativo ${index}`,
  spend: 1,
  impressions: 100,
  clicks: 2,
  reach: 80,
  purchases_meta: index === 1_500 ? 7 : 0,
  purchase_value_meta: index === 1_500 ? 700 : 0,
  leads_meta: 0,
  lpv: 1,
  add_to_cart: 0,
  initiate_checkout: 0,
}));

const ranges: Array<[number, number]> = [];

function query() {
  let from = 0;
  let to = 999;
  const builder = {
    select: () => builder,
    gte: () => builder,
    lte: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    range: (start: number, end: number) => { from = start; to = end; ranges.push([start, end]); return builder; },
    then: (resolve: (value: { data: typeof rows; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: rows.slice(from, Math.min(to + 1, from + 1_000)) as typeof rows, error: null })),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({ from: () => query() }),
}));

import { arvoreLocal } from "../meta-warehouse";

describe("arvoreLocal", () => {
  beforeEach(() => { ranges.length = 0; });

  it("percorre todas as páginas do banco para não perder anúncios e compras", async () => {
    const arvore = await arvoreLocal("2026-09-08", "2026-09-08");

    expect(arvore?.anuncios).toHaveLength(1_501);
    expect(arvore?.anuncios.find((ad) => ad.id === "ad-1500")).toMatchObject({ purchases: 7, revenue: 700 });
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });
});
