import { NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { listFinanceiro } from "@/lib/tridi-custos";
import { meuNivel } from "@/lib/perfis";
import { podeVerCustoNivel } from "@/lib/niveis";

export const dynamic = "force-dynamic";

// GET → financeiro (custos/gastos, impostos, comissões) da Tridi. Nível ≥ 4.
export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!podeVerCustoNivel((await meuNivel(me)).nivel)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await listFinanceiro());
  } catch (e) {
    return NextResponse.json({ error: "custos_failed", detail: String(e).slice(0, 120) }, { status: 502 });
  }
}
