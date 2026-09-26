import { NextRequest, NextResponse } from "next/server";
import { refreshAllTokens } from "@/lib/meta-tokens";

export const dynamic = "force-dynamic";

// Cron da Vercel manda Bearer CRON_SECRET. Sem secret = recusa (fail-closed).
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail-closed: sem CRON_SECRET ninguém passa
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Renova TODOS os perfis do Meta antes de expirar (rolling refresh). Token longo
// pode ser trocado por outro token longo enquanto válido — rodando semanalmente
// nunca deixa expirar. A lista de tokens fica na única linha meta_token (id=1).
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.META_APP_SECRET && !process.env.META_APP_SECRETS) return NextResponse.json({ error: "no_app_secret" }, { status: 500 });
  const r = await refreshAllTokens();
  return NextResponse.json(r);
}
