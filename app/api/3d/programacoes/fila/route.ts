import { NextRequest, NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import { reordenarFila } from "@/lib/impressao3d-producao";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

// POST /api/3d/programacoes/fila { maquinaId, ids } — nova ordem da fila de
// UMA máquina (ids na ordem desejada; o que não for daquela máquina é ignorado).
export async function POST(req: NextRequest) {
  await requireModuleKeys("3d");
  const b = (await req.json().catch(() => null)) as { maquinaId?: unknown; ids?: unknown } | null;
  const maquinaId = typeof b?.maquinaId === "string" && UUID.test(b.maquinaId) ? b.maquinaId : "";
  const ids = Array.isArray(b?.ids) ? (b!.ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID.test(x)) : [];
  if (!maquinaId || !ids.length) return NextResponse.json({ ok: false, error: "fila_invalida" }, { status: 400 });
  try {
    await reordenarFila(maquinaId, ids);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String((error as Error)?.message || error) }, { status: 500 });
  }
}
