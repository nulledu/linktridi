import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { readSupabasePages } from "@/lib/supabase-pages";

export const dynamic = "force-dynamic";

// Marcas do criativo (tags + editor de vídeo), presas à CHAVE do grupo — não ao
// ad.id, que a Meta troca a cada duplicação. Schema: supabase/trafego_criativos.sql.
//
// A tabela pode AINDA NÃO EXISTIR (o SQL é rodado à mão pelo usuário). Nesse caso
// o GET devolve lista vazia + `indisponivel`, e a tela some com a marcação em vez
// de quebrar — mesmo padrão do resto da Tridify.
const TABELA = "trafego_criativo_marcas";

interface MarcaRow { chave: string; editor: string | null; tags: string[] | null }

function semTabela(e: { code?: string; message?: string } | null): boolean {
  if (!e) return false;
  return e.code === "42P01" || /relation .* does not exist|schema cache/i.test(e.message || "");
}

// GET /api/trafego/criativos/marcas → { marcas: [{chave, editor, tags}], indisponivel? }
export async function GET() {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = createSupabaseAdminClient();
  // PostgREST corta em 1000 por resposta: página ordenada até o teto.
  const { data, error } = await readSupabasePages<MarcaRow>(
    (de, ate) => db.from(TABELA).select("chave,editor,tags").order("chave").range(de, ate) as unknown as PromiseLike<{ data: MarcaRow[] | null; error: { message: string } | null }>,
    20_000,
  );
  if (error) {
    if (semTabela(error)) return NextResponse.json({ marcas: [], indisponivel: true });
    return NextResponse.json({ error: "falha_ao_ler", detail: error.message }, { status: 500 });
  }
  const marcas = (data as MarcaRow[] | null || []).map((m) => ({
    chave: m.chave, editor: m.editor ?? null, tags: Array.isArray(m.tags) ? m.tags : [],
  }));
  return NextResponse.json({ marcas });
}

// POST /api/trafego/criativos/marcas  { chave, nome?, editor?, tags? } → upsert
export async function POST(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let b: { chave?: string; nome?: string; editor?: string | null; tags?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const chave = String(b.chave || "").trim();
  if (!chave) return NextResponse.json({ error: "chave_obrigatoria" }, { status: 400 });

  // Tags: texto livre, mas normalizadas (sem vazio, sem repetido, teto de 20).
  const tags = Array.isArray(b.tags)
    ? [...new Set(b.tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 20)
    : [];
  const editor = b.editor == null ? null : String(b.editor).trim() || null;

  const db = createSupabaseAdminClient();
  const { error } = await db.from(TABELA).upsert({
    chave,
    nome: b.nome ? String(b.nome).slice(0, 300) : null,
    editor,
    tags,
    atualizado_em: new Date().toISOString(),
    atualizado_por: me.id,
  }, { onConflict: "chave" });

  if (error) {
    if (semTabela(error)) {
      return NextResponse.json({ error: "tabela_ausente", detail: "Rode supabase/trafego_criativos.sql" }, { status: 503 });
    }
    return NextResponse.json({ error: "falha_ao_salvar", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, chave, editor, tags });
}
