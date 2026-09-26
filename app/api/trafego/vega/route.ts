import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/require-auth";
import { resolvePeriod } from "@/lib/period";
import { vegaResumo } from "@/lib/vega";
import { leadsVega } from "@/lib/vega-leads";
import { cached, invalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";

// O ERP legado é lento e instável (mediu 522 do Cloudflare e páginas de 6s num
// dia comum), e o mesmo período é pedido várias vezes: dois widgets no painel,
// recarga de aba, troca de loja. `cached` faz a 1ª chamada trabalhar e as
// próximas do TTL reaproveitarem — e chamadas SIMULTÂNEAS dividirem a mesma
// Promise, que é o caso do painel abrindo. `fresh=1` (botão "Atualizar") fura o
// cache: quem pediu dado novo tem que receber dado novo.
const TTL = 180_000;


// Vendas da Vega Checkout no período. Mesmo gate do Tráfego (a tela vive dentro
// do Tridify).
//
// A tela manda `period=hoje|ontem|7d|30d|mes|custom` (+ from/to no custom), que
// é o que `periodQuery` da PeriodPicker gera. Esta rota lia `de`/`ate` — nomes
// que ninguém mandava —, então TODA requisição caía no default de 30 dias e a
// tela ignorava o período escolhido. Agora usa o mesmo `resolvePeriod` das
// outras rotas, que já fecha o dia em São Paulo.
export async function GET(req: NextRequest) {
  await requireModule("trafego");
  const sp = req.nextUrl.searchParams;
  const range = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  try {
    // Em paralelo: `resumo` é a venda (pedidos pagos do ERP + peças) e `leads`
    // é o que a Vega manda e NÃO é venda — carrinho abandonado e PIX pendente,
    // que as edge functions já gravam. `leads` vem null quando não dá pra ler,
    // e aí a tela some em vez de mostrar zero.
    const fresh = sp.get("fresh") === "1";
    const chave = `vega:${range.fromDate}:${range.toDate}`;
    if (fresh) invalidate(chave);
    const [resumo, leads] = await Promise.all([
      cached(chave, TTL, () => vegaResumo(range.fromDate, range.toDate)),
      cached(`${chave}:leads`, TTL, () => leadsVega(range.fromDate, range.toDate)).catch(() => null),
    ]);
    return NextResponse.json({ ok: true, data: { ...resumo, leads } });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "vega_error" }, { status: 500 });
  }
}
