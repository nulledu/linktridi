import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { paginaDoMarketing } from "@/lib/tridiflow-db";
import { analyticsBot, getBot, TridiflowTabelaAusente } from "@/lib/tridiflow-db";

export const dynamic = "force-dynamic";

// GET ?botId= → sessões, taxa de conclusão, drop-off por etapa e leads.
export async function GET(req: NextRequest) {
  const botId = req.nextUrl.searchParams.get("botId");
  // Resultados de um LinkTridi/Central (páginas do Marketing): quem tem a
  // área `marketing` vê os DELES; o resto segue pedindo a chave de analytics.
  const doMkt = botId ? await paginaDoMarketing(botId).catch(() => null) : null;
  if (!(await getProfileForAnyModule("tridiflow:analytics", ...(doMkt ? ["marketing"] : [])))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!botId) return NextResponse.json({ error: "missing_bot" }, { status: 400 });
  try {
    const [analytics, bot] = await Promise.all([analyticsBot(botId), getBot(botId)]);
    // Traduz o id do grupo pro título (drop-off legível).
    const titulos = new Map((bot?.fluxo.groups ?? []).map((g) => [g.id, g.title]));
    return NextResponse.json({
      nome: bot?.nome ?? "Bot",
      ...analytics,
      porEtapa: analytics.porEtapa.map((e) => ({ ...e, titulo: titulos.get(e.etapa) ?? e.etapa })),
      // Ordem do fluxo → funil por etapa no client (alcance = total − abandonos anteriores).
      grupos: (bot?.fluxo.groups ?? []).map((g) => ({ id: g.id, titulo: g.title })),
    });
  } catch (e) {
    if (e instanceof TridiflowTabelaAusente) return NextResponse.json({ error: "Rode o supabase/tridiflow.sql primeiro." }, { status: 400 });
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
