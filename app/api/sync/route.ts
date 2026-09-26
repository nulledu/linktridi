import { NextRequest, NextResponse } from "next/server";
import { buildErpSnapshot } from "@/lib/erp";
import { persistLogisticaSnapshot } from "@/lib/logistica";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Autoriza se: header bate com CRON_SECRET (cron da Vercel manda Bearer CRON_SECRET),
// nunca sem secret configurado (fail-closed).
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail-closed: sem CRON_SECRET ninguém passa
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Lista do filtro `in` do PostgREST com cada id entre aspas (vírgula e aspas
 *  dentro do id não quebram o filtro). */
function listaIn(ids: string[]): string {
  return `(${ids.map((id) => `"${String(id).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")})`;
}

// Persiste o snapshot do ERP no Supabase novo (overview do dashboard + fallback).
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const snap = await buildErpSnapshot();
    const db = createSupabaseAdminClient();

    // Toda escrita confere o `error`: o supabase-js não lança, e antes o cron
    // respondia `ok: true` por cima de uma tabela vazia.
    const conferir = (r: { error: { message: string } | null }, onde: string) => {
      if (r.error) throw new Error(`${onde}: ${r.error.message}`);
    };

    // Vendedores. As METAS (*_goal) são do gestor e NÃO entram no upsert — a
    // coluna que não vai no corpo fica como está. Antes lia as metas, apagava a
    // tabela e regravava: leitura falha = meta 0 pra todo mundo.
    const rows = snap.salespeople.map((s) => ({
      id: s.id,
      name: s.name,
      photo_url: s.photoUrl,
      team: s.team,
      daily_sales: s.sales.daily,
      weekly_sales: s.sales.weekly,
      monthly_sales: s.sales.monthly,
    }));
    // Snapshot sem vendedor (dia 1º antes da 1ª venda) não esvazia a tabela.
    // Com vendedor: upsert PRIMEIRO, e só se deu certo poda quem saiu do ranking.
    if (rows.length) {
      conferir(await db.from("salespeople").upsert(rows), "salespeople.upsert");
      conferir(await db.from("salespeople").delete().not("id", "in", listaIn(rows.map((r) => r.id))), "salespeople.delete");
    }

    // Equipes (só o current; a meta da equipe é do gestor).
    for (const t of snap.teams) {
      conferir(await db.from("teams").update({ current: t.current }).eq("id", t.id), `teams.update(${t.id})`);
    }

    // Faturamento.
    conferir(await db.from("revenue").upsert({
      id: 1,
      daily: snap.revenue.daily,
      weekly: snap.revenue.weekly,
      monthly: snap.revenue.monthly,
      trend_pct: snap.revenue.trendPct,
    }), "revenue.upsert");

    // Produtos: upsert antes, poda depois (só quem saiu do top).
    const prods = snap.topProducts.map((p) => ({
      id: p.id, name: p.name, image_url: p.imageUrl, qty: p.qty, revenue: p.revenue,
    }));
    if (prods.length) {
      conferir(await db.from("products").upsert(prods), "products.upsert");
      conferir(await db.from("products").delete().not("id", "in", listaIn(prods.map((p) => p.id))), "products.delete");
    }

    // Snapshot de logística p/ o Δ "antes → agora" (tolerante a falha).
    await persistLogisticaSnapshot();

    return NextResponse.json({
      ok: true,
      updatedAt: snap.updatedAt,
      salespeople: rows.length,
      revenueMonth: snap.revenue.monthly,
    });
  } catch (e) {
    return NextResponse.json({ error: "sync_failed", detail: String(e) }, { status: 500 });
  }
}
