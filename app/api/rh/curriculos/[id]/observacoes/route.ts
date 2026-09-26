import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { apiRh } from "@/lib/rh/gate";
import { anotarHistorico } from "@/lib/rh/curriculos/dados";
import { TETO_OBSERVACAO } from "@/lib/rh/curriculos/tipos";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST { texto } — observação interna. Privada: nunca vai ao candidato. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const eu = await apiRh("curriculos_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ erro: "Candidato inválido." }, { status: 400 });

  const corpo = (await req.json().catch(() => null)) as { texto?: unknown } | null;
  const texto = typeof corpo?.texto === "string" ? corpo.texto.trim() : "";
  if (!texto) return NextResponse.json({ erro: "Escreva a observação." }, { status: 400 });
  if (texto.length > TETO_OBSERVACAO) return NextResponse.json({ erro: `Máximo de ${TETO_OBSERVACAO} caracteres.` }, { status: 400 });

  const { data, error } = await createSupabaseAdminClient().from("rh_candidato_observacoes")
    .insert({ candidato_id: id, texto, autor_id: eu.profile.id, autor_nome: eu.profile.name })
    .select("id,texto,autor_nome,created_at").maybeSingle();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  // O histórico registra QUE houve observação, não o texto: a linha do tempo
  // abre para quem tem só `rh:curriculos`; a observação, só para quem edita.
  await anotarHistorico({ candidato_id: id, tipo: "observacao", titulo: "Observação adicionada.", autor_id: eu.profile.id, autor_nome: eu.profile.name });
  return NextResponse.json({ ok: true, observacao: data });
}
