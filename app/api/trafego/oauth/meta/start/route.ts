import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { OAUTH_APP_ID, OAUTH_APP_SECRET } from "@/lib/meta-tokens";

export const dynamic = "force-dynamic";

// Início do login com Facebook (Meta Ads). Redireciona pro diálogo de OAuth.
// Usa o app dedicado ao OAuth (META_AUTH_APP_ID + META_AUTH), separado do app
// antigo usado noutro lugar do sistema.

export async function GET(req: NextRequest) {
  if (!(await getProfileForModule("trafego"))) return NextResponse.redirect(new URL("/central", req.url));
  if (!OAUTH_APP_SECRET) return NextResponse.redirect(new URL("/trafego?erro=meta_sem_secret", req.url));

  const redirect = `${req.nextUrl.origin}/api/trafego/oauth/meta/callback`;
  const state = crypto.randomUUID();
  // public_profile é a BASE do Facebook Login (id + nome). O fluxo novo de
  // "casos de uso" da Meta exige ela declarada junto — sem isso o diálogo
  // recusa. Não precisa de App Review: vem liberada por padrão em todo app.
  const scope = "public_profile,ads_read,ads_management,business_management";
  const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${OAUTH_APP_ID}&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent(scope)}&response_type=code&state=${state}`;

  const res = NextResponse.redirect(url);
  res.cookies.set("meta_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return res;
}
