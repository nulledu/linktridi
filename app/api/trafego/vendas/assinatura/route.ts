import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { resolvePeriod } from "@/lib/period";
import { contarPagosDoEspelho } from "@/lib/yampi-warehouse";

export const dynamic = "force-dynamic";

// GET /api/trafego/vendas/assinatura?period=… → { n }
// O tick comum do painel da Tridify: só a CONTAGEM de vendas pagas do espelho
// da Yampi no período (corpo vazio no Supabase). O webhook grava a venda na
// hora; a tela compara o `n` com o anterior e só então pede o snapshot inteiro
// (`/api/trafego/vendas?fresh=1`). Sem isto as vendas só chegavam ao reabrir.
export async function GET(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const r = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  const n = await contarPagosDoEspelho(r.fromDate, r.toDate).catch(() => null);
  return NextResponse.json({ n }, { headers: { "Cache-Control": "no-store" } });
}
