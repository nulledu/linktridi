import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { cached } from "@/lib/cache";
import { estreiaDoCriativo, MAX_ANUNCIOS_ESTREIA } from "@/lib/meta-estreia";
import { ehAdId } from "@/lib/meta-preview";

export const dynamic = "force-dynamic";
// Varredura de tokens com prazo de 6 s por chamada à Meta: o teto padrão
// cortaria a resposta no meio no pior caso.
export const maxDuration = 30;

const DOZE_HORAS = 12 * 60 * 60 * 1000;

// GET /api/trafego/criativos/estreia?ads=<id>,<id>
// Quando o criativo subiu na Meta pela primeira vez (regra em lib/meta-estreia.ts).
// A data de um conjunto de anúncios não muda, então o servidor guarda 12 h —
// só a resposta boa: "não sei" (sem token, Meta fora do ar) não fica presa no
// cache, a próxima abertura do criativo pergunta de novo.
export async function GET(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const ids = [...new Set((req.nextUrl.searchParams.get("ads") ?? "").split(",").map((id) => id.trim()).filter(ehAdId))]
    .slice(0, MAX_ANUNCIOS_ESTREIA);
  if (!ids.length) return NextResponse.json({ error: "invalid_params" }, { status: 400 });

  const estreia = await cached(`estreia:${[...ids].sort().join(",")}`, DOZE_HORAS, async () => {
    const e = await estreiaDoCriativo(ids);
    if (!e) throw new Error("sem_resposta");
    return e;
  }).catch(() => null);

  return estreia
    ? NextResponse.json(estreia, { headers: { "Cache-Control": "private, max-age=3600" } })
    : NextResponse.json({ em: null }, { headers: { "Cache-Control": "no-store" } });
}
