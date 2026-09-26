import { NextResponse } from "next/server";
import { buildLogisticaSnapshot, type LogisticaSnapshot } from "@/lib/logistica";
import { getProfileForModule } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

let cache: { at: number; data: LogisticaSnapshot } | null = null;
const TTL = 60_000;

// GET /api/logistica — categorias de logística ao vivo. admin/gerente_producao.
export async function GET() {
  // Mesmo portão da PÁGINA (requireModule): quem tem o módulo "logistica" por
  // cargo/nível vê os dados. Antes o gate hardcode de role barrava o ERP (401)
  // mesmo com a página liberada → parecia "o ERP não carrega".
  const profile = await getProfileForModule("logistica");
  if (!profile) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (cache && Date.now() - cache.at < TTL) {
    return NextResponse.json(cache.data, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const data = await buildLogisticaSnapshot();
    cache = { at: Date.now(), data };
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "failed_to_load_logistica", detail: String(e) }, { status: 500 });
  }
}
