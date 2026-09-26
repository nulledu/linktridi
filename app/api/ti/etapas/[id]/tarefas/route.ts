import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { gateTi, ehResposta } from "@/lib/ti-gate";
import { registrarHistorico } from "@/lib/ti";

export const dynamic = "force-dynamic";

// POST /api/ti/etapas/[id]/tarefas — { tarefaId, acao: "vincular" | "desvincular" }.
// Usa a tabela `tarefas` da Central — nenhuma segunda base de tarefas. ti:editar.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gateTi("editar");
  if (ehResposta(g)) return g;
  const { id } = await params;
  let b: { tarefaId?: string; acao?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!b.tarefaId) return NextResponse.json({ error: "tarefa_obrigatoria" }, { status: 400 });

  const db = createSupabaseAdminClient();
  const { data: etapa } = await db.from("ti_roadmap_etapas").select("roadmap_id,titulo").eq("id", id).maybeSingle();
  if (!etapa) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (b.acao === "desvincular") {
    const { error } = await db.from("ti_etapa_tarefas").delete().eq("etapa_id", id).eq("tarefa_id", b.tarefaId);
    if (error) return NextResponse.json({ error: "erro_desvincular", detalhe: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  // Confere que a tarefa existe antes de gravar o vínculo (sem FK de propósito).
  const { data: t } = await db.from("tarefas").select("id,titulo").eq("id", b.tarefaId).maybeSingle();
  if (!t) return NextResponse.json({ error: "tarefa_inexistente" }, { status: 404 });
  const { error } = await db.from("ti_etapa_tarefas").upsert({ etapa_id: id, tarefa_id: b.tarefaId }, { onConflict: "etapa_id,tarefa_id" });
  if (error) return NextResponse.json({ error: "erro_vincular", detalhe: error.message }, { status: 500 });
  void registrarHistorico(etapa.roadmap_id as string, g.me.name, "tarefa_vinculada", `${t.titulo} → ${etapa.titulo}`);
  return NextResponse.json({ ok: true });
}

// GET /api/ti/etapas/[id]/tarefas?q= — busca tarefas da Central pra vincular. ti:editar.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gateTi("editar");
  if (ehResposta(g)) return g;
  await params; // a busca é global — a etapa só ancora a rota
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const db = createSupabaseAdminClient();
  let sel = db.from("tarefas").select("id,titulo,status,prazo,responsavel_nome").order("created_at", { ascending: false }).limit(30);
  if (q) sel = sel.ilike("titulo", `%${q}%`);
  const { data } = await sel;
  return NextResponse.json({
    tarefas: ((data ?? []) as { id: string; titulo: string; status: string; prazo: string | null; responsavel_nome: string | null }[]).map((t) => ({
      id: t.id, titulo: t.titulo, status: t.status, prazo: t.prazo, responsavelNome: t.responsavel_nome,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
