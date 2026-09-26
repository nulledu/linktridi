import { NextRequest, NextResponse } from "next/server";
import { corpo, falta, jsonInvalido, naoAutenticado, semAcesso, sessao } from "@/lib/chat/servidor";

export const dynamic = "force-dynamic";

// Categoria é a seção da sidebar (GERAL, PROJETOS, EQUIPES). Organizacional e
// compartilhada por todo mundo, então só gerente/admin mexe.
const podeGerir = (role: string) => role === "admin" || role.startsWith("gerente");

export async function POST(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  if (!podeGerir(me.role)) return semAcesso();
  const b = await corpo<{ nome?: string }>(req);
  const nome = b?.nome?.trim();
  if (!nome) return jsonInvalido();

  const { data: ultima } = await db.from("central_categorias")
    .select("ordem").order("ordem", { ascending: false }).limit(1).maybeSingle();
  const ordem = ((ultima as { ordem?: number } | null)?.ordem ?? 0) + 1;

  const { data, error } = await db.from("central_categorias")
    .insert({ nome, ordem, criada_por: me.id }).select("id,nome,ordem").single();
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ categoria: data });
}

export async function PATCH(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  if (!podeGerir(me.role)) return semAcesso();
  const b = await corpo<{ id?: string; nome?: string; ordem?: number }>(req);
  if (!b?.id) return falta("id");
  const patch: Record<string, unknown> = {};
  if (b.nome !== undefined) patch.nome = String(b.nome).trim();
  if (b.ordem !== undefined) patch.ordem = Number(b.ordem);
  if (!Object.keys(patch).length) return falta("campo");
  const { error } = await db.from("central_categorias").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Excluir a categoria NÃO exclui os canais: eles voltam para "sem categoria"
// (o `on delete set null` da FK cuida disso).
export async function DELETE(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  if (!podeGerir(me.role)) return semAcesso();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return falta("id");
  await db.from("central_categorias").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
