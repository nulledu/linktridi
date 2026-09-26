import { NextRequest, NextResponse } from "next/server";
import { marketApiError, marketDb, parseIntervalo, parseProfileIds, requireMarketAdmin } from "../../_shared";

export const dynamic = "force-dynamic";

// Movimento da carteira DENTRO de um período: quanto cada pessoa consumiu e
// quanto pagou entre `from` e `to`. O saldo em aberto é uma foto do AGORA e não
// muda com o período; isto responde à outra pergunta — "o que rolou nesse
// intervalo" — que é o que o gestor quer ao escolher hoje / 7 dias / um mês.
//
// Sai do razão imutável (market_ledger_entries), pela data em que o lançamento
// ocorreu (ocorrido_em), não a de gravação — uma compra offline que subiu dias
// depois conta no dia em que aconteceu.
export async function GET(req: NextRequest) {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const { de, ate } = parseIntervalo(req.url);
    const perfis = parseProfileIds(req.url);
    let q = marketDb()
      .from("lancamentos")
      .select("funcionario_id,unidade_id,tipo,valor,ocorrido_em")
      .gte("ocorrido_em", de)
      .lte("ocorrido_em", ate);
    if (perfis && perfis.length) q = q.in("unidade_id", perfis);
    const { data, error } = await q;
    if (error) throw error;

    // Agrupa por CADASTRO (employee_id + profile_id). O cliente soma os
    // cadastros de uma mesma pessoa quando ela tem conta em várias empresas.
    const porCadastro = new Map<string, { employeeId: number; profileId: string; consumed: number; paid: number }>();
    for (const linha of (data ?? []) as Array<{ funcionario_id: number; unidade_id: string; tipo: string; valor: number }>) {
      const chave = `${linha.funcionario_id}:${linha.unidade_id}`;
      const atual = porCadastro.get(chave) ?? { employeeId: Number(linha.funcionario_id), profileId: String(linha.unidade_id), consumed: 0, paid: 0 };
      const valor = Number(linha.valor) || 0;
      // Compra entra com valor positivo (dívida); pagamento com negativo. Aqui
      // ambos viram números POSITIVOS legíveis: consumido e pago no período.
      if (linha.tipo === "purchase") atual.consumed += valor;
      else if (linha.tipo === "payment") atual.paid += Math.abs(valor);
      porCadastro.set(chave, atual);
    }

    const movimento = [...porCadastro.values()].map((m) => ({
      ...m, consumed: Math.round(m.consumed * 100) / 100, paid: Math.round(m.paid * 100) / 100,
    }));
    const totalConsumido = movimento.reduce((s, m) => s + m.consumed, 0);
    const totalPago = movimento.reduce((s, m) => s + m.paid, 0);
    return NextResponse.json({ ok: true, data: { movimento, totalConsumido: Math.round(totalConsumido * 100) / 100, totalPago: Math.round(totalPago * 100) / 100 } });
  } catch (error) { return marketApiError(error); }
}
