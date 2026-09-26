import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { describeConnections, addToken, removeToken, refreshAllTokens } from "@/lib/meta-tokens";

export const dynamic = "force-dynamic";

// Perfis do Facebook conectados (multi-token). Restrito a quem acessa o módulo
// Tráfego Pago (admin + gestor de tráfego). O token NUNCA sai nas respostas —
// só metadados (nome do perfil, contas, expiração).

// GET — lista os perfis conectados + as contas que cada um enxerga.
export async function GET() {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const connections = await describeConnections();
    return NextResponse.json({ connections }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}

// POST — conecta um perfil novo. Body: { token }. Valida no Graph antes de salvar.
export async function POST(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: { token?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const token = typeof body.token === "string" ? body.token : "";
  if (!token.trim()) return NextResponse.json({ error: "Cole um token do Facebook." }, { status: 400 });

  const r = await addToken(token);
  if (!r.ok) return NextResponse.json({ error: r.error || "Falha ao validar o token." }, { status: 400 });
  return NextResponse.json({ ok: true, profile: r.profile });
}

// PATCH — renova AGORA todos os tokens (rolling refresh). Mantém os perfis vivos
// sem esperar o cron semanal. Precisa do secret do app (META_APP_SECRET ou o mapa
// META_APP_SECRETS) no ambiente.
export async function PATCH() {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.META_APP_SECRET && !process.env.META_APP_SECRETS) return NextResponse.json({ error: "Falta o secret do app (META_APP_SECRET ou META_APP_SECRETS) no ambiente — não dá pra estender o token." }, { status: 400 });
  const r = await refreshAllTokens();
  return NextResponse.json(r);
}

// DELETE — remove um perfil. ?id=<id>
export async function DELETE(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const r = await removeToken(id);
  if (!r.ok) return NextResponse.json({ error: r.error || "Falha ao remover." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
