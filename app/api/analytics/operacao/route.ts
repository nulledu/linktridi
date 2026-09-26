import { NextRequest, NextResponse } from "next/server";
import { resolvePeriod } from "@/lib/period";
import { getProfileForModule } from "@/lib/require-auth";
import { cached } from "@/lib/cache";
import { montarAnalyticsOperacao } from "@/lib/analytics/operacao";

export const dynamic = "force-dynamic";

// Cache por PERÍODO, 60s. A montagem faz ~20 idas ao ERP legado; sem isto,
// cada pessoa que abre a tela paga as vinte, e o `cached` ainda divide a MESMA
// promessa entre quem chegar junto — cinco abas no mesmo minuto viram uma
// montagem só.
const TTL = 60_000;

// GET /api/analytics/operacao?period=…&from&to
//
// Mesma chave de módulo que a PÁGINA exige (`analytics`). Gate de rota fora de
// sincronia com o da tela é como alguém com o cargo certo entra e recebe erro
// em tudo — já aconteceu aqui com a aba de tráfego.
export async function GET(req: NextRequest) {
  const profile = await getProfileForModule("analytics");
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const range = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  try {
    const data = await cached(`analytics:operacao:${range.fromDate}_${range.toDate}`, TTL, () => montarAnalyticsOperacao(range));
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "failed_to_load_analytics", detail: String(e) }, { status: 500 });
  }
}
