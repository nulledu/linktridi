import { NextRequest, NextResponse } from "next/server";
import { audit, marketApiError, marketRepository, requireMarketAdmin, scoreInput } from "../_shared";

export const dynamic = "force-dynamic";

// Define o score de um funcionário. `score` número = nota do gestor (congela o
// automático); `score` null = voltar ao automático. Sem a tabela
// market_pessoa_score (SQL pendente), devolve erro claro.
export async function POST(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const parsed = scoreInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_score", issues: parsed.error.flatten() }, { status: 422 });
  try {
    const repo = marketRepository();
    const result = await repo.setScore(parsed.data.employeeId, parsed.data.score, actor.id);
    await audit(actor.id, "score.set", "employee", parsed.data.employeeId, undefined, { score: parsed.data.score });
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const e = error as { message?: string };
    if (/market_pessoa_score/i.test(e?.message ?? "")) {
      return NextResponse.json({ ok: false, error: "migracao_pendente", action: "rodar supabase/tridimarket-ajustes-score.sql" }, { status: 503 });
    }
    return marketApiError(error);
  }
}
