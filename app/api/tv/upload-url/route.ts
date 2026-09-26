import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/require-auth";
import { assinarEnvioPublico } from "@/lib/armazenamento/publico";

export const dynamic = "force-dynamic";

const BUCKET = "apks";

/**
 * POST /api/tv/upload-url — devolve uma URL ASSINADA pro navegador subir o APK
 * DIRETO ao Storage do Supabase.
 *
 * Por que não passar o arquivo por uma rota Next: a função serverless da
 * Vercel tem teto de corpo ~4,5 MB, e o APK tem 24 MB — subir por aqui
 * falharia sempre. A URL assinada deixa o navegador mandar os 24 MB direto ao
 * Storage, sem passar pela função. O servidor só entrega a permissão e, depois,
 * grava o registro da versão (ação `publicar_versao`).
 */
export async function POST(req: NextRequest) {
  const me = await requireModule("frota");
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const path = `tv/${Date.now()}-${Math.random().toString(36).slice(2)}.apk`;
  try {
    // Sem tamanho no corpo: a tela da Frota não manda, então o B2 não amarra o
    // content-length aqui (quem pede já tem a chave `frota`).
    const { signedUrl, publicUrl } = await assinarEnvioPublico(path, null, BUCKET);
    return NextResponse.json({ signedUrl, path, publicUrl });
  } catch (e) {
    // Bucket ausente é o erro mais provável na primeira vez.
    return NextResponse.json(
      { error: "falha_upload_url", detail: String((e as Error)?.message || e), dica: "Confira as variáveis B2_PUBLICO_* (ou o bucket \"apks\" do Supabase, na reserva)." },
      { status: 500 },
    );
  }
}
