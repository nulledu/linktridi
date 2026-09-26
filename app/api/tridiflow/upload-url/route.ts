import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { assinarEnvioPublico } from "@/lib/armazenamento/publico";
import { caminhoMidiaLT, classificarMidiaLT } from "@/lib/tridiflow-midia";

export const dynamic = "force-dynamic";

// Bucket PÚBLICO (B2, lib/armazenamento/publico.ts): mídia de bio link é
// pública por natureza — é exatamente o que o seguidor precisa ver sem login.

/**
 * POST /api/tridiflow/upload-url { mime, tamanho } → { signedUrl, publicUrl }
 *
 * URL ASSINADA pro editor do LinkTridi subir vídeo/GIF/foto DIRETO ao Storage.
 * Pela `/api/upload` o arquivo atravessa a função da Vercel, que corta o corpo
 * em ~4,5 MB — um vídeo de cartão não passaria. Aqui o servidor só confere e
 * dá a permissão; os bytes vão do navegador pro Storage sem pagar CPU nossa.
 *
 * Mesma regra de tipo/tamanho do editor (`classificarMidiaLT`), conferida de
 * novo aqui: a tela recusa pra poupar tempo, o servidor recusa pra valer.
 * Limite conhecido: a URL do Supabase não amarra o tamanho na assinatura
 * (quem pediu pra 1 MB consegue mandar mais, até o teto global do bucket). A
 * rota exige a chave de EDITAR o LinkTridi, então quem pede é colaborador com
 * permissão dada de propósito — não visitante.
 */
export async function POST(req: NextRequest) {
  // Mesma chave de todas as escritas do LinkTridi (ver app/api/tridiflow/bots).
  if (!(await getProfileForAnyModule("marketing", "tridiflow:linktridi"))) {
    return NextResponse.json({ error: "Enviar mídia do LinkTridi exige acesso ao Marketing." }, { status: 403 });
  }
  const b = (await req.json().catch(() => ({}))) as { mime?: string; tamanho?: number };
  const c = classificarMidiaLT(String(b.mime ?? ""), Number(b.tamanho ?? 0));
  if (!c.ok) return NextResponse.json({ error: c.erro }, { status: 400 });

  const path = caminhoMidiaLT(c.ext);
  try {
    const { signedUrl, publicUrl } = await assinarEnvioPublico(path, Number(b.tamanho), "photos", String(b.mime));
    return NextResponse.json({ signedUrl, publicUrl, tipo: c.tipo });
  } catch {
    return NextResponse.json({ error: "Não deu pra preparar o envio agora. Tente de novo em instantes." }, { status: 502 });
  }
}
