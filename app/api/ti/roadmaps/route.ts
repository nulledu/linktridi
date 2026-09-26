import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { gateTi, ehResposta } from "@/lib/ti-gate";
import { listarRoadmaps, listarProjetos, registrarHistorico } from "@/lib/ti";

export const dynamic = "force-dynamic";

// GET /api/ti/roadmaps — lista completa (o front filtra). ti:ver.
export async function GET() {
  const g = await gateTi("ver");
  if (ehResposta(g)) return g;
  const [roadmaps, projetos] = await Promise.all([listarRoadmaps(), listarProjetos()]);
  return NextResponse.json({ roadmaps, projetos }, { headers: { "Cache-Control": "no-store" } });
}

// POST /api/ti/roadmaps — cria roadmap (e o projeto, se vier nome novo). ti:criar.
export async function POST(req: NextRequest) {
  const g = await gateTi("criar");
  if (ehResposta(g)) return g;
  let b: { titulo?: string; descricao?: string; projetoId?: string; projetoNome?: string; inicio?: string; prazo?: string; responsavelId?: string; responsavelNome?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const titulo = String(b.titulo ?? "").trim();
  if (!titulo) return NextResponse.json({ error: "titulo_obrigatorio" }, { status: 400 });

  const db = createSupabaseAdminClient();
  let projetoId = b.projetoId ?? null;
  if (!projetoId) {
    const nome = String(b.projetoNome ?? "").trim();
    if (!nome) return NextResponse.json({ error: "projeto_obrigatorio" }, { status: 400 });
    const { data: p, error: ep } = await db.from("ti_projetos").insert({ nome }).select("id").single();
    if (ep || !p) return NextResponse.json({ error: "erro_projeto", detalhe: ep?.message }, { status: 500 });
    projetoId = p.id as string;
  }
  const { data, error } = await db.from("ti_roadmaps").insert({
    projeto_id: projetoId, titulo,
    descricao: b.descricao?.trim() || null,
    inicio: b.inicio || null, prazo: b.prazo || null,
    responsavel_id: b.responsavelId || null, responsavel_nome: b.responsavelNome || null,
  }).select("id").single();
  if (error || !data) return NextResponse.json({ error: "erro_criar", detalhe: error?.message }, { status: 500 });
  void registrarHistorico(data.id as string, g.me.name, "criou", `roadmap “${titulo}”`);
  return NextResponse.json({ ok: true, id: data.id });
}
