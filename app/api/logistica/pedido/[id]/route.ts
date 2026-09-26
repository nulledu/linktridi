import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { detalheDoPedido } from "@/lib/logistica-pedido";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

// GET /api/logistica/pedido/123 — linha do tempo de UM pedido, para o card aberto.
// Não faz parte do snapshot da lista de propósito (ver lib/logistica-pedido.ts).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getProfileForModule("logistica"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "id_invalido" }, { status: 422 });
  }
  try {
    // Abrir e fechar o mesmo pedido não deve reler o log do ERP.
    const data = await cached(`logi:pedido:${id}`, 5 * 60_000, () => detalheDoPedido(id));
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "falha_ao_ler_timeline", detail: String(e) }, { status: 500 });
  }
}
