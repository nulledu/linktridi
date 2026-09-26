import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { analisarCampanha } from "@/lib/campanha-analise";

export const dynamic = "force-dynamic";

// GET /api/trafego/campanha?id=<campaign_id>&acct=<account_id>&since=&until=
// Análise programada (sem LLM) de uma campanha: conjuntos, anúncios e o que fazer.
export async function GET(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const id = sp.get("id") || "";
  const acct = sp.get("acct") || "";
  const since = sp.get("since") || "";
  const until = sp.get("until") || "";
  if (!id || !acct || !since || !until) return NextResponse.json({ error: "bad_params" }, { status: 400 });

  try {
    const data = await analisarCampanha(id, acct, since, until);
    if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}
