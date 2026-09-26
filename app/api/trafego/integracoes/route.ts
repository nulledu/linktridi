import { NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { describeConnections } from "@/lib/meta-tokens";

export const dynamic = "force-dynamic";

// Status das integrações. Meta é REAL (contas conectadas via token). As demais
// plataformas ficam "prontas" quando as credenciais (env) estiverem presentes —
// scaffold pronto pra ativar sem mexer na UI.
const env = (k: string) => !!(process.env[k] && String(process.env[k]).trim());

export async function GET() {
  if (!(await getProfileForModule("trafego"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let metaContas = 0;
  try { metaContas = (await describeConnections()).length; } catch { /* sem tabela → 0 */ }
  const pronto = (ok: boolean) => (ok ? "pronto" : "requer_credenciais");
  return NextResponse.json({
    integracoes: {
      // oauth = mostra o botão "Entrar com o Facebook". TEM que casar com o
      // segredo que o backend lê (OAUTH_APP_SECRET = META_ADS_SECRET || META_AUTH
      // em lib/meta-tokens.ts). Antes checava só META_AUTH: quem seguia a própria
      // instrução do modal (setar META_ADS_SECRET) nunca via o botão e ficava
      // preso no "colar token manual" achando que "não dá pra logar".
      meta: { status: metaContas > 0 ? "conectado" : "disponivel", contas: metaContas, oauth: env("META_ADS_SECRET") || env("META_AUTH") },
      google: { status: pronto(env("GOOGLE_ADS_CLIENT_ID") && env("GOOGLE_ADS_CLIENT_SECRET")) },
      tiktok: { status: pronto(env("TIKTOK_APP_ID") && env("TIKTOK_APP_SECRET")) },
      kwai: { status: pronto(env("KWAI_CLIENT_ID") && env("KWAI_CLIENT_SECRET")) },
      taboola: { status: pronto(env("TABOOLA_CLIENT_ID") && env("TABOOLA_CLIENT_SECRET")) },
      ga4: { status: pronto(env("GA4_PROPERTY_ID")) },
      whatsapp: { status: "disponivel" },
      webhooks: { status: "disponivel" },
      pixel: { status: "disponivel" },
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
