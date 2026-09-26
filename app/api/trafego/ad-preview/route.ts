import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { previewDoAnuncio, ehAdId } from "@/lib/meta-preview";

export const dynamic = "force-dynamic";

// GET /api/trafego/ad-preview?adId=<id>
// A regra da prévia (formatos, varredura de tokens, extração do iframe) mora em
// lib/meta-preview.ts — Marketing mostra a MESMA prévia com outro gate.
export async function GET(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const adId = (new URL(req.url).searchParams.get("adId") || "").trim();
  if (!ehAdId(adId)) return NextResponse.json({ error: "bad_params" }, { status: 400 });

  try {
    const p = await previewDoAnuncio(adId);
    if (!p) return NextResponse.json({ src: null }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(p, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}
