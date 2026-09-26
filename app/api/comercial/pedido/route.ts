import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { papelOuChave } from "@/lib/acesso";
import { pedidoDetalhe, pedidoDetalheGaia } from "@/lib/comercial-pedidos";

export const dynamic = "force-dynamic";
const PODE = ["admin", "gerente_vendas", "colaborador"];

// GET ?ref=<id do pedido no ERP> → detalhe completo do pedido.
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await papelOuChave(me, PODE, "comercial"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ref = req.nextUrl.searchParams.get("ref");
  if (!ref) return NextResponse.json({ error: "missing_ref" }, { status: 400 });
  try {
    // ref numérico = ERP antigo; UUID = pedido lançado neste sistema (Gaia).
    const det = /^\d+$/.test(ref) ? await pedidoDetalhe(ref) : await pedidoDetalheGaia(ref);
    if (!det) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ pedido: det });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}
