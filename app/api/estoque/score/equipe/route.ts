import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfileForModule } from "@/lib/require-auth";
import { scoreDe } from "@/lib/estoque-qualidade";
import { schemaDesatualizado } from "@/lib/estoque-unidades-gerar";

export const dynamic = "force-dynamic";

// Teto da leitura. A regra da casa é que toda listagem tem `.limit()`; aqui ele
// vale por outro motivo também: o recorte da tela é hoje/7d/30d, e um `desde`
// sempre acompanha a chamada. Sem teto, mudar o filtro pra 30 dias arrastaria o
// histórico inteiro do QC pra dentro de uma tela de resumo.
const LIMITE = 4000;

/**
 * GET /api/estoque/score/equipe?desde=<iso>
 *
 * A qualidade de TODO MUNDO numa ida só. A rota irmã (`/api/estoque/score`)
 * responde por uma pessoa, e é o que a ficha individual usa; a tela de
 * produtividade precisa da tabela inteira — vinte pessoas seriam vinte
 * requisições por recorte, cada uma uma invocação cobrada, e o filtro muda de
 * "hoje" pra "30 dias" com um clique.
 *
 * O corpo é enxuto de propósito: um objeto id → contagem. Nem defeitos, nem
 * datas, nem a conferência em si — nada disso a tela desenha.
 *
 * Sempre a área "colaboradores", nunca papel: é dado sobre o trabalho DOS
 * OUTROS, a mesma porta de `/api/colaboradores/[id]/metricas`. Não existe o
 * caso "ver o meu" aqui — quem quer o próprio score abre a própria ficha.
 */
export async function GET(req: NextRequest) {
  if (!(await getProfileForModule("colaboradores"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const desde = req.nextUrl.searchParams.get("desde");
  const db = createSupabaseAdminClient();
  let query = db
    .from("estoque_conferencias")
    .select("executor_id,resultado")
    .order("conferido_em", { ascending: false })
    .limit(LIMITE);
  if (desde) query = query.gte("conferido_em", desde);

  const { data, error } = await query;
  // Sem a tabela (o QC ainda não foi ligado neste ambiente) a resposta é um
  // mapa vazio, não um 500: a tela sabe desenhar "sem conferências", e um erro
  // aqui apagaria os números de produtividade que nada têm a ver com o QC.
  if (error && schemaDesatualizado(error)) return NextResponse.json({ porPessoa: {} });
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });

  const linhas = (data ?? []) as { executor_id: string | null; resultado: string }[];
  const agrupado = new Map<string, { resultado: string; defeitos: string[] }[]>();
  for (const c of linhas) {
    if (!c.executor_id) continue;
    const atual = agrupado.get(c.executor_id);
    const item = { resultado: c.resultado, defeitos: [] };
    if (atual) atual.push(item);
    else agrupado.set(c.executor_id, [item]);
  }

  const porPessoa: Record<string, { acerto: number | null; total: number; certos: number; errados: number }> = {};
  for (const [id, cs] of agrupado) {
    const s = scoreDe(cs);
    porPessoa[id] = { acerto: s.taxaAcerto, total: s.total, certos: s.certos, errados: s.errados };
  }

  return NextResponse.json({ porPessoa });
}
