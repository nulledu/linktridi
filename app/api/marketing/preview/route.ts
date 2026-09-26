import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { cached } from "@/lib/cache";
import { previewDoAnuncio, ehAdId } from "@/lib/meta-preview";
import { adIdDoCodigo } from "@/lib/marketing-desempenho";

export const dynamic = "force-dynamic";

const BR = 3 * 3600 * 1000;
const somaDias = (n: number) => new Date(Date.now() - BR + n * 86_400_000).toISOString().slice(0, 10);

// GET /api/marketing/preview?adId=<id>  ou  ?codigo=JL-001
// Devolve o `src` do iframe de prévia da Meta — é assim que o vídeo do criativo
// aparece dentro do Gaius sem baixar nem hospedar arquivo nenhum.
//
// Ver a prévia é ver o CRIATIVO, não o dinheiro: basta a área "marketing"
// (mesma coisa que a lista já mostra). Nada de gasto/ROAS sai por aqui.
// Também abre pra quem analisa tráfego: o Tridify mostra o anúncio da Meta ao
// lado da peça da biblioteca, e quem só tem tráfego tomava 403 aqui.
export async function GET(req: NextRequest) {
  if (!(await getProfileForAnyModule("marketing:ver", "marketing:desempenho", "marketing:criar", "trafego:analisar"))) {
    return NextResponse.json({ ok: false, error: "sem_permissao" }, { status: 403 });
  }
  const q = req.nextUrl.searchParams;
  const adIdDireto = (q.get("adId") || "").trim();
  const codigo = (q.get("codigo") || "").trim().slice(0, 20);

  try {
    // Sem adId explícito, acha pelo código no nome do anúncio (últimos 180 dias
    // — criativo bom fica no ar bem mais que um trimestre).
    const adId = ehAdId(adIdDireto)
      ? adIdDireto
      : codigo ? await cached(`marketing:adid:${codigo}`, 600_000, () => adIdDoCodigo(codigo, somaDias(-180))) : null;
    if (!adId) return NextResponse.json({ ok: true, src: null, motivo: "sem_anuncio" });

    // A prévia é um token assinado com validade; 10 min de cache evita bater no
    // Graph a cada abertura do player sem servir link vencido.
    const p = await cached(`marketing:preview:${adId}`, 600_000, () => previewDoAnuncio(adId));
    if (!p) return NextResponse.json({ ok: true, src: null, motivo: "sem_preview" });
    return NextResponse.json({ ok: true, ...p, adId });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "preview_error" }, { status: 500 });
  }
}
