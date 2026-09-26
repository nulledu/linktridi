import { NextRequest } from "next/server";
import { listSnapshots } from "@/lib/contingencia";
import { gateContingencia, json, erro } from "../_gate";

export const dynamic = "force-dynamic";

// GET ?dias=30 — snapshots diários, do mais antigo pro mais novo.
export async function GET(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const dias = Math.min(Math.max(Number(req.nextUrl.searchParams.get("dias") ?? 30) || 30, 1), 366);
  try {
    return json({ ok: true, snapshots: await listSnapshots(dias) });
  } catch (e) { return erro(e, "historico_error"); }
}
