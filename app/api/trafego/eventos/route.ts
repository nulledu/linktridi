import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { resolvePeriod } from "@/lib/period";
import { eventosRecentes } from "@/lib/trafego-vendas";

export const dynamic = "force-dynamic";

// Feed de eventos do período (pedidos criados/aprovados/chargeback) — dados reais do ERP.
export async function GET(req: NextRequest) {
  if (!(await getProfileForModule("trafego"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const r = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  try {
    return NextResponse.json({ eventos: await eventosRecentes(r.fromDate, r.toDate) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ eventos: [] });
  }
}
