import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/datasource";
import { getProfileForModule } from "@/lib/require-auth";
import { panelConfigSchema } from "@/lib/config-schema";
import { cached, invalidate } from "@/lib/cache";
import { avisarTv } from "@/lib/tv-sinal";

export const dynamic = "force-dynamic";

// GET /api/config — leitura pública (tv-app aplica tema, metas, sons).
// Cache de 60s: o painel de TV relê isto a cada 30 segundos, 24 horas por dia
// (numa TV `document.hidden` nunca é `true`, então não há pausa que valha), e a
// configuração muda uma vez por mês. O `/api/sales` ao lado já fazia o mesmo.
export async function GET() {
  try {
    const config = await cached("panel:config", 60_000, () => getDataSource().getConfig());
    return NextResponse.json(config, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: "failed_to_load_config", detail: String(e) },
      { status: 500 }
    );
  }
}

// PUT /api/config — escrita de quem tem a seção "Painéis" em Configurações.
// Era `role === "admin"`: o admin ligava a sub-permissão `administracao:paineis`,
// a seção aparecia na tela e todo salvamento voltava 403.
export async function PUT(req: NextRequest) {
  if (!(await getProfileForModule("administracao:paineis"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = panelConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_config", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  try {
    const saved = await getDataSource().setConfig(parsed.data);
    invalidate("panel:config");     // senão o admin salva e continua vendo o antigo
    // As TVs (e o /painel aberto no navegador) recebem o cutucão e recarregam
    // o layout na hora, em vez de esperar o poll de reserva.
    await avisarTv("config");
    return NextResponse.json(saved);
  } catch (e) {
    return NextResponse.json(
      { error: "failed_to_save_config", detail: String(e) },
      { status: 500 }
    );
  }
}
