import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { TIPOS_CHAMADO } from "@/lib/central";

export const dynamic = "force-dynamic";

const PODE_RESOLVER = ["admin", "gerente_producao", "gerente_vendas", "estoquista"];

// GET → meus chamados (ou todos, se PODE_RESOLVER).
export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createSupabaseAdminClient();
  const pode = PODE_RESOLVER.includes(me.role);
  // Colunas nomeadas + janela: a tabela só cresce e era lida inteira a cada
  // abertura da tela.
  let q = db.from("central_chamados")
    .select("id,autor_id,autor_nome,tipo,titulo,descricao,pergunta_origem,status,resolvido_por,resolvido_em,created_at")
    .order("created_at", { ascending: false }).limit(300);
  if (!pode) q = q.eq("autor_id", me.id);
  const { data } = await q;
  return NextResponse.json({ chamados: data ?? [], podeResolver: pode });
}

// POST → abre chamado. Body: { tipo, titulo, descricao?, pergunta_origem? }.
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const titulo = String(b.titulo || "").trim();
  if (!titulo) return NextResponse.json({ error: "missing_titulo" }, { status: 400 });
  const tipo = TIPOS_CHAMADO.includes(String(b.tipo) as never) ? String(b.tipo) : "Dúvida";
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("central_chamados").insert({
    autor_id: me.id, autor_nome: me.name ?? null, tipo, titulo,
    descricao: b.descricao ? String(b.descricao).trim() : null,
    pergunta_origem: b.pergunta_origem ? String(b.pergunta_origem).trim() : null,
    status: "aberto",
  }).select().single();
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ chamado: data });
}

// PATCH → fechar/reabrir. Body: { id, status }. Só PODE_RESOLVER.
export async function PATCH(req: NextRequest) {
  const me = await getProfile();
  if (!me || !PODE_RESOLVER.includes(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: { id?: string; status?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const id = String(b.id || "");
  const status = String(b.status || "");
  if (!id || !["aberto", "fechado"].includes(status)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const db = createSupabaseAdminClient();
  const { error } = await db.from("central_chamados").update({
    status, resolvido_por: status === "fechado" ? me.id : null, resolvido_em: status === "fechado" ? new Date().toISOString() : null,
  }).eq("id", id);
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
