import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { podeGerirMetas } from "@/lib/pode-gerir-metas";
import { metasComProgresso } from "@/lib/metas";
import { metricaByKey } from "@/lib/metas-catalog";
import { listErpUsers } from "@/lib/funcoes";

export const dynamic = "force-dynamic";

// Gerir metas: papel de gestão OU a área "Colaboradores" (é de dentro dela que
// a aba de Metas abre). Só o papel fazia a tela mostrar os controles pra quem
// tem a área e a API responder 403 em cada salvamento.
const canManage = podeGerirMetas;

export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const manage = await canManage(me.role, me.id, me.username);
  const [metas, colaboradores] = await Promise.all([
    metasComProgresso(),
    manage ? listErpUsers().catch(() => []) : Promise.resolve([]),
  ]);
  return NextResponse.json({ metas, canManage: manage, colaboradores });
}

export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canManage(me.role, me.id, me.username))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let b: { titulo?: string; metrica?: string; periodicidade?: string; alvo?: number; setor?: string; colaborador_id?: string; colaborador_nome?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const def = b.metrica ? metricaByKey(b.metrica) : undefined;
  if (!b.titulo || !def || !["diaria", "semanal", "mensal"].includes(b.periodicidade || "") || !b.alvo || b.alvo <= 0)
    return NextResponse.json({ error: "invalid_fields" }, { status: 400 });
  // meta individual exige métrica que suporte medição por pessoa
  const individual = !!b.colaborador_id;
  if (individual && !def.individual)
    return NextResponse.json({ error: "metrica_sem_individual" }, { status: 400 });

  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("metas").insert({
    titulo: b.titulo, metrica: b.metrica, periodicidade: b.periodicidade,
    alvo: Math.round(b.alvo), setor: b.setor || def.setor, ativo: true,
    colaborador_id: individual ? b.colaborador_id : null,
    colaborador_nome: individual ? (b.colaborador_nome || null) : null,
    por_nome: me.name || me.username,
  }).select().single();
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ meta: data });
}

export async function DELETE(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canManage(me.role, me.id, me.username))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const db = createSupabaseAdminClient();
  const { error } = await db.from("metas").update({ ativo: false }).eq("id", id);
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
