import { NextRequest, NextResponse } from "next/server";
import { autenticarDevice } from "@/lib/device";

export const dynamic = "force-dynamic";

// GET /api/ponto/foto?u=<url do storage> — proxy da foto de perfil/cadastro pro
// tablet. Assim o tablet só precisa alcançar ESTE servidor (não o Supabase
// direto). Auth: x-device-token. Só repassa URLs do próprio storage (anti-SSRF).
export async function GET(req: NextRequest) {
  const auth = await autenticarDevice(req.headers.get("x-device-token"));
  if (!auth.ok) return new NextResponse(auth.body.error, { status: auth.status });

  const u = new URL(req.url).searchParams.get("u") || "";
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (!base || !u.startsWith(`${base}/storage/`)) return new NextResponse("bad_url", { status: 400 });

  try {
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) return new NextResponse("not_found", { status: 404 });
    const buf = await r.arrayBuffer();
    return new NextResponse(buf, {
      headers: { "Content-Type": r.headers.get("content-type") || "image/jpeg", "Cache-Control": "no-store" },
    });
  } catch {
    return new NextResponse("erro", { status: 502 });
  }
}
