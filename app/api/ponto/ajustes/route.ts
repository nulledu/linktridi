import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule, getAdminProfile } from "@/lib/require-auth";
import { listAjustes, addAjuste, removeAjuste } from "@/lib/ponto";

export const dynamic = "force-dynamic";

// GET /api/ponto/ajustes?pessoaId=..&desde=YYYY-MM-DD — ajustes manuais de horas.
export async function GET(req: NextRequest) {
  if (!(await getProfileForAnyModule("administracao", "colaboradores"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const desde = sp.get("desde") || new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
  const ajustes = await listAjustes(sp.get("pessoaId"), desde);
  return NextResponse.json({ ajustes });
}

// POST /api/ponto/ajustes  { pessoaId, dia, minutos, motivo? } — soma/tira horas.
export async function POST(req: NextRequest) {
  // SÓ ADMIN adiciona/tira horas (não basta ter a área "administracao").
  const me = await getAdminProfile();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: { pessoaId?: string; dia?: string; minutos?: number; motivo?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!b.pessoaId || !b.dia || !/^\d{4}-\d{2}-\d{2}$/.test(b.dia)) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  const min = Math.round(Number(b.minutos));
  if (!Number.isFinite(min) || min === 0) return NextResponse.json({ error: "minutos_invalidos" }, { status: 400 });
  const a = await addAjuste({ pessoaId: b.pessoaId, dia: b.dia, minutos: Math.max(-1440, Math.min(1440, min)), motivo: b.motivo?.trim() || null, autorId: me.id, autorNome: me.name ?? null });
  if (!a) return NextResponse.json({ error: "tabela_ausente" }, { status: 400 });
  return NextResponse.json({ ok: true, ajuste: a });
}

// DELETE /api/ponto/ajustes?id=.. — remove um ajuste.
export async function DELETE(req: NextRequest) {
  if (!(await getAdminProfile())) return NextResponse.json({ error: "forbidden" }, { status: 403 });   // só admin
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  await removeAjuste(id);
  return NextResponse.json({ ok: true });
}
