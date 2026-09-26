import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { apiRh } from "@/lib/rh/gate";
import { validarEvento } from "@/lib/rh/calendario/validar";

export const dynamic = "force-dynamic";

/**
 * Datas dos setores (`tipo = 'setor'`). Nasce anual: "Dia da Produção" é
 * todo ano por definição. Ativar/desativar é o PATCH com `ativo`.
 */
const TIPOS = ["setor"] as const;

const id = (v: unknown) => (typeof v === "string" && v.length <= 64 ? v : null);

/** POST — cria a data de um setor. */
export async function POST(req: Request) {
  const eu = await apiRh("calendario_setores");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const v = validarEvento({ ...corpo, tipo: "setor" }, TIPOS);
  if (!v.ok) return NextResponse.json({ erro: v.erro }, { status: 400 });

  const { data, error } = await createSupabaseAdminClient()
    .from("rh_calendario_eventos")
    .insert({ ...v.linha, autor_id: eu.profile.id, autor_nome: eu.profile.name, created_by: eu.profile.id })
    .select("id").maybeSingle();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id ?? null });
}

/**
 * PATCH — altera, ou só liga/desliga.
 * `{ id, ativo }` sozinho é o interruptor; com o resto do corpo é edição.
 */
export async function PATCH(req: Request) {
  const eu = await apiRh("calendario_setores");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  const alvo = id(corpo.id);
  if (!alvo) return NextResponse.json({ erro: "Data não informada." }, { status: 400 });

  const db = createSupabaseAdminClient();
  const soInterruptor = typeof corpo.ativo === "boolean" && corpo.nome === undefined;
  let mudanca: Record<string, unknown>;
  if (soInterruptor) {
    mudanca = { ativo: corpo.ativo, updated_by: eu.profile.id };
  } else {
    const v = validarEvento({ ...corpo, tipo: "setor" }, TIPOS);
    if (!v.ok) return NextResponse.json({ erro: v.erro }, { status: 400 });
    mudanca = { ...v.linha, updated_by: eu.profile.id };
  }

  const { data, error } = await db.from("rh_calendario_eventos")
    .update(mudanca).eq("id", alvo).eq("tipo", "setor").select("id").maybeSingle();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ erro: "Data não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE — apaga a data do setor. */
export async function DELETE(req: Request) {
  const eu = await apiRh("calendario_setores");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const alvo = new URL(req.url).searchParams.get("id");
  if (!alvo) return NextResponse.json({ erro: "Data não informada." }, { status: 400 });

  const { data, error } = await createSupabaseAdminClient()
    .from("rh_calendario_eventos").delete().eq("id", alvo).eq("tipo", "setor").select("id").maybeSingle();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ erro: "Data não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
