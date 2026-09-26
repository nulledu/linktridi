import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { buildCreativeIntelligenceFromRows, type CreativeWarehouseRow } from "@/lib/creative-intelligence/server";
import { readSupabasePages } from "@/lib/supabase-pages";
import { linhasAoVivo } from "@/lib/creative-intelligence/ao-vivo";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const LIMIT = 50_000;
const CURRENT_LIMIT = 5_000;
const CORE = "ad_account_id,date,ad_id,ad_name,spend,impressions,clicks,purchases_meta,purchase_value_meta";
const FUNNEL = "lpv,initiate_checkout,funnel_metrics_collected";
const VIDEO = "video_metrics_collected,video_plays,video_views_3s,video_views_2s,video_views_25,video_views_50,video_views_75,video_views_95,video_views_100,video_avg_watch_time,video_thruplays";
const ENGAGEMENT = "engagement_metrics_collected,post_reactions,post_comments,post_shares";

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapRow(row: Record<string, unknown>, legacy: boolean): CreativeWarehouseRow {
  const number = (key: string) => numberOrNull(row[key]) ?? 0;
  return {
    date: String(row.date ?? "").slice(0, 10),
    adId: String(row.ad_id ?? ""),
    adName: String(row.ad_name ?? ""),
    spend: number("spend"),
    impressions: number("impressions"),
    clicks: number("clicks"),
    purchases: number("purchases_meta"),
    revenue: number("purchase_value_meta"),
    landingPageViews: numberOrNull(row.lpv),
    initiateCheckout: numberOrNull(row.initiate_checkout),
    funnelMetricsCollected: !legacy && row.funnel_metrics_collected === true,
    videoMetricsCollected: !legacy && row.video_metrics_collected === true,
    videoPlays: numberOrNull(row.video_plays),
    videoViews3s: numberOrNull(row.video_views_3s),
    videoViews2s: numberOrNull(row.video_views_2s),
    videoViews25: numberOrNull(row.video_views_25),
    videoViews50: numberOrNull(row.video_views_50),
    videoViews75: numberOrNull(row.video_views_75),
    videoViews95: numberOrNull(row.video_views_95),
    videoViews100: numberOrNull(row.video_views_100),
    videoAvgWatchTime: numberOrNull(row.video_avg_watch_time),
    thruPlays: numberOrNull(row.video_thruplays),
    engagementMetricsCollected: !legacy && row.engagement_metrics_collected === true,
    reactions: numberOrNull(row.post_reactions),
    comments: numberOrNull(row.post_comments),
    shares: numberOrNull(row.post_shares),
  };
}

async function readWarehouseRows(db: ReturnType<typeof createSupabaseAdminClient>, input: {
  since: string;
  until: string;
  adIds?: string[];
  accountIds?: string[];
  limit: number;
}) {
  const query = (columns: string) => {
    return readSupabasePages<Record<string, unknown>>((from, to) => {
      let builder = db.from("meta_ad_insights_daily").select(columns)
        .gte("date", input.since).lte("date", input.until)
        .order("date", { ascending: true })
        .order("ad_account_id", { ascending: true })
        .order("ad_id", { ascending: true });
      if (input.adIds?.length) builder = builder.in("ad_id", input.adIds);
      if (input.accountIds?.length) builder = builder.in("ad_account_id", input.accountIds);
      return builder.range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
    }, input.limit);
  };

  let legacy = false;
  let { data, error, truncated } = await query(`${CORE},${FUNNEL},${VIDEO},${ENGAGEMENT}`);
  if (error && /column|schema cache/i.test(error.message)) {
    // Sem as colunas de engajamento (SQL novo não rodado): não é legado — o
    // resto do retrato vale inteiro; só curtidas/comentários ficam em "–".
    ({ data, error, truncated } = await query(`${CORE},${FUNNEL},${VIDEO}`));
  }
  if (error && /column|schema cache/i.test(error.message)) {
    legacy = true;
    ({ data, error, truncated } = await query(`${CORE},lpv,initiate_checkout`));
  }
  if (error && /column|schema cache/i.test(error.message)) {
    ({ data, error, truncated } = await query(CORE));
  }
  return { data, error, legacy, truncated };
}

export async function GET(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const key = (params.get("key") ?? "").trim().slice(0, 500);
  const since = params.get("since") ?? "";
  const until = params.get("until") ?? "";
  const adIds = [...new Set((params.get("ads") ?? "").split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 50);
  if (!key || !ISO.test(since) || !ISO.test(until) || since > until || !adIds.length) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  const db = createSupabaseAdminClient();
  // Tags de todos os pares: o PostgREST corta em 1000 por resposta.
  const marksPromise = readSupabasePages<Record<string, unknown>>(
    (de, ate) => db.from("trafego_criativo_marcas").select("chave,tags").order("chave").range(de, ate) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>,
    20_000,
  );
  const currentResult = await readWarehouseRows(db, { since, until, adIds, limit: CURRENT_LIMIT });
  if (currentResult.error) return NextResponse.json({ error: "warehouse_unavailable", detail: currentResult.error.message }, { status: 503 });
  // O criativo aberto vem da Meta ao vivo: o armazém tem dia/anúncio faltando e
  // linha sem engajamento, e era isso que virava traço em curtidas, hook e hold.
  // Falhou a Meta → fica o armazém. Ver lib/creative-intelligence/ao-vivo.ts.
  const aoVivo = await linhasAoVivo({
    since, until, adIds,
    contas: [...new Set(currentResult.data.map((row) => String(row.ad_account_id ?? "")).filter(Boolean))],
  });
  if (aoVivo) { currentResult.data = aoVivo; currentResult.truncated = false; }
  const accountIds = [...new Set(currentResult.data.map((row) => String(row.ad_account_id ?? "")).filter(Boolean))];
  const peersResult = accountIds.length
    ? await readWarehouseRows(db, { since, until, accountIds, limit: LIMIT })
    : currentResult;
  if (peersResult.error) return NextResponse.json({ error: "warehouse_unavailable", detail: peersResult.error.message }, { status: 503 });

  // A leitura ampla pode chegar ao teto. As linhas do criativo atual vêm da
  // consulta dedicada e substituem qualquer cópia parcial para ele nunca sumir ao
  // aumentar o período.
  const currentIdSet = new Set(adIds);
  const data = [
    ...currentResult.data,
    ...peersResult.data.filter((row) => !currentIdSet.has(String(row.ad_id ?? ""))),
  ];
  const legacy = currentResult.legacy || peersResult.legacy;

  const marksResult = await marksPromise;
  const marks = new Map<string, string[]>();
  for (const mark of (marksResult.data ?? []) as Array<Record<string, unknown>>) {
    const tags = Array.isArray(mark.tags) ? mark.tags.map(String).filter(Boolean) : [];
    marks.set(String(mark.chave), tags);
  }
  const rows = data
    .map((row) => mapRow(row, legacy))
    .filter((row) => row.adId && row.adName && row.date);
  const payload = buildCreativeIntelligenceFromRows({
    currentKey: key,
    currentAdIds: adIds,
    period: { since, until },
    rows,
    marks,
    partial: legacy || currentResult.truncated || peersResult.truncated,
  });
  return NextResponse.json(payload, { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } });
}
