import { NextRequest, NextResponse } from "next/server";
import { marketApiError, marketRepository, parseIntervalo, parseProfileIds, requireMarketAdmin } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const data = await marketRepository().overview(parseProfileIds(req.url), parseIntervalo(req.url));
    return NextResponse.json({ ok: true, data, meta: { schemaReady: data.schemaReady } });
  } catch (error) { return marketApiError(error); }
}

