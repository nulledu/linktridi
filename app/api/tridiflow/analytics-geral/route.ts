import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { analyticsGeral, TridiflowTabelaAusente } from "@/lib/tridiflow-db";

export const dynamic = "force-dynamic";

// GET ?dias=7|14|30 → métricas agregadas de todos os bots (tela Analytics).
export async function GET(req: NextRequest) {
  if (!(await getProfileForModule("tridiflow:analytics"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const dias = Number(req.nextUrl.searchParams.get("dias")) || 14;
    return NextResponse.json(await analyticsGeral(dias));
  } catch (e) {
    if (e instanceof TridiflowTabelaAusente) return NextResponse.json({ error: "Rode o supabase/tridiflow.sql primeiro." }, { status: 400 });
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
