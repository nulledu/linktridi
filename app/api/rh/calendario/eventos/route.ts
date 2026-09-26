import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { apiRh } from "@/lib/rh/gate";
import { validarEvento } from "@/lib/rh/calendario/validar";

export const dynamic = "force-dynamic";

/**
 * Evento interno e data comemorativa PRÓPRIA. Data de setor tem rota irmã
 * (`../setores`) com a chave dela — a mesma validação, outra porta.
 */
const TIPOS = ["evento", "comemorativa"] as const;

const id = (v: unknown) => (typeof v === "string" && v.length <= 64 ? v : null);

/** POST — cria. */
export async function POST(req: Request) {
  const eu = await apiRh("calendario_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const v = validarEvento(corpo, TIPOS);
  if (!v.ok) return NextResponse.json({ erro: v.erro }, { status: 400 });

  const { data, error } = await createSupabaseAdminClient()
    .from("rh_calendario_eventos")
    .insert({ ...v.linha, autor_id: eu.profile.id, autor_nome: eu.profile.name, created_by: eu.profile.id })
    .select("id").maybeSingle();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id ?? null });
}

/** PATCH — altera. O corpo traz o evento inteiro (é um formulário, não um campo). */
export async function PATCH(req: Request) {
  const eu = await apiRh("calendario_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  const alvo = id(corpo.id);
  if (!alvo) return NextResponse.json({ erro: "Evento não informado." }, { status: 400 });

  const v = validarEvento(corpo, TIPOS);
  if (!v.ok) return NextResponse.json({ erro: v.erro }, { status: 400 });

  const { data, error } = await createSupabaseAdminClient()
    .from("rh_calendario_eventos")
    .update({ ...v.linha, updated_by: eu.profile.id })
    .eq("id", alvo).in("tipo", [...TIPOS])
    .select("id").maybeSingle();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ erro: "Evento não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE — apaga. */
export async function DELETE(req: Request) {
  const eu = await apiRh("calendario_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const alvo = new URL(req.url).searchParams.get("id");
  if (!alvo) return NextResponse.json({ erro: "Evento não informado." }, { status: 400 });

  const { data, error } = await createSupabaseAdminClient()
    .from("rh_calendario_eventos").delete().eq("id", alvo).in("tipo", [...TIPOS]).select("id").maybeSingle();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ erro: "Evento não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
