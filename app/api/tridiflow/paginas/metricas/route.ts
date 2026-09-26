import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { metricasPagina } from "@/lib/tridiflow-db";

export const dynamic = "force-dynamic";

// Métricas de UMA página (comportamento dentro da página).
// Campanha, investimento, ROAS e atribuição continuam sendo assunto do Tridify —
// aqui só entra o que acontece entre abrir a página e clicar no botão.
export async function GET(req: NextRequest) {
  if (!(await getProfileForModule("tridiflow:analytics"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const dias = Math.max(1, Math.min(180, Number(req.nextUrl.searchParams.get("dias") ?? 30)));
  try {
    return NextResponse.json({ metricas: await metricasPagina(id, dias) });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
