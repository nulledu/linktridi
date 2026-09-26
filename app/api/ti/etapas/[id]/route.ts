import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { gateTi, ehResposta } from "@/lib/ti-gate";
import { registrarHistorico, hojeSP, STATUS_ETAPA, type EtapaStatus } from "@/lib/ti";

export const dynamic = "force-dynamic";

const COLUNA: Record<string, string> = {
  titulo: "titulo", descricao: "descricao", status: "status", inicio: "inicio", prazo: "prazo",
  responsavelId: "responsavel_id", responsavelNome: "responsavel_nome",
  progressoManual: "progresso_manual", dependeDe: "depende_de", observacoes: "observacoes",
};

async function roadmapDa(etapaId: string): Promise<{ roadmapId: string; titulo: string } | null> {
  const { data } = await createSupabaseAdminClient().from("ti_roadmap_etapas")
    .select("roadmap_id,titulo").eq("id", etapaId).maybeSingle();
  return data ? { roadmapId: data.roadmap_id as string, titulo: (data.titulo as string) ?? "" } : null;
}

// PATCH /api/ti/etapas/[id] — edita a etapa. Concluir carimba `concluida_em`. ti:editar.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gateTi("editar");
  if (ehResposta(g)) return g;
  const { id } = await params;
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [campo, coluna] of Object.entries(COLUNA)) if (b[campo] !== undefined) upd[coluna] = b[campo] === "" ? null : b[campo];
  if (b.status !== undefined) upd.concluida_em = b.status === "concluida" ? hojeSP() : null;
  if (Object.keys(upd).length === 1) return NextResponse.json({ error: "nada_a_mudar" }, { status: 400 });

  const etapa = await roadmapDa(id);
  if (!etapa) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { error } = await createSupabaseAdminClient().from("ti_roadmap_etapas").update(upd).eq("id", id);
  if (error) return NextResponse.json({ error: "erro_editar", detalhe: error.message }, { status: 500 });
  if (b.status === "concluida") void registrarHistorico(etapa.roadmapId, g.me.name, "etapa_concluida", etapa.titulo);
  else if (b.status !== undefined) void registrarHistorico(etapa.roadmapId, g.me.name, "status", `${etapa.titulo}: ${STATUS_ETAPA[b.status as EtapaStatus] ?? b.status}`);
  else if (b.prazo !== undefined) void registrarHistorico(etapa.roadmapId, g.me.name, "prazo", `${etapa.titulo}: ${b.prazo || "removido"}`);
  else if (b.responsavelNome !== undefined) void registrarHistorico(etapa.roadmapId, g.me.name, "responsavel", `${etapa.titulo}: ${b.responsavelNome || "removido"}`);
  return NextResponse.json({ ok: true });
}

// DELETE /api/ti/etapas/[id] — apaga a etapa (vínculos em cascata). ti:excluir.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gateTi("excluir");
  if (ehResposta(g)) return g;
  const { id } = await params;
  const etapa = await roadmapDa(id);
  const { error } = await createSupabaseAdminClient().from("ti_roadmap_etapas").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "erro_excluir", detalhe: error.message }, { status: 500 });
  if (etapa) void registrarHistorico(etapa.roadmapId, g.me.name, "etapa_excluida", etapa.titulo);
  return NextResponse.json({ ok: true });
}
