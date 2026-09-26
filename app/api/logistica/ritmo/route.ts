import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { ritmoLogistica } from "@/lib/logistica-ritmo";

export const dynamic = "force-dynamic";

// GET /api/logistica/ritmo?dias=7|30 — horários de pico, acúmulo e tempo por etapa.
// O cache de 10 min mora no lib (é do servidor, é o que abate egress).
export async function GET(req: NextRequest) {
  if (!(await getProfileForModule("logistica"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dias = Number(new URL(req.url).searchParams.get("dias")) === 30 ? 30 : 7;
  try {
    return NextResponse.json(await ritmoLogistica(dias), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "falha_ao_ler_ritmo", detail: String(e) }, { status: 500 });
  }
}
