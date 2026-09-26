import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { PROVIDERS, isProvider, providerConfigured, callbackUrl, webhookUrl, COOKIE_OAUTH_STATE, type Provider } from "@/lib/marketplaces";

export const dynamic = "force-dynamic";

// Portão = a sub-permissão "Marketplaces" de Configurações. Era o papel admin:
// a seção aparecia pra quem tinha o quadradinho e não carregava nada.
async function admin() { return getProfileForModule("administracao:marketplaces"); }

// GET /api/marketplaces — status de cada provider, contas e últimos pedidos.
export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createSupabaseAdminClient();
  let contas: unknown[] = [], pedidos: unknown[] = [];
  try { contas = (await db.from("marketplace_contas").select("id,provider,nome,external_shop_id,status,updated_at")).data ?? []; } catch { /* sem tabela */ }
  try { pedidos = (await db.from("marketplace_pedidos").select("id,provider,external_id,status,valor,comprador,criado_em").order("criado_em", { ascending: false, nullsFirst: false }).limit(40)).data ?? []; } catch { /* */ }
  const providers = (Object.keys(PROVIDERS) as Provider[]).map((p) => ({
    key: p, label: PROVIDERS[p].label, cor: PROVIDERS[p].cor,
    configurado: providerConfigured(p),         // credenciais (env) presentes?
    webhookUrl: webhookUrl(p), callbackUrl: callbackUrl(p),
    temOAuth: !!PROVIDERS[p].authorizeUrl,
  }));
  return NextResponse.json({ providers, contas, pedidos });
}

// POST /api/marketplaces  { provider } — inicia a conexão (devolve a URL de OAuth).
export async function POST(req: NextRequest) {
  if (!(await admin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const provider = String(b.provider || "");
  if (!isProvider(provider)) return NextResponse.json({ error: "provider" }, { status: 400 });
  if (!providerConfigured(provider)) return NextResponse.json({ error: "sem_credenciais", env: PROVIDERS[provider].env }, { status: 400 });
  const def = PROVIDERS[provider];
  const state = crypto.randomUUID();
  const url = def.authorizeUrl ? def.authorizeUrl(callbackUrl(provider), state) : null;
  const res = NextResponse.json({ authorizeUrl: url, state, instrucoes: url ? null : "Este marketplace conecta pelo painel do parceiro (link de autorização gerado lá)." });
  // O state fica amarrado a ESTE navegador: o callback só aceita o code se o
  // cookie bater (provider + state). Sem isso, um link forjado amarrava ao
  // sistema a conta de outra pessoa (CSRF de login).
  res.cookies.set(COOKIE_OAUTH_STATE, `${provider}.${state}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/api/marketplaces", maxAge: 10 * 60,
  });
  return res;
}
