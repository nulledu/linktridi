import { NextRequest, NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import { apagarProgramacao, atualizarProgramacao } from "@/lib/impressao3d-producao";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

// PATCH /api/3d/programacoes/<id> — campos e STATUS (o kanban usa esta rota;
// os carimbos iniciado_em/concluido_em são efeito do status, na lib).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireModuleKeys("3d");
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    const programacao = await atualizarProgramacao(id, {
      maquinaId: b?.maquinaId === undefined ? undefined : typeof b?.maquinaId === "string" && UUID.test(b.maquinaId) ? b.maquinaId : null,
      quantidade: typeof b?.quantidade === "number" ? b.quantidade : undefined,
      data: b?.data === undefined ? undefined : typeof b?.data === "string" ? b.data : null,
      hora: b?.hora === undefined ? undefined : typeof b?.hora === "string" ? b.hora : null,
      prioridade: typeof b?.prioridade === "string" ? b.prioridade : undefined,
      responsavelId: b?.responsavelId === undefined ? undefined : typeof b?.responsavelId === "string" && UUID.test(b.responsavelId) ? b.responsavelId : null,
      observacoes: typeof b?.observacoes === "string" ? b.observacoes : undefined,
      status: typeof b?.status === "string" ? b.status : undefined,
      ordem: typeof b?.ordem === "number" ? b.ordem : undefined,
    });
    if (!programacao) return NextResponse.json({ ok: false, error: "nao_encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true, programacao });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String((error as Error)?.message || error) }, { status: 500 });
  }
}

// DELETE /api/3d/programacoes/<id> — apaga a programação (o arquivo fica).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireModuleKeys("3d");
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
  try {
    const ok = await apagarProgramacao(id);
    if (!ok) return NextResponse.json({ ok: false, error: "nao_encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String((error as Error)?.message || error) }, { status: 500 });
  }
}
