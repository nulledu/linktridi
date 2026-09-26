import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { gateTi, ehResposta } from "@/lib/ti-gate";
import { registrarHistorico } from "@/lib/ti";

export const dynamic = "force-dynamic";

// POST /api/ti/roadmaps/[id]/etapas — cria etapa no fim da fila. ti:editar.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gateTi("editar");
  if (ehResposta(g)) return g;
  const { id } = await params;
  let b: { titulo?: string; descricao?: string; status?: string; inicio?: string; prazo?: string; responsavelId?: string; responsavelNome?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const titulo = String(b.titulo ?? "").trim();
  if (!titulo) return NextResponse.json({ error: "titulo_obrigatorio" }, { status: 400 });

  const db = createSupabaseAdminClient();
  const { data: ult } = await db.from("ti_roadmap_etapas").select("ordem").eq("roadmap_id", id)
    .order("ordem", { ascending: false }).limit(1).maybeSingle();
  const ordem = ((ult?.ordem as number) ?? -1) + 1;
  const { data, error } = await db.from("ti_roadmap_etapas").insert({
    roadmap_id: id, titulo, ordem,
    descricao: b.descricao?.trim() || null, status: b.status || "nao_iniciada",
    inicio: b.inicio || null, prazo: b.prazo || null,
    responsavel_id: b.responsavelId || null, responsavel_nome: b.responsavelNome || null,
  }).select("id").single();
  if (error || !data) return NextResponse.json({ error: "erro_criar", detalhe: error?.message }, { status: 500 });
  void registrarHistorico(id, g.me.name, "etapa_criada", titulo);
  return NextResponse.json({ ok: true, id: data.id });
}

// PATCH /api/ti/roadmaps/[id]/etapas — reordena: { ordem: [etapaId, ...] }. ti:editar.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gateTi("editar");
  if (ehResposta(g)) return g;
  const { id } = await params;
  let b: { ordem?: string[] };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!Array.isArray(b.ordem) || !b.ordem.length) return NextResponse.json({ error: "ordem_obrigatoria" }, { status: 400 });
  const db = createSupabaseAdminClient();
  // Uma escrita por etapa (poucas — teto humano de etapas), sempre presa ao
  // roadmap da rota: id de fora da lista não anda de carona.
  for (let i = 0; i < b.ordem.length; i++) {
    const { error } = await db.from("ti_roadmap_etapas").update({ ordem: i, updated_at: new Date().toISOString() })
      .eq("id", b.ordem[i]).eq("roadmap_id", id);
    if (error) return NextResponse.json({ error: "erro_reordenar", detalhe: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
