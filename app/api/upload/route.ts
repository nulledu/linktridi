import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { novaChave, urlPrivada } from "@/lib/armazenamento/referencia";
import { b2Configurado, enviarPrivado } from "@/lib/armazenamento/privado";
import { guardarPublico } from "@/lib/armazenamento/publico";

export const dynamic = "force-dynamic";

const BUCKETS = ["photos", "sounds", "branding", "chat"] as const;

// POST /api/upload (multipart: file, bucket) → { url, nome, mime, tamanho }.
// Autenticado. O chat manda qualquer tipo de arquivo e precisa do nome original
// de volta para exibir no painel de Arquivos.
//
// `photos`/`sounds`/`branding` são PÚBLICOS: desde 24/09/2026 vão pro bucket
// público do B2 (lib/armazenamento/publico.ts), com o nome do bucket antigo
// como pasta. `chat` é PRIVADO: desde set/2026 vai pro
// Backblaze B2 e a resposta é `/api/arquivos/<chave>` — o que já existe no
// bucket `chat` do Supabase continua onde está. Anexo grande não passa por
// aqui (a Vercel corta o corpo em 4,5 MB): a Central usa o presign e sobe
// direto no B2; esta rota é a reserva quando o B2 está desligado.
export async function POST(req: NextRequest) {
  // getProfile (não getAuthedUser): é o único que confere `active`. Com a
  // checagem antiga, quem foi DESLIGADO continuava enviando arquivo enquanto a
  // sessão do navegador durasse — a conta some do ERP, o acesso não.
  if (!(await getProfile())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const bucket = String(form.get("bucket") ?? "");
  if (!file || !BUCKETS.includes(bucket as (typeof BUCKETS)[number])) {
    return NextResponse.json({ error: "invalid_upload" }, { status: 400 });
  }
  const mime = file.type || "application/octet-stream";
  if (bucket === "chat" && b2Configurado()) {
    let chave = novaChave("chat", file.name, mime);
    try {
      chave = await enviarPrivado(chave, await file.arrayBuffer(), mime);
    } catch (e) {
      return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
    }
    return NextResponse.json({ url: urlPrivada(chave), nome: file.name || chave, mime, tamanho: file.size ?? null });
  }
  const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const path = `${bucket}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  let url: string;
  try {
    url = await guardarPublico(path, await file.arrayBuffer(), file.type, bucket);
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
  return NextResponse.json({
    url,
    nome: file.name || path,
    mime: file.type || "application/octet-stream",
    tamanho: file.size ?? null,
  });
}
