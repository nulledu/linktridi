import { NextRequest, NextResponse } from "next/server";
import { marketDb } from "../../tridimarket/_shared";
import { reivindicarJob } from "../../../../lib/tridimarket/notas";
import { workerAutorizado } from "../_auth";

export const dynamic = "force-dynamic";

// O worker chama isto num loop. Sem trabalho → 204 (ele espera e tenta de novo).
// Com trabalho → o job + uma URL assinada de 5 min pra baixar a imagem.
export async function POST(req: NextRequest) {
  if (!workerAutorizado(req)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const pego = await reivindicarJob(marketDb());
    if (!pego) return new NextResponse(null, { status: 204 });
    return NextResponse.json({ ok: true, data: pego });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "worker_claim_error" }, { status: 500 });
  }
}
