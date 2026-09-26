import { NextRequest, NextResponse } from "next/server";
import { provisionar } from "@/lib/device";

export const dynamic = "force-dynamic";

// POST /api/device/provision { code } → { token, device }. Usado 1x pelo tablet.
export async function POST(req: NextRequest) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "codigo_invalido" }, { status: 400 });
  }
  const r = await provisionar(code);
  if ("error" in r) return NextResponse.json(r, { status: 400 });
  return NextResponse.json(r);
}
