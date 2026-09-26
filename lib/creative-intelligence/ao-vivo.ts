// ── O criativo aberto, direto da Meta ────────────────────────────────────────
//
// O painel do criativo lia tudo do armazém (`meta_ad_insights_daily`), e o
// armazém tem buraco: dia que o sync não trouxe, anúncio que não entrou, e
// linha antiga gravada antes das colunas de engajamento. Medido em 06–12/09/26:
// só 122 de 728 linhas com curtidas/comentários, e o armazém inteiro com 1/3
// das compras da Meta. Resultado na tela: traço em curtidas, comentários,
// compartilhamentos, hook rate e hold rate.
//
// Aqui o criativo ABERTO vem ao vivo do Graph (level=ad, filtrado pelos ids
// dele, dia a dia). São poucas linhas, uma consulta por conta. O armazém fica
// só pra comparação com os outros criativos. As linhas saem no MESMO formato
// das do banco, e a extração de vídeo/engajamento é a mesma do sync.

import { listAccounts } from "@/lib/meta";
import { INSIGHT_FIELDS, VIDEO_INSIGHT_FIELDS } from "@/lib/meta-ads";
import { extractEngagementMetrics, extractVideoMetrics, pickMetaAction } from "./meta-fields";

const GRAPH = "https://graph.facebook.com/v21.0";
const PURCH = ["omni_purchase", "offsite_conversion.fb_pixel_purchase", "purchase"];
const LPV = ["landing_page_view", "omni_landing_page_view"];
const CHECKOUT = ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"];

/** 1º tipo por prioridade — somar duplicaria (omni_purchase já engloba o pixel). */
function primeiro(acoes: unknown, tipos: string[]): number {
  for (const t of tipos) { const v = pickMetaAction(acoes, t); if (v != null) return v; }
  return 0;
}

/** Uma linha do insights da Meta no formato de `meta_ad_insights_daily`. */
export function linhaDoGraph(contaId: string, r: Record<string, unknown>): Record<string, unknown> {
  const n = (k: string) => Number(r[k] ?? 0) || 0;
  const video = extractVideoMetrics(r);
  const eng = extractEngagementMetrics(r);
  return {
    ad_account_id: contaId,
    date: String(r.date_start ?? "").slice(0, 10),
    ad_id: String(r.ad_id ?? ""),
    ad_name: String(r.ad_name ?? ""),
    spend: n("spend"), impressions: n("impressions"), clicks: n("clicks"),
    purchases_meta: primeiro(r.actions, PURCH),
    purchase_value_meta: primeiro(r.action_values, PURCH),
    lpv: primeiro(r.actions, LPV),
    initiate_checkout: primeiro(r.actions, CHECKOUT),
    funnel_metrics_collected: true,
    video_metrics_collected: video.videoMetricsCollected,
    video_plays: video.videoPlays,
    video_views_3s: video.videoViews3s,
    video_views_2s: video.videoViews2s,
    video_views_25: video.videoViews25,
    video_views_50: video.videoViews50,
    video_views_75: video.videoViews75,
    video_views_95: video.videoViews95,
    video_views_100: video.videoViews100,
    video_avg_watch_time: video.videoAvgWatchTime,
    video_thruplays: video.thruPlays,
    // Veio da API: tipo ausente em `actions` é zero, não "sem dado".
    engagement_metrics_collected: true,
    post_reactions: eng.reactions,
    post_comments: eng.comments,
    post_shares: eng.shares,
  };
}

/**
 * Linhas diárias dos anúncios `adIds` no período, da Meta. `contas` é a dica de
 * onde eles moram (do armazém); sem dica, pergunta a todas as contas. `null`
 * quando não deu pra confiar na resposta — o chamador fica com o armazém.
 */
export async function linhasAoVivo(input: { since: string; until: string; adIds: string[]; contas?: string[] }): Promise<Record<string, unknown>[] | null> {
  if (!input.adIds.length) return null;
  try {
    const todas = await listAccounts();
    const dica = new Set((input.contas ?? []).map((c) => c.replace(/^act_/, "")));
    const alvo = dica.size ? todas.filter((a) => dica.has(String(a.account_id))) : todas;
    if (!alvo.length) return null;

    const tr = encodeURIComponent(JSON.stringify({ since: input.since, until: input.until }));
    const filtro = encodeURIComponent(JSON.stringify([{ field: "ad.id", operator: "IN", value: input.adIds }]));
    const campos = `ad_id,ad_name,date_start,${INSIGHT_FIELDS},${VIDEO_INSIGHT_FIELDS}`;
    let falhou = false;

    const porConta = await Promise.all(alvo.map(async (a) => {
      const linhas: Record<string, unknown>[] = [];
      let url: string | undefined = `${GRAPH}/act_${a.account_id}/insights?level=ad&fields=${campos}&time_range=${tr}&time_increment=1&filtering=${filtro}&limit=500&access_token=${a.token}`;
      for (let i = 0; url && i < 20; i++) {
        const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
        const j = (await res.json()) as { data?: Record<string, unknown>[]; paging?: { next?: string }; error?: unknown };
        // Na conta indicada, erro = resposta incompleta. Varrendo todas, conta
        // sem permissão só não é a dona do anúncio.
        if (j.error) { if (dica.size) falhou = true; return []; }
        linhas.push(...(j.data ?? []));
        url = j.paging?.next;
      }
      return linhas.map((r) => linhaDoGraph(String(a.account_id), r));
    }));
    if (falhou) return null;
    const rows = porConta.flat().filter((r) => r.ad_id && r.date);
    return rows.length ? rows : null;
  } catch { return null; }
}
