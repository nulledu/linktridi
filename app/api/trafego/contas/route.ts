// Gasto, vendas e retorno POR CONTA DE ANÚNCIOS no período, com a BM de cada
// conta — a base do widget "BMs e contas" do painel.
//
// Números vêm do WAREHOUSE (meta_ad_insights_daily), não do Graph: a tabela de
// campanhas que o painel já tem corta em 300 linhas, então somar conta a conta
// no cliente daria um total menor que o KPI de gasto. Aqui a soma é de todas as
// linhas do período.
//
// O vínculo conta→BM vem do Graph (cache de 30 min em lib/meta-bm) porque não
// existe coluna de BM em lugar nenhum do nosso banco.
import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/require-auth";
import { resolvePeriod } from "@/lib/period";
import { porContaDoPeriodo } from "@/lib/meta-warehouse";
import { contasComBM } from "@/lib/meta-bm";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

export interface ContaLinha {
  id: string; nome: string;
  bmId: string; bmNome: string;
  spend: number; purchases: number; revenue: number; leads: number;
  clicks: number; impressions: number;
}

const SEM_BM = "sem-bm";

export async function GET(req: NextRequest) {
  await requireModule("trafego");
  const sp = req.nextUrl.searchParams;
  const range = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  try {
    // Cache curto por período: o painel refaz esta chamada a cada troca de
    // widget/tamanho, e o dado do warehouse só muda quando o sync roda.
    const linhas = await cached(`trafego:contas:${range.fromDate}:${range.toDate}`, 120_000, async () => {
      const [porConta, bms] = await Promise.all([
        porContaDoPeriodo(range.fromDate, range.toDate),
        contasComBM().catch(() => [] as Awaited<ReturnType<typeof contasComBM>>),
      ]);
      const info = new Map(bms.map((b) => [b.id, b]));
      return (porConta ?? []).map((c): ContaLinha => {
        const b = info.get(c.contaId);
        return {
          id: c.contaId,
          nome: b?.nome || `Conta ${c.contaId}`,
          bmId: b?.bmId || SEM_BM,
          bmNome: b?.bmNome || "Sem BM",
          spend: c.spend, purchases: c.purchases, revenue: c.revenue, leads: c.leads,
          clicks: c.clicks, impressions: c.impressions,
        };
      });
    });
    return NextResponse.json({ ok: true, data: { contas: linhas, de: range.fromDate, ate: range.toDate } });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "contas_error" }, { status: 500 });
  }
}
