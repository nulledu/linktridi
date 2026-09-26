import { NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { previsaoPorProduto } from "@/lib/previsao-produtos-servidor";

export const dynamic = "force-dynamic";

// GET /api/previsao-faturamento/produtos — faturamento e previsão por produto.
// Mesma régua de acesso da previsão total (Analytics ou Tridify).
export async function GET() {
  const profile = await getProfileForAnyModule("analytics", "trafego");
  if (!profile) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await previsaoPorProduto(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "falha_previsao_produtos", detail: String(e) }, { status: 500 });
  }
}
