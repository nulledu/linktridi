import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { podeAtividades } from "@/lib/atividades-acesso";

export const dynamic = "force-dynamic";

// GET → tarefas personalizadas salvas (todas; o front filtra por setor).
export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createSupabaseAdminClient();
  const { data } = await db.from("atividades_catalogo").select("*").order("nome").limit(1000);
  return NextResponse.json({ itens: data ?? [] });
}

// Atividade criada do zero no pop-up "Criar atividade" fica salva nesta
// categoria pra ser escolhida de novo. Quem cria é quem ATRIBUI (a mesma chave
// do POST /api/atividades) — exigir "configurar" aqui faria a atividade sumir
// pra quem pode mandá-la mas não mexe no catálogo.
const DO_ZERO = "Do zero";

async function podeMexer(me: NonNullable<Awaited<ReturnType<typeof getProfile>>>, categoria: string | null | undefined) {
  if (await podeAtividades(me, "configurar")) return true;
  return categoria === DO_ZERO && podeAtividades(me, "atribuir");
}

// POST → salva uma tarefa personalizada como opção.
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let b: { setor?: string; categoria?: string; nome?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!(await podeMexer(me, (b.categoria || "").trim()))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const setor = String(b.setor || "").trim();
  const nome = String(b.nome || "").trim();
  if (!setor || !nome) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("atividades_catalogo")
    .upsert({ setor, categoria: (b.categoria || "Personalizadas").trim() || "Personalizadas", nome }, { onConflict: "setor,categoria,nome" })
    .select().single();
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

// DELETE ?id= → remove uma opção personalizada.
export async function DELETE(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const db = createSupabaseAdminClient();
  const { data: linha } = await db.from("atividades_catalogo").select("categoria").eq("id", id).maybeSingle();
  if (!(await podeMexer(me, linha?.categoria))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await db.from("atividades_catalogo").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
