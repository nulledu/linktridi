import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { previousRange, resolvePeriod } from "@/lib/period";
import { buildAdsOverview } from "@/lib/meta-ads";
import { resumoDoOverview, tridifyKpis } from "@/lib/analytics-trafego";
import { snapshotVendas } from "@/lib/trafego-vendas";

export const dynamic = "force-dynamic";
// Igual à rota do Tridify: o caminho `fresh` recalcula a partir do warehouse e
// leva alguns segundos. Com o teto padrão de 10s ele morria no meio e a tela
// ficava em "sincronizando" pra sempre.
export const maxDuration = 60;

/**
 * GET /api/analytics/trafego?period=&from=&to= — resumo do tráfego pago.
 *
 * Mesmo cache do Tridify (`buildAdsOverview`), payload de resumo. A tela do
 * Analytics não precisa de campanhas, conjuntos, anúncios e criativos, que são
 * a maior parte do panorama cru.
 *
 * O gate é `trafego` e não `analytics` de propósito: é a MESMA chave que faz a
 * aba aparecer no `page.tsx`. Gate de página e gate de rota fora de sincronia é
 * como quem tem cargo entra na tela e recebe erro em tudo que ela busca.
 */
export async function GET(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const r = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  const fresh = sp.get("fresh") === "1";

  try {
    // `semBloquear` fora do `fresh`: a tela NUNCA espera a Meta. Sem cache ela
    // recebe `{ sincronizando: true }` na hora e pede o recálculo — o mesmo
    // contrato da rota do Tridify.
    const d = await buildAdsOverview(r.fromDate, r.toDate, r.label, { recalcular: fresh, semBloquear: !fresh });
    if (!d) {
      return fresh
        ? NextResponse.json({ error: "sem_contas" }, { status: 200 })
        : NextResponse.json({ sincronizando: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }
    // Os cartões do Tridify, do MESMO snapshot que ele lê (cache compartilhado).
    // Falhar aqui não derruba a aba: sem eles ela mostra só a régua da Meta.
    const ant = previousRange(r);
    const [tri, triAnt] = await Promise.all([
      snapshotVendas(r.fromDate, r.toDate).catch(() => null),
      snapshotVendas(ant.fromDate, ant.toDate).catch(() => null),
    ]);
    const resumo = resumoDoOverview(d);
    if (tri) {
      // A série para no dia de hoje: o ERP devolve pedido com data do dia
      // seguinte depois das 21h (ver lib/painel-tridify.ts).
      const doDia = new Map(tri.serieDia.map((x) => [x.d, x.trafego]));
      resumo.tridify = {
        atual: tridifyKpis(tri),
        anterior: triAnt && triAnt.gasto > 0 ? tridifyKpis(triAnt) : null,
        serie: r.days.filter((day) => day <= r.toDate).map((day) => ({ day, faturamento: Math.round(doDia.get(day) ?? 0) })),
      };
    }
    return NextResponse.json(resumo, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}
