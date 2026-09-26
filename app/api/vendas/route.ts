import { NextRequest, NextResponse } from "next/server";
import { buildVendasSnapshot, type VendasSnapshot } from "@/lib/vendas";
import { previousRange, resolvePeriod } from "@/lib/period";
import { getProfile } from "@/lib/require-auth";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { cached, invalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";

// Cache em memória por período. Usa o `cached` comum em vez de um Map local:
// ele tem teto de entradas (o Map daqui crescia sem limite, uma chave por
// período já pedido) e compartilha a MESMA Promise entre chamadas concorrentes
// — cinco pessoas abrindo o painel no mesmo minuto numa instância fria
// disparavam cinco montagens completas; agora quatro esperam a primeira.
const TTL = 60_000;

// GET /api/vendas?period=…&from&to — canais de venda. Acessível a quem tem Analytics.
export async function GET(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const keys = await resolveMyModuleKeys(profile);
  if (!keys.includes("analytics")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const sp = new URL(req.url).searchParams;
  const range = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  const ckey = `${range.fromDate}_${range.toDate}`;
  // ?fresh=1 → botão "atualizar agora" da tela: derruba a entrada e remonta.
  const chave = `vendas:${ckey}`;
  if (sp.get("fresh") === "1") invalidate(chave);
  try {
    const data = await cached(chave, TTL, () => buildVendasSnapshot(range));
    // ?comparar=1 → a faixa de resumo do Analytics. Monta o período ANTERIOR e
    // devolve só as manchetes dele: o snapshot inteiro traria ranking, séries e
    // origens que ninguém compara linha a linha, e dobraria a resposta à toa.
    // A montagem extra também é cacheada, então quem abre a tela duas vezes no
    // mesmo minuto paga uma só.
    if (sp.get("comparar") === "1") {
      const prev = previousRange(range);
      const ant = await cached(`vendas:prev:${prev.fromDate}_${prev.toDate}`, TTL, () => buildVendasSnapshot(prev));
      const anterior = {
        revenue: ant.geral.revenue, count: ant.geral.count,
        comercial: ant.comercial.total.revenue,
        paid: ant.marketing.paid.revenue,
        organic: ant.marketing.organic.revenue,
        marketplace: ant.marketplace.total.revenue,
        spend: ant.marketing.spend, roas: ant.marketing.roas,
      };
      return NextResponse.json({ ...data, anterior }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "failed_to_load_vendas", detail: String(e) }, { status: 500 });
  }
}
