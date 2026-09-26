import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { getMarketingConfig, setTagLabels } from "@/lib/marketing-config";

export const dynamic = "force-dynamic";

// Nomes amigáveis das tags de campanha (ex.: "{SM-8660}" → "Dia das Mães").
// Acesso: quem usa o módulo Tráfego Pago (admin + gestor de tráfego).

export async function GET() {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cfg = await getMarketingConfig();
  return NextResponse.json({ tagLabels: cfg.tagLabels }, { headers: { "Cache-Control": "no-store" } });
}

// PUT body: { tagLabels: { [rawTag]: label } } — substitui o mapa inteiro.
export async function PUT(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: { tagLabels?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const labels: Record<string, string> = {};
  if (body.tagLabels && typeof body.tagLabels === "object") {
    for (const [k, v] of Object.entries(body.tagLabels as Record<string, unknown>)) {
      const nome = typeof v === "string" ? v.trim().slice(0, 60) : "";
      if (nome) labels[k] = nome;   // vazio = remove o apelido
    }
  }
  try {
    await setTagLabels(labels);
    return NextResponse.json({ ok: true, tagLabels: labels });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}
