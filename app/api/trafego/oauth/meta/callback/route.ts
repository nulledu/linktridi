import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { addToken, OAUTH_APP_ID, OAUTH_APP_SECRET } from "@/lib/meta-tokens";

export const dynamic = "force-dynamic";

// Callback do login com Facebook: troca o code por token e guarda (addToken
// faz o long-lived + valida + persiste). Volta pro Tráfego com o resultado.
// Usa o mesmo app dedicado ao OAuth (META_AUTH_APP_ID + META_AUTH) da rota /start.
const GRAPH = "https://graph.facebook.com/v21.0";

export async function GET(req: NextRequest) {
  if (!(await getProfileForModule("trafego"))) return NextResponse.redirect(new URL("/central", req.url));
  const sp = req.nextUrl.searchParams;
  const back = (q: string) => NextResponse.redirect(new URL(`/trafego?${q}`, req.url));

  if (sp.get("error")) return back("erro=meta_negado");
  const code = sp.get("code"), state = sp.get("state");
  const cookieState = req.cookies.get("meta_oauth_state")?.value;
  if (!code || !state || state !== cookieState) return back("erro=meta_state");

  if (!OAUTH_APP_SECRET) return back("erro=meta_sem_secret");
  const redirect = `${req.nextUrl.origin}/api/trafego/oauth/meta/callback`;

  try {
    const r = await fetch(`${GRAPH}/oauth/access_token?client_id=${OAUTH_APP_ID}&redirect_uri=${encodeURIComponent(redirect)}&client_secret=${OAUTH_APP_SECRET}&code=${encodeURIComponent(code)}`, { cache: "no-store" });
    const j = (await r.json()) as { access_token?: string; error?: { message?: string } };
    // Sem token: mostra o MOTIVO real da Meta (redirect_uri não registrado,
    // secret errado, escopo negado…) em vez de um "meta_token" genérico —
    // senão o diagnóstico do login vira adivinhação.
    if (!j.access_token) return back(`erro=meta_token&msg=${encodeURIComponent((j.error?.message || "sem access_token").slice(0, 160))}`);
    const add = await addToken(j.access_token);       // long-lived + valida + guarda
    // Falhou: manda o motivo REAL da Meta em `msg` (a tela traduz pra uma
    // instrução acionável). Sem isso o usuário via só "não foi possível" e a
    // conexão sumia sem explicar que faltou permissão de anúncios.
    const res = back(add.ok ? "conectado=meta" : `erro=meta_add&msg=${encodeURIComponent((add.error || "").slice(0, 200))}`);
    res.cookies.delete("meta_oauth_state");
    return res;
  } catch {
    return back("erro=meta_falha");
  }
}
