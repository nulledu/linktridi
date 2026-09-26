import { NextRequest, NextResponse } from "next/server";
import { buildDesignPedidoDetalhe } from "@/lib/design";
import { getProfileForModule } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

// GET /api/design/pedido?id=<id interno do pedido> — detalhe de artes p/ o pop-up
// de "não aprovadas". Mesmo gate do módulo Design (admin / gerente_producao).
export async function GET(req: NextRequest) {
  const profile = await getProfileForModule("design");
  if (!profile) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  try {
    const data = await buildDesignPedidoDetalhe(id);
    if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "failed_to_load_pedido", detail: String(e) }, { status: 500 });
  }
}
