import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { resolvePeriod } from "@/lib/period";
import { buildProdutosVendidos } from "@/lib/produtos-vendidos";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

// GET /api/analytics/produtos?period=&from=&to= — mais vendidos por categoria/tamanho.
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const keys = await resolveMyModuleKeys(me);
  if (!keys.includes("analytics")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const range = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  // Período anterior (mesma duração, imediatamente antes) p/ a variação ↑/↓.
  const fromMs = new Date(range.fromIso).getTime();
  const toMs = new Date(range.toIso).getTime();
  const prevRange = { ...range, fromIso: new Date(fromMs - (toMs - fromMs)).toISOString(), toIso: new Date(fromMs).toISOString() };
  try {
    const [atual, anterior] = await Promise.all([
      cached(`analytics:produtos:${range.fromDate}_${range.toDate}`, 60_000, () => buildProdutosVendidos(range)),
      cached(`analytics:produtos:prev:${range.fromDate}_${range.toDate}`, 60_000, () => buildProdutosVendidos(prevRange)),
    ]);
    const deltaPct = anterior.total > 0 ? Math.round(((atual.total - anterior.total) / anterior.total) * 1000) / 10 : null;
    return NextResponse.json({
      periodLabel: range.label, categorias: atual.categorias, total: atual.total,
      serie: atual.serie, totalPrev: anterior.total, deltaPct,
      brindes: atual.brindes, descartados: atual.descartados,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}
