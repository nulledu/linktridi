import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TIPOS = ["orcamento", "criativo", "promocao", "instabilidade", "lancamento", "outro"];

// GET /api/trafego/anotacoes?from=YYYY-MM-DD&to=YYYY-MM-DD — anotações da timeline.
export async function GET(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const db = createSupabaseAdminClient();
  let q = db.from("trafego_anotacoes").select("id,dia,tipo,texto,autor_nome,created_at").order("dia", { ascending: false }).order("created_at", { ascending: false }).limit(60);
  const from = sp.get("from"), to = sp.get("to");
  if (from) q = q.gte("dia", from);
  if (to) q = q.lte("dia", to);
  const { data, error } = await q;
  if (error) return NextResponse.json({ anotacoes: [] });   // tabela ausente → vazio
  return NextResponse.json({ anotacoes: data ?? [] });
}

// POST /api/trafego/anotacoes  { dia?, tipo?, texto } — registra uma anotação.
export async function POST(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: { dia?: string; tipo?: string; texto?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const texto = (b.texto || "").trim();
  if (!texto) return NextResponse.json({ error: "texto_obrigatorio" }, { status: 400 });
  const tipo = TIPOS.includes(b.tipo || "") ? b.tipo : "outro";
  const db = createSupabaseAdminClient();
  const row: Record<string, unknown> = { tipo, texto: texto.slice(0, 400), autor_id: me.id, autor_nome: me.name ?? null };
  if (b.dia && /^\d{4}-\d{2}-\d{2}$/.test(b.dia)) row.dia = b.dia;
  const { data, error } = await db.from("trafego_anotacoes").insert(row).select("id,dia,tipo,texto,autor_nome,created_at").single();
  if (error) return NextResponse.json({ error: error.message.includes("does not exist") || error.message.includes("find the") ? "tabela_ausente" : error.message }, { status: 400 });
  return NextResponse.json({ ok: true, anotacao: data });
}
