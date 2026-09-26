import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { historicoDaCaixa, ocupacaoDaCaixa } from "@/lib/logistica-caixa";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

// GET /api/logistica/caixa?numero=138[&fase=agora|historico]
//
// Duas fases porque as duas perguntas têm custos MUITO diferentes:
//   · fase=agora      → quem está com a caixa neste momento. Consulta indexada
//                       em `pedidos`, responde em milissegundos. É a pergunta
//                       urgente ("cadê o pedido?") e resolve quase sempre.
//   · fase=historico  → por onde a caixa andou. Varre o log de texto do ERP,
//                       que não tem índice e chega a esbarrar no timeout de 8s.
// Antes as duas vinham juntas, então a resposta rápida ficava refém da lenta.
//
// Mesmo portão da PÁGINA de logística: quem tem o módulo vê.
export async function GET(req: NextRequest) {
  if (!(await getProfileForModule("logistica"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const numero = (url.searchParams.get("numero") ?? "").replace(/\D/g, "");
  const fase = url.searchParams.get("fase") ?? "historico";
  if (!numero) return NextResponse.json({ error: "numero_invalido" }, { status: 422 });

  try {
    if (fase === "agora") {
      const data = await cached(`logi:caixa:agora:${numero}`, 30_000, () => ocupacaoDaCaixa(numero));
      return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
    }
    // O histórico de uma caixa muda pouco e custa caro: a segunda pessoa que
    // procurar o mesmo número dentro de 10 min recebe sem tocar no ERP.
    const data = await cached(`logi:caixa:hist:${numero}`, 10 * 60_000, () => historicoDaCaixa(numero));
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "falha_ao_ler_historico", detail: String(e) }, { status: 500 });
  }
}
