import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/require-auth";
import { getMarketingConfig, setFontes, ehPlataformaMarketplace, type FonteTipo } from "@/lib/marketing-config";
import { snapshotVendas, limparCacheVendas } from "@/lib/trafego-vendas";

export const dynamic = "force-dynamic";

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const hoje = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const diasAtras = (n: number) => new Date(Date.now() - 3 * 3600 * 1000 - n * 86_400_000).toISOString().slice(0, 10);
const TIPOS: FonteTipo[] = ["trafego", "comercial", "organico", "marketplace", "ignorar"];

// Lista as origens de venda encontradas no período (com quanto cada uma trouxe)
// + como cada uma está classificada hoje.
export async function GET(req: NextRequest) {
  await requireModule("trafego");
  const q = req.nextUrl.searchParams;
  const de = DIA.test(q.get("de") ?? "") ? q.get("de")! : diasAtras(90);
  const ate = DIA.test(q.get("ate") ?? "") ? q.get("ate")! : hoje();
  try {
    const v = await snapshotVendas(de, ate);
    return NextResponse.json({
      ok: true,
      data: {
        de, ate,
        fontes: v.fontesResumo,
        trafegoValor: v.trafegoValor, organicoValor: v.organicoValor,
        marketplaceValor: v.marketplaceValor,
        comercialValor: v.comercialValor, comercialPedidos: v.comercialPedidos,
        faturamentoEmpresa: v.faturamentoEmpresa, faturamentoTrafego: v.faturamentoTrafego,
      },
    });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "fontes_error" }, { status: 500 });
  }
}

// Salva a classificação das origens.
export async function PATCH(req: NextRequest) {
  await requireModule("trafego");
  const corpo = await req.json().catch(() => null) as { fontes?: Record<string, string> } | null;
  const entradas = Object.entries(corpo?.fontes ?? {});
  if (!entradas.length) return NextResponse.json({ ok: false, error: "sem_fontes" }, { status: 422 });
  const limpo: Record<string, FonteTipo> = {};
  for (const [chave, tipo] of entradas) {
    if (typeof chave !== "string" || !chave) continue;
    if (!TIPOS.includes(tipo as FonteTipo)) continue;
    // Marketplace não se escolhe aqui: é a plataforma do pedido (Shopee, ML,
    // TikTok). Nem grava outra origem como marketplace, nem grava por cima de
    // uma que é — `tipoDaFonte` ignoraria as duas, e o salvo só confundiria.
    if (tipo === "marketplace") continue;
    if (/^plat:\d+$/.test(chave) && ehPlataformaMarketplace(Number(chave.slice(5)))) continue;
    limpo[chave.slice(0, 120)] = tipo as FonteTipo;
  }
  try {
    // Mescla com o que já existe: a tela manda só o que está na tela, e um
    // período curto não pode apagar a classificação de origem antiga.
    const cur = await getMarketingConfig();
    await setFontes({ ...(cur.fontes ?? {}), ...limpo });
    limparCacheVendas();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "fontes_save_error" }, { status: 500 });
  }
}
