// ── Folha · as SUGESTÕES do sistema, fora do caminho crítico ────────────────
// Comissão de tráfego, de marketplace e de vendas do mês — mais a
// materialização do bônus recorrente. Existe como rota própria porque essas
// três contas dependem do snapshot de vendas e da planilha do ERP: cada uma
// tem uma desistência de 2,5 s, e enfileiradas no render do servidor elas
// eram um piso de espera para uma tela que já tem tudo o que precisa para
// pintar. Agora a folha aparece primeiro e o número entra quando chega.
//
// Gate `financeiro:folha`, o mesmo do salário — a sugestão É o valor que a
// pessoa vai receber.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { empresasDoUsuario } from "@/lib/financeiro/db";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { podeComissaoDeVendas } from "@/lib/financeiro/folha-mensal";

export const dynamic = "force-dynamic";

const COMPETENCIA = /^\d{4}-\d{2}-01$/;

export async function GET(req: Request) {
  const eu = await apiFinanceiro("folha");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const competencia = searchParams.get("competencia") ?? "";
  if (!COMPETENCIA.test(competencia)) {
    return NextResponse.json({ erro: "Competência inválida — use AAAA-MM-01." }, { status: 400 });
  }
  const empresa = searchParams.get("empresa");

  // As pessoas do escopo, só com o que a sugestão precisa: o vínculo com o
  // ERP é o que casa a comissão com a pessoa da folha.
  const { dados: empresasDaPessoa } = await empresasDoUsuario(eu.profile.id);
  const permitidas = empresasDaPessoa.map((e) => e.id);
  const escopo = empresa ? permitidas.filter((id) => id === empresa) : permitidas;
  if (!escopo.length) return NextResponse.json({ comissaoSugerida: {}, comissaoMarketplaceSugerida: {}, comissaoVendasSugerida: {} });

  const { data } = await createSupabaseAdminClient()
    .from("fin_colaboradores").select("id,employee_id,setor").in("empresa_id", escopo).limit(400);
  const pessoas = (data ?? []) as { id: string; employee_id: string | null; setor: string | null }[];

  const mes = competencia.slice(0, 7);
  const [comissoes, mkt, vendas, bonus] = await Promise.all([
    import("@/lib/comissao-gestor-servidor").then((m) => m.comissoesPorPessoa(mes)).catch(() => ({} as Record<string, { valor: number | null }>)),
    import("@/lib/comissao-marketplace-servidor").then((m) => m.comissaoMarketplaceDoMes(mes)).catch(() => null),
    import("@/lib/comissao-vendas-servidor").then((m) => m.comissoesVendasPorPessoa(mes)).catch(() => ({} as Record<string, { valor: number }>)),
    // O bônus "todo mês" nasce aqui: a folha já pintou, e quando ele nascer a
    // tela recarrega os lançamentos (a resposta diz quantos foram criados).
    import("@/lib/financeiro/bonus-recorrente-servidor")
      .then((m) => m.materializarBonusRecorrente(escopo, competencia))
      .catch(() => ({ criados: 0, pendente: true })),
  ]);

  const comissaoSugerida: Record<string, number> = {};
  const comissaoMarketplaceSugerida: Record<string, number> = {};
  const comissaoVendasSugerida: Record<string, number> = {};
  for (const p of pessoas) {
    if (!p.employee_id) continue;
    const t = comissoes[p.employee_id]?.valor;
    if (typeof t === "number" && t > 0) comissaoSugerida[p.id] = t;
    if (mkt && p.employee_id === mkt.pessoaId && mkt.valor > 0) comissaoMarketplaceSugerida[p.id] = mkt.valor;
    // Só Design, Marketing e Comercial: a planilha credita quem ATENDEU o
    // pagamento, e o número nem viaja para os outros setores.
    const v = podeComissaoDeVendas(p.setor) ? vendas[p.employee_id]?.valor : undefined;
    if (typeof v === "number" && v > 0) comissaoVendasSugerida[p.id] = v;
  }

  return NextResponse.json(
    { comissaoSugerida, comissaoMarketplaceSugerida, comissaoVendasSugerida, bonusCriados: bonus.criados },
    { headers: { "Cache-Control": "no-store" } },
  );
}
