import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { guardarPublico } from "@/lib/armazenamento/publico";

export const dynamic = "force-dynamic";

// Foto de produto da loja. Rota PRÓPRIA em vez da `/api/upload` genérica por
// três motivos, e nenhum deles é organização:
//
//  1. Gate. A genérica exige só estar logado; foto de produto é catálogo, e
//     quem mexe em catálogo tem `lojas:produtos`.
//  2. Caminho. A genérica joga tudo na raiz do bucket com nome aleatório —
//     depois de mil produtos ninguém sabe o que é de quem, e apagar uma loja
//     não tem como levar as fotos dela junto.
//  3. Limites. Foto de produto é imagem e tem tamanho de imagem. A genérica
//     aceita qualquer tipo e qualquer tamanho porque serve o chat.
//
// O bucket é o `photos`, o mesmo do resto do sistema: bucket novo é bucket que
// alguém esquece de tornar público, e aí a vitrine nasce sem imagem.

const MAX_BYTES = 5_000_000;         // 5 MB — acima disso a vitrine fica lenta
const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/avif": "avif", "image/gif": "gif",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getProfileForAnyModule("lojas:produtos"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id: lojaId } = await params;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo recebido." }, { status: 400 });
  }
  // O tipo vem do navegador e não é prova de nada — mas recusar aqui evita o
  // caso comum (arrastar um PDF) sem precisar inspecionar bytes. O que de fato
  // protege é o bucket servir com o `content-type` que gravamos.
  if (!TIPOS.includes(file.type)) {
    return NextResponse.json({ error: "Envie uma imagem (JPG, PNG, WEBP ou GIF)." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Imagem muito grande (${(file.size / 1_000_000).toFixed(1)} MB). O limite é 5 MB.` },
      { status: 400 },
    );
  }

  // Caminho por loja: apagar a loja um dia pode levar a pasta junto, e dá pra
  // olhar o bucket e entender o que é de quem.
  const nome = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${EXT[file.type]}`;
  const caminho = `lojas/${lojaId}/${nome}`;

  // O nome é único por envio: nada sobrescreve a foto de outro produto.
  let url: string;
  try {
    url = await guardarPublico(caminho, await file.arrayBuffer(), file.type);
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }

  return NextResponse.json({
    url,
    // O nome do arquivo vira o texto alternativo inicial — é o que a pessoa
    // reconhece, e é melhor que `alt=""` pra quem usa leitor de tela.
    alt: file.name.replace(/\.[^.]+$/, "").slice(0, 120),
  });
}
