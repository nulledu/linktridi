import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { getMarketingConfig, setFonteVendas, FONTE_TRAFEGO_PADRAO } from "@/lib/marketing-config";
import { lojasYampi, limparCacheVendas } from "@/lib/trafego-vendas";

export const dynamic = "force-dynamic";

// GET /api/trafego/fonte-vendas — fonte atual + lojas disponíveis (qual_yampi).
export async function GET() {
  if (!(await getProfileForModule("trafego"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [cfg, lojas] = await Promise.all([getMarketingConfig(), lojasYampi()]);
  const atual = cfg.fonteTrafego || FONTE_TRAFEGO_PADRAO;
  // Garante que a fonte atual apareça na lista mesmo que não venha na amostra.
  const opcoes = [...new Set([atual, ...lojas])];
  return NextResponse.json({ atual, opcoes });
}

// POST /api/trafego/fonte-vendas  { fonte } — define a loja fonte do tráfego.
export async function POST(req: NextRequest) {
  if (!(await getProfileForModule("trafego"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: { fonte?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const fonte = (b.fonte || "").trim();
  if (!fonte) return NextResponse.json({ error: "fonte_obrigatoria" }, { status: 400 });
  await setFonteVendas(fonte);
  limparCacheVendas();
  return NextResponse.json({ ok: true, fonte });
}
