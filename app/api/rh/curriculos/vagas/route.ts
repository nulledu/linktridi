import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { apiRh } from "@/lib/rh/gate";
import { invalidate } from "@/lib/cache";
import { normalizarPerguntasDaVaga } from "@/lib/rh/curriculos/formulario";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS = new Set(["aberta", "pausada", "encerrada"]);
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Vagas — só a REFERÊNCIA (título, setor, status). O cadastro completo de
 * vagas é módulo futuro; hoje ela existe pra cada candidato ter onde apontar.
 */
export async function POST(req: Request) {
  const eu = await apiRh("curriculos_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const titulo = txt(corpo?.titulo, 120);
  if (!titulo) return NextResponse.json({ erro: "Dê um título à vaga." }, { status: 400 });
  const { data, error } = await createSupabaseAdminClient().from("rh_vagas")
    .insert({ titulo, setor: txt(corpo?.setor, 80) || null, descricao: txt(corpo?.descricao, 2000) || null, created_by: eu.profile.id })
    .select("id,titulo,setor,descricao,status,created_at").maybeSingle();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  invalidate("rh:candidatura:publico");
  return NextResponse.json({ ok: true, vaga: data });
}

export async function PATCH(req: Request) {
  const eu = await apiRh("curriculos_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof corpo?.id === "string" && UUID.test(corpo.id) ? corpo.id : null;
  if (!id) return NextResponse.json({ erro: "Vaga não informada." }, { status: 400 });
  const patch: Record<string, unknown> = { updated_by: eu.profile.id };
  if ("titulo" in corpo!) { const t = txt(corpo!.titulo, 120); if (!t) return NextResponse.json({ erro: "Título não pode ficar vazio." }, { status: 400 }); patch.titulo = t; }
  if ("setor" in corpo!) patch.setor = txt(corpo!.setor, 80) || null;
  if ("descricao" in corpo!) patch.descricao = txt(corpo!.descricao, 2000) || null;
  if ("perguntas" in corpo!) patch.perguntas = normalizarPerguntasDaVaga(corpo!.perguntas);
  if ("status" in corpo!) { const s = txt(corpo!.status, 20); if (!STATUS.has(s)) return NextResponse.json({ erro: "Status inválido." }, { status: 400 }); patch.status = s; }
  const { data, error } = await createSupabaseAdminClient().from("rh_vagas").update(patch).eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ erro: "Vaga não encontrada." }, { status: 404 });
  invalidate("rh:candidatura:publico");
  return NextResponse.json({ ok: true });
}
