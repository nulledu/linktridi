import { NextRequest, NextResponse } from "next/server";
import { limparSelfies } from "@/lib/ponto";
import { avisarProblemasDoPonto } from "@/lib/ponto-avisos";
import { lancarIntervalos } from "@/lib/ponto-intervalos";

export const dynamic = "force-dynamic";

// Cron da Vercel manda Bearer CRON_SECRET. Sem secret = recusa (fail-closed).
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail-closed: sem CRON_SECRET ninguém passa
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Apaga as selfies de auditoria antigas (mantém o registro da batida). Regra:
// no máx. 100 por pessoa + nada com mais de 45 dias. Foto de perfil e de
// cadastro não são tocadas. Roda 1x/dia — e manda o aviso de ponto do RH.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await limparSelfies();
  // Pega carona no mesmo cron diário (03:00 SP) em vez de abrir outro: avisa o
  // RH dos dias estranhos de ontem. Falha aqui não desfaz a limpeza.
  // Intervalos automáticos dos últimos 7 dias (idempotente) — rede de segurança
  // do lançamento que o pull do tablet faz na hora.
  const de = new Date(Date.now() - 3 * 3600e3 - 7 * 86400e3).toISOString().slice(0, 10);
  const intervalos = await lancarIntervalos({ de }).catch((e) => ({ erro: String((e as Error)?.message || e) }));
  const avisos = await avisarProblemasDoPonto().catch((e) => ({ erro: String((e as Error)?.message || e) }));
  return NextResponse.json({ ...r, intervalos, avisos });
}
