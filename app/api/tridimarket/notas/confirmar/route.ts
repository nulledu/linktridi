import { NextRequest, NextResponse } from "next/server";
import { audit, marketApiError, marketDb, notaConfirmInput, requireMarketAdmin } from "../../_shared";
import { confirmarNota } from "../../../../../lib/tridimarket/notas";

export const dynamic = "force-dynamic";

// A pessoa conferiu os itens; agora dá entrada no estoque com custo (lucro =
// preço − custo). Produtos novos são criados aqui.
export async function POST(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const parsed = notaConfirmInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_confirm", issues: parsed.error.flatten() }, { status: 422 });
  try {
    const r = await confirmarNota(marketDb(), parsed.data);
    await audit(actor.id, parsed.data.jobId ? "nota.confirm" : "nota.manual", "worker_job", parsed.data.jobId ?? "manual", undefined, { entrouEstoque: r.entrouEstoque, criados: r.criados });
    return NextResponse.json({ ok: true, data: r });
  } catch (error) { return marketApiError(error); }
}
