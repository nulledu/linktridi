import { NextResponse } from "next/server";
import { apiRh } from "@/lib/rh/gate";
import { marcarVisto } from "@/lib/rh/curriculos/dados";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST — a pessoa abriu o perfil. Grava `visto_em` UMA vez (é o que apaga o
 * "novo" do menu). Disparado pelo gesto de abrir, nunca por poll.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const eu = await apiRh("curriculos");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ erro: "Candidato inválido." }, { status: 400 });
  const gravou = await marcarVisto(id, { id: eu.profile.id, nome: eu.profile.name });
  return NextResponse.json({ ok: true, gravou });
}
