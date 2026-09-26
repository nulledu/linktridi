import { NextRequest, NextResponse } from "next/server";
import { buildProductionSnapshot } from "@/lib/producao";
import { resolvePeriod } from "@/lib/period";
import { getProfileForModule } from "@/lib/require-auth";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

// Cache em memória por período (60s) — não martelar o ERP a cada refresh.
//
// Usa o `cached` comum em vez de um Map local: além do teto de entradas (o Map
// daqui crescia sem limite, uma chave por período que alguém já pediu), ele
// compartilha a MESMA Promise entre chamadas concorrentes. Numa instância fria,
// cinco pessoas abrindo o painel no mesmo minuto disparavam cinco montagens de
// snapshot completas; agora quatro delas esperam a primeira.
const TTL = 60_000;

// GET /api/producao?period=…&from&to — fila de produção. admin/gerente_producao.
export async function GET(req: NextRequest) {
  const profile = await getProfileForModule("producao");
  if (!profile) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sp = new URL(req.url).searchParams;
  const range = resolvePeriod(sp.get("period") ?? "7d", sp.get("from"), sp.get("to"));
  const ckey = `producao:${range.fromDate}_${range.toDate}`;
  try {
    const data = await cached(ckey, TTL, () => buildProductionSnapshot(range));
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "failed_to_load_production", detail: String(e) }, { status: 500 });
  }
}
