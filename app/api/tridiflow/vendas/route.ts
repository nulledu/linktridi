import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { paginaDoMarketing } from "@/lib/tridiflow-db";
import { vendasDoProjeto, vendasDosProjetos, JANELA_VENDA_DIAS } from "@/lib/tridiflow-vendas";
import { identidadeDosBots } from "@/lib/tridiflow-db";

export const dynamic = "force-dynamic";

// Vendas REAIS atribuídas aos funis (ver lib/tridiflow-vendas.ts).
//   GET ?botId=…&dias=30 → detalhe de um projeto (lista de vendas + anúncios)
//   GET ?dias=30         → todos os projetos com sessão no período
//
// A base é cacheada por 5 min no servidor: cruza dois bancos e é a consulta
// mais cara do módulo. A tela busca uma vez ao abrir — nada de poll.
export async function GET(req: NextRequest) {
  const botId = req.nextUrl.searchParams.get("botId");
  // Resultados de um LinkTridi/Central (páginas do Marketing): quem tem a
  // área `marketing` vê os DELES; o resto segue pedindo a chave de analytics.
  const doMkt = botId ? await paginaDoMarketing(botId).catch(() => null) : null;
  if (!(await getProfileForAnyModule("tridiflow:analytics", ...(doMkt ? ["marketing"] : [])))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dias = Math.max(1, Math.min(180, Number(req.nextUrl.searchParams.get("dias")) || 30));

  try {
    if (botId) {
      const d = await vendasDoProjeto(botId, dias);
      return NextResponse.json({ ...d, janela: JANELA_VENDA_DIAS }, { headers: { "Cache-Control": "no-store" } });
    }
    const mapa = await vendasDosProjetos(dias);
    const nomes = await identidadeDosBots([...mapa.keys()]);
    const projetos = [...mapa.values()]
      .map((v) => ({ ...v, nome: nomes.get(v.botId)?.nome ?? "Projeto", url: nomes.get(v.botId)?.url ?? null }))
      .sort((a, b) => b.receita - a.receita || b.sessoes - a.sessoes);
    return NextResponse.json({ dias, janela: JANELA_VENDA_DIAS, projetos }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
