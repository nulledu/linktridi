import { NextRequest, NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import { apagarMaquina, atualizarMaquina } from "@/lib/impressao3d-producao";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

// PATCH /api/3d/maquinas/<id> — ficha e estado manual (ativa/manutenção/offline).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireModuleKeys("3d");
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    const maquina = await atualizarMaquina(id, {
      nome: typeof b?.nome === "string" ? b.nome : undefined,
      identificacao: typeof b?.identificacao === "string" ? b.identificacao : undefined,
      modelo: typeof b?.modelo === "string" ? b.modelo : undefined,
      estado: typeof b?.estado === "string" ? b.estado : undefined,
      local: typeof b?.local === "string" ? b.local : undefined,
      observacoes: typeof b?.observacoes === "string" ? b.observacoes : undefined,
      fotoUrl: b?.fotoUrl === undefined ? undefined : typeof b?.fotoUrl === "string" ? b.fotoUrl : null,
    });
    if (!maquina) return NextResponse.json({ ok: false, error: "nao_encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true, maquina });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String((error as Error)?.message || error) }, { status: 500 });
  }
}

// DELETE /api/3d/maquinas/<id> — só máquina sem programação (o FK recusa e a
// tela explica: histórico não some junto com o cadastro).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireModuleKeys("3d");
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
  const r = await apagarMaquina(id);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.error === "em_uso" ? 409 : 500 });
  return NextResponse.json({ ok: true });
}
