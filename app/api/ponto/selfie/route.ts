import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { ehSuperusuario } from "@/lib/superusuario";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { areaDaChave, chaveValida } from "@/lib/armazenamento/referencia";
import { urlAssinadaLeitura } from "@/lib/armazenamento/privado";

export const dynamic = "force-dynamic";

// GET /api/ponto/selfie?path=ponto/xxx.jpg — a ÚNICA porta para a selfie de
// batida. Imagem de rosto carimbada com hora, local e score é dado pessoal
// sensível (LGPD): nem admin, nem gestor do ponto — SÓ o superusuário abre.
// O bucket ponto-selfies é privado; quem não passa aqui não tem URL nenhuma.
//
// Dois formatos de `path`: o antigo (`ponto/<ts>-<rand>.jpg`, bucket do
// Supabase, entregue por proxy) e o novo (`ponto/aaaa/mm/<id>.jpg`, Backblaze,
// entregue por redirect pra URL assinada de 5 min).
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!ehSuperusuario(me.id, me.username)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const path = new URL(req.url).searchParams.get("path") || "";

  if (chaveValida(path) && areaDaChave(path) === "ponto") {
    try {
      const url = await urlAssinadaLeitura(path, 300);
      return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "private, max-age=240" } });
    } catch (e) {
      return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
    }
  }

  // Só caminhos do próprio prefixo, sem truque de diretório.
  if (!/^ponto\/[A-Za-z0-9._-]+\.(jpg|webp)$/.test(path)) return NextResponse.json({ error: "bad_path" }, { status: 400 });

  try {
    const db = createSupabaseAdminClient();
    const { data, error } = await db.storage.from("ponto-selfies").download(path);
    if (error || !data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return new NextResponse(await data.arrayBuffer(), {
      headers: {
        "content-type": path.endsWith(".webp") ? "image/webp" : "image/jpeg",
        // Cache só no navegador de quem PODE ver — nada de cache compartilhado.
        "cache-control": "private, max-age=300",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
