// ── Cron do Gerenciador de Contingência ──────────────────────────────────────
// Uma vez por dia, de madrugada (vercel.json): grava o snapshot do dia com o
// consolidado atual. Assim o histórico tem uma linha por dia mesmo quando
// ninguém abriu a Atualização de Hoje — e "como estava ontem" nunca fica sem
// resposta.
//
// Mora FORA de `/api/marketing/contingencia` de propósito: lá toda rota exige
// sessão de uma pessoa. O cron é a máquina, autentica por `CRON_SECRET`, e o
// prefixo é público no middleware pelo mesmo motivo do `/api/financeiro-cron`.
//
// Custo: UMA invocação por dia.

import { NextRequest, NextResponse } from "next/server";
import { gravarSnapshot } from "@/lib/contingencia";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ erro: "unauthorized" }, { status: 401 });
  try {
    const c = await gravarSnapshot("cron", "Cron da Contingência");
    if (!c) return NextResponse.json({ ok: false, erro: "schema da contingência pendente" }, { status: 503 });
    return NextResponse.json({ ok: true, dia: c.geradoEm, numeros: c.numeros.total, celulares: c.celulares.total });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as { message?: string })?.message || "cron_error" }, { status: 500 });
  }
}
