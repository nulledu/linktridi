import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { resumoRastreamento, eventosRecentes, jornadaVisitante } from "@/lib/trafego-track";

export const dynamic = "force-dynamic";

// GET /api/trafego/track            → resumo + eventos recentes
// GET /api/trafego/track?vid=abc    → jornada (eventos) de um visitante
export async function GET(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const vid = new URL(req.url).searchParams.get("vid");
  try {
    if (vid) return NextResponse.json({ jornada: await jornadaVisitante(vid) }, { headers: { "Cache-Control": "no-store" } });
    const [resumo, recentes] = await Promise.all([resumoRastreamento(), eventosRecentes(60)]);
    return NextResponse.json({ resumo, recentes }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}
