import { NextRequest, NextResponse } from "next/server";
import { limparAcessosAntigos } from "@/lib/lojas-analytics-db";

export const dynamic = "force-dynamic";

// ── Cron das lojas ───────────────────────────────────────────────────────────
// Uma vez por dia, de madrugada: poda o registro de acesso mais velho que 90
// dias.
//
// A poda não é faxina opcional. `loja_acessos` recebe uma linha por
// visualização de vitrine — é a tabela que mais cresce do banco, e ninguém abre
// relatório de acesso de cinco meses atrás. Sem a poda ela vira o maior objeto
// do banco e deixa lenta a agregação de TODO MUNDO, inclusive a dos últimos 7
// dias que o lojista abre toda manhã.
//
// Mora FORA de `/api/lojas` de propósito: lá toda rota exige a sessão de uma
// pessoa. O cron é a máquina falando — autentica por `CRON_SECRET`, igual ao
// `/api/financeiro-cron`, e o prefixo é público no middleware pelo mesmo motivo.
//
// Custo: UMA invocação por dia.

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;          // sem secret (dev) = liberado
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: "unauthorized" }, { status: 401 });
  const apagados = await limparAcessosAntigos(90);
  return NextResponse.json({ ok: true, apagados });
}
