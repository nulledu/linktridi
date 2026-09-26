import { NextRequest, NextResponse } from "next/server";
import { buildDesignSnapshot, type DesignSnapshot } from "@/lib/design";
import { resolvePeriod } from "@/lib/period";
import { getProfileForModule } from "@/lib/require-auth";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

// Cache em memória por período (TTL abaixo). Usa o `cached` comum em vez de um
// Map local: ele tem teto de entradas (o Map daqui crescia sem limite, uma
// chave por período já pedido) e compartilha a MESMA Promise entre chamadas
// concorrentes — cinco pessoas abrindo o painel no mesmo minuto numa instância
// fria disparavam cinco montagens completas; agora quatro esperam a primeira.
const TTL = 60_000;

// GET /api/design?period=hoje|ontem|7d|30d|mes|custom&from&to — admin/gerente_producao.
export async function GET(req: NextRequest) {
  const profile = await getProfileForModule("design");
  if (!profile) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sp = new URL(req.url).searchParams;
  const range = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  const ckey = `${range.fromDate}_${range.toDate}`;
  try {
    const data = await cached(`design:${ckey}`, TTL, () => buildDesignSnapshot(range));
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "failed_to_load_design", detail: String(e) }, { status: 500 });
  }
}
