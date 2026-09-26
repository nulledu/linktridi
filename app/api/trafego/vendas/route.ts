import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { resolvePeriod } from "@/lib/period";
import { snapshotVendas } from "@/lib/trafego-vendas";
import { setCustos, setMetas, type CustosConfig, type MetasConfig } from "@/lib/marketing-config";

export const dynamic = "force-dynamic";
// Sem isto, o default (10s sem fluid compute) matava a rota no meio quando o
// gasto vinha do Graph — e Lucro + cards Yampi ficavam em "Carregando" eternos.
export const maxDuration = 60;

// GET /api/trafego/vendas?period=... — vendas REAIS do ERP + lucro (estilo Utmify).
export async function GET(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const r = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  try {
    // `fresh=1`: mesmo contrato do /api/trafego/overview — é o botão "Atualizar"
    // da tela dizendo "refaz agora", e não mais um poll qualquer chegando.
    const fresh = sp.get("fresh") === "1";
    return NextResponse.json(await snapshotVendas(r.fromDate, r.toDate, { recalcular: fresh }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}

// PUT /api/trafego/vendas — salva o modelo de custos (produto/imposto/gateway/fixo).
export async function PUT(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Partial<CustosConfig>;
  const custos: CustosConfig = {
    produtoPct: Math.max(0, Math.min(100, Number(b.produtoPct) || 0)),
    impostoPct: Math.max(0, Math.min(100, Number(b.impostoPct) || 0)),
    gatewayPct: Math.max(0, Math.min(100, Number(b.gatewayPct) || 0)),
    custoFixo: Math.max(0, Number(b.custoFixo) || 0),
  };
  try { await setCustos(custos); return NextResponse.json({ ok: true, custos }); }
  catch (e) { return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 }); }
}

// PATCH /api/trafego/vendas — salva as METAS (ROAS/CPA/faturamento/lucro).
export async function PATCH(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Partial<MetasConfig>;
  const metas: MetasConfig = {
    roas: Math.max(0, Number(b.roas) || 0),
    cpa: Math.max(0, Number(b.cpa) || 0),
    faturamento: Math.max(0, Number(b.faturamento) || 0),
    lucro: Math.max(0, Number(b.lucro) || 0),
    investimento: Math.max(0, Number(b.investimento) || 0),
    vendas: Math.max(0, Number(b.vendas) || 0),
    margem: Math.max(0, Number(b.margem) || 0),
  };
  try { await setMetas(metas); return NextResponse.json({ ok: true, metas }); }
  catch (e) { return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 }); }
}
