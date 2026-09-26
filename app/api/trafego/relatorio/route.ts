import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { resolvePeriod } from "@/lib/period";
import { relatorioHierarquico, totaisDoPeriodo, statusSync, funilDoPeriodo } from "@/lib/meta-warehouse";

export const dynamic = "force-dynamic";

// GET /api/trafego/relatorio?period=...&accounts=... — relatório hierárquico
// (campanha → conjunto → anúncio) direto do WAREHOUSE LOCAL. Não chama a Meta:
// responde na hora. Quem alimenta a tabela é o cron /api/trafego/sync.
export async function GET(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const r = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  const contas = (sp.get("accounts") || "").split(",").map((s) => s.trim()).filter(Boolean);

  const alvo = contas.length ? contas : undefined;
  const [linhas, totais, sync, funil] = await Promise.all([
    relatorioHierarquico(r.fromDate, r.toDate, alvo),
    totaisDoPeriodo(r.fromDate, r.toDate, alvo),
    statusSync(),
    funilDoPeriodo(r.fromDate, r.toDate, alvo),
  ]);

  // Tabela ainda não criada (SQL pendente) ou sem dado sincronizado.
  if (linhas === null) {
    return NextResponse.json({ semWarehouse: true, periodLabel: r.label }, { status: 200 });
  }
  const ultimaSync = sync.map((s) => s.ultimaSync).filter(Boolean).sort().reverse()[0] ?? null;
  return NextResponse.json(
    { linhas, totais, funil, periodLabel: r.label, ultimaSync, contasComErro: sync.filter((s) => s.status === "erro").length },
    { headers: { "Cache-Control": "no-store" } },
  );
}
