import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

// To-do list pessoal — sempre escopada ao usuário logado.
export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createSupabaseAdminClient();
  const SEL = "id,texto,feito,ordem,data,prioridade,pedido_ref,solicitacao_id";
  let { data, error } = await db.from("todos").select(SEL)
    .eq("user_id", me.id)
    .order("feito", { ascending: true }).order("created_at", { ascending: false });
  // Fallback: se as colunas novas ainda não existem no banco, lê o básico.
  if (error) { const r = await db.from("todos").select("id,texto,feito,ordem").eq("user_id", me.id).order("feito", { ascending: true }); data = r.data; }
  return NextResponse.json({ todos: data ?? [] });
}

export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const texto = String(b.texto || "").trim();
  if (!texto) return NextResponse.json({ error: "missing_texto" }, { status: 400 });
  const db = createSupabaseAdminClient();
  const row: Record<string, unknown> = { user_id: me.id, texto };
  if (b.data) row.data = String(b.data);
  if (b.prioridade) row.prioridade = String(b.prioridade);
  if (b.pedido_ref) row.pedido_ref = String(b.pedido_ref).trim();
  if (b.solicitacao_id) row.solicitacao_id = String(b.solicitacao_id);
  const SEL = "id,texto,feito,ordem,data,prioridade,pedido_ref,solicitacao_id";
  let { data, error } = await db.from("todos").insert(row).select(SEL).single();
  if (error) { const r = await db.from("todos").insert({ user_id: me.id, texto }).select("id,texto,feito,ordem").single(); data = r.data; error = r.error; }
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ todo: data });
}

export async function PATCH(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.feito !== undefined) patch.feito = !!b.feito;
  if (b.texto !== undefined) patch.texto = String(b.texto).trim();
  if (b.ordem !== undefined) patch.ordem = Number(b.ordem) || 0;
  if (b.data !== undefined) patch.data = b.data ? String(b.data) : null;
  if (b.prioridade !== undefined) patch.prioridade = b.prioridade ? String(b.prioridade) : null;
  if (b.pedido_ref !== undefined) patch.pedido_ref = b.pedido_ref ? String(b.pedido_ref).trim() : null;
  if (b.solicitacao_id !== undefined) patch.solicitacao_id = b.solicitacao_id ? String(b.solicitacao_id) : null;
  const db = createSupabaseAdminClient();
  // .eq user_id garante que só edita o que é seu.
  const { error } = await db.from("todos").update(patch).eq("id", id).eq("user_id", me.id);
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const db = createSupabaseAdminClient();
  await db.from("todos").delete().eq("id", id).eq("user_id", me.id);
  return NextResponse.json({ ok: true });
}
