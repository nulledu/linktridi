import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { detalheTarefa, comentarTarefa } from "@/lib/tarefas";

export const dynamic = "force-dynamic";

// GET /api/tarefas/detalhe?id=.. — comentários + histórico (lazy, só ao abrir).
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  return NextResponse.json(await detalheTarefa(id));
}

// POST /api/tarefas/detalhe  { id, texto } — comenta.
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let b: { id?: string; texto?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!b.id || !b.texto?.trim()) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  const c = await comentarTarefa(b.id, { id: me.id, nome: me.name }, b.texto.trim());
  if (!c) return NextResponse.json({ error: "tabela_ausente" }, { status: 400 });
  return NextResponse.json({ ok: true, comentario: c });
}
