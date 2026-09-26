import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { isProvider, callbackUrl, COOKIE_OAUTH_STATE } from "@/lib/marketplaces";

export const dynamic = "force-dynamic";

const PRAZO_TOKEN_MS = 15_000;

// Resposta que também apaga o cookie do state (uso único).
function semState<T extends NextResponse>(res: T): T {
  res.cookies.set(COOKIE_OAUTH_STATE, "", { path: "/api/marketplaces", maxAge: 0, httpOnly: true, sameSite: "lax" });
  return res;
}

// GET /api/marketplaces/<provider>/oauth/callback?code=...&state=...
// O marketplace redireciona aqui após o lojista autorizar. Trocamos o code por
// tokens e salvamos a conta. (ML implementado; Shopee/TikTok seguem o mesmo padrão.)
//
// Três portões antes de tocar no code: o provider existe, quem chega tem a
// MESMA permissão de quem inicia (administracao:marketplaces), e o `state`
// bate com o cookie httpOnly gravado no início — no MESMO navegador e pro
// MESMO provider. Sem o último, um link forjado amarrava ao sistema a conta
// de outra pessoa (CSRF de login).
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProvider(provider)) return NextResponse.json({ error: "provider" }, { status: 404 });
  if (!(await getProfileForModule("administracao:marketplaces"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const state = req.nextUrl.searchParams.get("state");
  const cookie = req.cookies.get(COOKIE_OAUTH_STATE)?.value ?? "";
  if (!state || cookie !== `${provider}.${state}`) {
    return semState(NextResponse.json({ error: "state_invalido" }, { status: 400 }));
  }
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return semState(NextResponse.json({ error: "sem_code" }, { status: 400 }));
  const db = createSupabaseAdminClient();

  try {
    if (provider === "mercado_livre") {
      const r = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "authorization_code", client_id: process.env.ML_CLIENT_ID || "", client_secret: process.env.ML_CLIENT_SECRET || "",
          code, redirect_uri: callbackUrl("mercado_livre"),
        }),
        signal: AbortSignal.timeout(PRAZO_TOKEN_MS),
      });
      const t = await r.json();
      if (!t.access_token) return semState(NextResponse.json({ error: "token" }, { status: 400 }));
      const { error } = await db.from("marketplace_contas").upsert({
        provider, external_shop_id: String(t.user_id), access_token: t.access_token, refresh_token: t.refresh_token,
        expires_at: new Date(Date.now() + (Number(t.expires_in) || 21600) * 1000).toISOString(), status: "conectado", updated_at: new Date().toISOString(),
      }, { onConflict: "provider,external_shop_id" });
      if (error) return semState(NextResponse.json({ error: "falha_ao_gravar" }, { status: 500 }));
      return semState(NextResponse.redirect(new URL("/administracao?mkt=conectado", req.url)));
    }
    // Shopee / TikTok: trocar code por token aqui (assinatura própria). Por ora,
    // registra o code p/ completar quando as credenciais estiverem ativas.
    const { error } = await db.from("marketplace_contas").upsert({ provider, external_shop_id: code.slice(0, 24), status: "erro", meta: { code, nota: "trocar code por token" }, updated_at: new Date().toISOString() }, { onConflict: "provider,external_shop_id" });
    if (error) return semState(NextResponse.json({ error: "falha_ao_gravar" }, { status: 500 }));
    return semState(NextResponse.redirect(new URL("/administracao?mkt=pendente", req.url)));
  } catch {
    return semState(NextResponse.json({ error: "falha" }, { status: 500 }));
  }
}
