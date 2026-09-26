import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { getMarketingConfig, setMarketingConfig, type MarketingConfig, type ContaTipo } from "@/lib/marketing-config";

export const dynamic = "force-dynamic";

// GET — a config do Tráfego, MENOS as comissões.
//
// Duas correções aqui, as duas por causa da comissão por gestor:
//
//   1. Não havia portão nenhum. A rota devolvia o jsonb inteiro, e o jsonb
//      passou a guardar quanto cada gestor recebe: qualquer pessoa logada lia
//      o acordo dos outros por esta porta, sem precisar do módulo.
//   2. `comissoes` sai da resposta mesmo para quem tem o módulo. O valor de
//      cada acordo tem endereço próprio (`/api/trafego/comissoes`), que é onde
//      mora o recorte "admin vê todos, gestor vê só o dele". Devolver a lista
//      crua aqui furaria aquele recorte por fora.
export async function GET() {
  if (!(await getProfileForModule("trafego"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const { comissoes: _fora, ...cfg } = await getMarketingConfig();
    return NextResponse.json(cfg, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}

// PUT — quem tem a área Tráfego (é lá que moram as contas de anúncio).
// Body: { teto:number, contas:{ [id]: "carimbo"|"chancela" } }
export async function PUT(req: NextRequest) {
  if (!(await getProfileForModule("trafego"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { teto?: unknown; contas?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const teto = typeof body.teto === "number" && body.teto >= 0 ? Math.round(body.teto) : 0;
  const contas: Record<string, ContaTipo> = {};
  if (body.contas && typeof body.contas === "object") {
    for (const [id, v] of Object.entries(body.contas as Record<string, unknown>)) {
      if (v === "carimbo" || v === "chancela") contas[id] = v;
    }
  }
  // Preserva TUDO que é setado noutras abas e sobrescreve só o que esta rota
  // edita. Antes a config era remontada campo a campo, então salvar o teto
  // APAGAVA em silêncio o que não estivesse na lista — fontes, classificação,
  // peças, e agora as comissões dos gestores. Espalhar `atual` faz campo novo
  // sobreviver sozinho; enumerar exige lembrar deste arquivo toda vez.
  const atual = await getMarketingConfig();
  const cfg: MarketingConfig = { ...atual, teto, contas };
  try {
    await setMarketingConfig(cfg);
    // Salva tudo, devolve tudo MENOS as comissões — pelo mesmo motivo do GET.
    const { comissoes: _fora, ...visivel } = cfg;
    return NextResponse.json(visivel);
  } catch (e) {
    return NextResponse.json({ error: "failed_to_save", detail: String(e) }, { status: 500 });
  }
}
