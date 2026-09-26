import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/trafego/snapshots — fotografias salvas (mais recentes primeiro).
export async function GET() {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("trafego_snapshots").select("id,label,periodo,kpis,autor_nome,created_at").order("created_at", { ascending: false }).limit(30);
  if (error) return NextResponse.json({ snapshots: [] });
  return NextResponse.json({ snapshots: data ?? [] });
}

// POST /api/trafego/snapshots  { label, periodo?, kpis } — salva uma fotografia.
export async function POST(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: { label?: string; periodo?: string; kpis?: Record<string, number | null> };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const label = (b.label || "").trim();
  if (!label) return NextResponse.json({ error: "label_obrigatorio" }, { status: 400 });
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("trafego_snapshots")
    .insert({ label: label.slice(0, 80), periodo: b.periodo ?? null, kpis: b.kpis ?? {}, autor_id: me.id, autor_nome: me.name ?? null })
    .select("id,label,periodo,kpis,autor_nome,created_at").single();
  if (error) return NextResponse.json({ error: error.message.includes("does not exist") || error.message.includes("find the") ? "tabela_ausente" : error.message }, { status: 400 });
  return NextResponse.json({ ok: true, snapshot: data });
}

// DELETE /api/trafego/snapshots?id=... — remove uma fotografia.
export async function DELETE(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const db = createSupabaseAdminClient();
  await db.from("trafego_snapshots").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
