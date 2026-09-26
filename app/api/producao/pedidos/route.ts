import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { listPedidosDaEtapa } from "@/lib/producao";

export const dynamic = "force-dynamic";

// GET /api/producao/pedidos?etapa=<id> — lista os pedidos de uma etapa (drill-down).
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const etapa = Number(req.nextUrl.searchParams.get("etapa"));
  if (!etapa) return NextResponse.json({ error: "missing_etapa" }, { status: 400 });
  try {
    return NextResponse.json({ pedidos: await listPedidosDaEtapa(etapa) });
  } catch {
    return NextResponse.json({ error: "erp_failed" }, { status: 502 });
  }
}
