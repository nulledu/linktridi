import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { autoAtribuirRequisicao } from "@/lib/requisicoes";

export const dynamic = "force-dynamic";

// GET → pedidos do próprio colaborador (gestores veem todos com ?all=1).
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const all = req.nextUrl.searchParams.get("all") === "1";
  // Gestor de insumos: papel de sempre OU a área Estoque na grade — antes só o
  // papel, então quem recebeu a área via só os próprios pedidos.
  const gestor = me.role === "admin" || me.role === "gerente_producao" || me.role === "estoquista"
    || (await resolveMyModuleKeys({ id: me.id, role: me.role, username: me.username })).includes("estoque");
  const db = createSupabaseAdminClient();
  let q = db.from("pedidos_insumos").select("*").order("created_at", { ascending: false }).limit(200);
  if (!(all && gestor)) q = q.eq("colaborador_id", me.id);
  const { data } = await q;
  return NextResponse.json({ pedidos: data ?? [] });
}

// POST → cria um pedido de insumo.
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let b: { produto_nome?: string; quantidade?: number; observacao?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const produto = String(b.produto_nome || "").trim();
  if (!produto) return NextResponse.json({ error: "missing_produto" }, { status: 400 });
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("pedidos_insumos").insert({
    colaborador_id: me.id,
    colaborador_nome: me.name || me.username,
    produto_nome: produto,
    quantidade: Math.max(1, Math.round(Number(b.quantidade) || 1)),
    observacao: b.observacao ? String(b.observacao).trim() : null,
  }).select().single();
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });

  // Auto-atribuição: vira atividade pro especialista (cobre a diferença).
  let requisicao = null;
  try { requisicao = await autoAtribuirRequisicao(produto, Number(b.quantidade) || 1); } catch { /* segue mesmo assim */ }
  return NextResponse.json({ pedido: data, requisicao });
}

// DELETE ?id= → cancela o próprio pedido (ou gestor).
export async function DELETE(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const db = createSupabaseAdminClient();
  // Gestor de insumos: papel de sempre OU a área Estoque na grade — antes só o
  // papel, então quem recebeu a área via só os próprios pedidos.
  const gestor = me.role === "admin" || me.role === "gerente_producao" || me.role === "estoquista"
    || (await resolveMyModuleKeys({ id: me.id, role: me.role, username: me.username })).includes("estoque");
  let q = db.from("pedidos_insumos").update({ status: "cancelado", updated_at: new Date().toISOString() }).eq("id", id);
  if (!gestor) q = q.eq("colaborador_id", me.id);
  await q;
  return NextResponse.json({ ok: true });
}
