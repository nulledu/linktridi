import { NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { normalizarPedido, salvarPedido } from "@/lib/marketplaces";

export const dynamic = "force-dynamic";

// POST /api/marketplaces/sync — puxa os pedidos recentes das contas conectadas
// (backfill / caso um webhook tenha sido perdido). ML implementado via Bearer.
export async function POST() {
  // Mesmo portão da seção que dispara o sync (Configurações → Marketplaces).
  if (!(await getProfileForModule("administracao:marketplaces"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createSupabaseAdminClient();
  let contas: { id: string; provider: string; external_shop_id: string | null; access_token: string | null }[] = [];
  try { contas = (await db.from("marketplace_contas").select("id,provider,external_shop_id,access_token").eq("status", "conectado")).data ?? []; } catch { /* sem tabela */ }

  let importados = 0;
  for (const c of contas) {
    if (c.provider === "mercado_livre" && c.access_token && c.external_shop_id) {
      const desde = new Date(Date.now() - 7 * 864e5).toISOString();
      const url = `https://api.mercadolibre.com/orders/search?seller=${c.external_shop_id}&order.date_created.from=${desde}&sort=date_desc`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${c.access_token}` } });
      if (r.ok) {
        const d = await r.json();
        for (const o of (d.results || []) as Record<string, unknown>[]) {
          const norm = normalizarPedido("mercado_livre", o);
          if (norm?.external_id) { await salvarPedido("mercado_livre", c.id, norm, o); importados++; }
        }
      }
    }
    // Shopee/TikTok: get_order_list + get_order_detail com assinatura — completar
    // quando as credenciais estiverem ativas (ver docs/marketplaces.md).
  }
  return NextResponse.json({ ok: true, contas: contas.length, importados });
}
