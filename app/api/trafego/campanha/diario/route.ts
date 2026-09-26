import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { serieCampanha, type DiaCampanha } from "@/lib/meta-warehouse";
import { listAccounts } from "@/lib/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const GRAPH = "https://graph.facebook.com/v21.0";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
// Compra/lead: 1º tipo por PRIORIDADE (omni já engloba o pixel; somar duplicaria).
const PURCH = ["omni_purchase", "offsite_conversion.fb_pixel_purchase", "purchase"];
const LEADS = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];
const LPV = ["landing_page_view", "omni_landing_page_view"];
const ADDCART = ["omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"];
const CHECKOUT = ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"];
type ActionArr = Array<{ action_type: string; value: string }> | undefined;
const pick = (arr: ActionArr, tipos: string[]): number => {
  if (!arr) return 0;
  for (const t of tipos) { const x = arr.find((a) => a.action_type === t); if (x) return parseFloat(x.value) || 0; }
  return 0;
};

// Fallback pelo Graph quando o warehouse ainda não tem a campanha no período.
// level=campaign + time_increment=1 filtrando pela campanha (filtering campaign.id).
async function viaGraph(campaignId: string, accountId: string, since: string, until: string): Promise<DiaCampanha[] | null> {
  try {
    const contas = await listAccounts();
    const conta = contas.find((c) => String(c.account_id).replace(/^act_/, "") === accountId.replace(/^act_/, ""));
    if (!conta) return null;
    const tr = encodeURIComponent(JSON.stringify({ since, until }));
    const filtering = encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "IN", value: [campaignId] }]));
    const url = `${GRAPH}/act_${conta.account_id}/insights?level=campaign&fields=campaign_id,spend,impressions,clicks,actions,action_values&time_range=${tr}&time_increment=1&filtering=${filtering}&limit=500&access_token=${conta.token}`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const j = (await res.json()) as { data?: Array<Record<string, unknown>>; error?: unknown };
    if (j.error || !j.data?.length) return null;
    const porDia = new Map<string, DiaCampanha>();
    for (const r of j.data) {
      const day = String(r.date_start || ""); if (!day) continue;
      const acts = r.actions as ActionArr, vals = r.action_values as ActionArr;
      const e = porDia.get(day) || { day, spend: 0, revenue: 0, purchases: 0, clicks: 0, impressions: 0, leads: 0, lpv: 0, addCart: 0, checkout: 0 };
      e.spend += parseFloat((r.spend as string) || "0") || 0;
      e.impressions += parseFloat((r.impressions as string) || "0") || 0;
      e.clicks += parseFloat((r.clicks as string) || "0") || 0;
      e.revenue += pick(vals, PURCH); e.purchases += pick(acts, PURCH); e.leads += pick(acts, LEADS);
      e.lpv += pick(acts, LPV); e.addCart += pick(acts, ADDCART); e.checkout += pick(acts, CHECKOUT);
      porDia.set(day, e);
    }
    return [...porDia.values()].sort((a, b) => a.day.localeCompare(b.day));
  } catch { return null; }
}

// GET /api/trafego/campanha/diario?id=<campaign_id>&accountId=<id>&from&to
// Série DIÁRIA de UMA campanha — banco primeiro, Graph como fallback. É o
// "dia a dia" do drill-down: independe do período global da tela.
export async function GET(req: NextRequest) {
  if (!(await getProfileForModule("trafego"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const id = (sp.get("id") || "").trim();
  const accountId = (sp.get("accountId") || "").trim();
  const from = (sp.get("from") || "").trim(), to = (sp.get("to") || "").trim();
  if (!id || !ISO.test(from) || !ISO.test(to) || from > to) {
    return NextResponse.json({ error: "params_invalidos" }, { status: 400 });
  }

  let dias = await serieCampanha(id, from, to);
  let fonte: "banco" | "meta" = "banco";
  if ((!dias || !dias.length) && accountId) {
    dias = await viaGraph(id, accountId, from, to);
    fonte = "meta";
  }
  if (!dias) return NextResponse.json({ dias: [], fonte: "banco" }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ dias, fonte }, { headers: { "Cache-Control": "no-store" } });
}
