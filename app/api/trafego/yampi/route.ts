import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/require-auth";
import { resolvePeriod } from "@/lib/period";
import { yampiResumo } from "@/lib/yampi";
import { cached, invalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";

// O ERP legado é lento e instável (mediu 522 do Cloudflare e páginas de 6s num
// dia comum), e o mesmo período é pedido várias vezes: dois widgets no painel,
// recarga de aba, troca de loja. `cached` faz a 1ª chamada trabalhar e as
// próximas do TTL reaproveitarem — e chamadas SIMULTÂNEAS dividirem a mesma
// Promise, que é o caso do painel abrindo. `fresh=1` (botão "Atualizar") fura o
// cache: quem pediu dado novo tem que receber dado novo.
const TTL = 180_000;


// Vendas da Yampi no período. Mesmo gate do Tráfego (a tela vive dentro do
// Tridify) e o mesmo contrato de período das outras rotas: a tela manda
// `period=hoje|ontem|7d|30d|mes|custom` (+ from/to no custom), que é o que
// `periodQuery` da PeriodPicker gera. Ler `de`/`ate` aqui seria repetir o bug
// da rota da Vega, onde toda requisição caía no default e o card ignorava o
// período escolhido em cima.
//
// `loja` é opcional e filtra por `pedidos.qual_yampi`; sem ela, todas.
export async function GET(req: NextRequest) {
  await requireModule("trafego");
  const sp = req.nextUrl.searchParams;
  const range = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  try {
    const loja = sp.get("loja") || "";
    // A loja entra na chave: "Todas" e "Carimbos Tridi" são resumos diferentes.
    const chave = `yampi:${range.fromDate}:${range.toDate}:${loja}`;
    if (sp.get("fresh") === "1") invalidate(`yampi:${range.fromDate}:${range.toDate}`);
    const data = await cached(chave, TTL, () => yampiResumo(range.fromDate, range.toDate, loja));
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "yampi_error" }, { status: 500 });
  }
}
