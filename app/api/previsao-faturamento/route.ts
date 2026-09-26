import { NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { previsaoFaturamento } from "@/lib/previsao-faturamento-servidor";

export const dynamic = "force-dynamic";

// GET /api/previsao-faturamento — previsão de hoje, semana e mês.
// Mesma régua de acesso das duas telas que a mostram: Analytics e Tridify.
export async function GET() {
  const profile = await getProfileForAnyModule("analytics", "trafego");
  if (!profile) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await previsaoFaturamento(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "falha_previsao", detail: String(e) }, { status: 500 });
  }
}
