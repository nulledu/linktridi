import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { gateTi, ehResposta } from "@/lib/ti-gate";
import { getRoadmap, listarHistorico, registrarHistorico, STATUS_ROADMAP, type RoadmapStatus } from "@/lib/ti";

export const dynamic = "force-dynamic";

// GET /api/ti/roadmaps/[id] — roadmap completo + histórico. ti:ver.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gateTi("ver");
  if (ehResposta(g)) return g;
  const { id } = await params;
  const [roadmap, historico] = await Promise.all([getRoadmap(id), listarHistorico(id)]);
  if (!roadmap) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ roadmap, historico }, { headers: { "Cache-Control": "no-store" } });
}

const CAMPOS = ["titulo", "descricao", "status", "inicio", "prazo", "responsavelId", "responsavelNome", "progressoManual"] as const;
const COLUNA: Record<string, string> = {
  titulo: "titulo", descricao: "descricao", status: "status", inicio: "inicio", prazo: "prazo",
  responsavelId: "responsavel_id", responsavelNome: "responsavel_nome", progressoManual: "progresso_manual",
};

// PATCH /api/ti/roadmaps/[id] — edita campos e registra o que mudou. ti:editar.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gateTi("editar");
  if (ehResposta(g)) return g;
  const { id } = await params;
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const c of CAMPOS) if (b[c] !== undefined) upd[COLUNA[c]] = b[c] === "" ? null : b[c];
  if (Object.keys(upd).length === 1) return NextResponse.json({ error: "nada_a_mudar" }, { status: 400 });
  const { error } = await createSupabaseAdminClient().from("ti_roadmaps").update(upd).eq("id", id);
  if (error) return NextResponse.json({ error: "erro_editar", detalhe: error.message }, { status: 500 });
  if (b.status !== undefined) void registrarHistorico(id, g.me.name, "status", STATUS_ROADMAP[b.status as RoadmapStatus] ?? String(b.status));
  else if (b.prazo !== undefined) void registrarHistorico(id, g.me.name, "prazo", String(b.prazo || "removido"));
  else if (b.responsavelNome !== undefined) void registrarHistorico(id, g.me.name, "responsavel", String(b.responsavelNome || "removido"));
  else void registrarHistorico(id, g.me.name, "editou", null);
  return NextResponse.json({ ok: true });
}

// DELETE /api/ti/roadmaps/[id] — apaga o roadmap (etapas em cascata). ti:excluir.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gateTi("excluir");
  if (ehResposta(g)) return g;
  const { id } = await params;
  const { error } = await createSupabaseAdminClient().from("ti_roadmaps").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "erro_excluir", detalhe: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
