import { AwsClient } from "aws4fetch";
import { compactarImagem } from "./compactar";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// Armazenamento PÚBLICO — segundo bucket do Backblaze B2 (`allPublic`).
//
// Regra desde 24/09/2026: todo ARQUIVO (imagem, vídeo, APK, qualquer coisa que
// não seja texto do banco) mora no B2. O que o anônimo precisa abrir — foto de
// produto na vitrine, mídia do LinkTridi/Tutoriais, logo, APK da TV — vai pra
// este bucket; o resto continua no `tridi-privado` (./privado.ts).
//
// A URL gravada no banco é ABSOLUTA e aponta direto pro B2 (`B2_PUBLICO_URL`),
// sem passar pela Vercel: imagem da vitrine vista mil vezes não vira mil
// invocações. Sem as variáveis `B2_PUBLICO_*` o app cai no Supabase de antes
// — é o que impede a tela de parar por env faltando, não o caminho esperado.
//
// O caminho é o mesmo que ia pro Supabase (`linktridi/2026/09/<uuid>.mp4`,
// `lojas/<id>/…`): o script de cópia (scripts/copiar-supabase-b2.mjs) mantém
// o caminho e só troca o prefixo da URL.

const ENV = ["B2_ENDPOINT", "B2_REGION", "B2_PUBLICO_BUCKET", "B2_PUBLICO_KEY_ID", "B2_PUBLICO_APP_KEY", "B2_PUBLICO_URL"] as const;

export function b2PublicoConfigurado(): boolean {
  return ENV.every((k) => !!process.env[k]);
}

let cliente: AwsClient | null = null;
function b2(): { c: AwsClient; base: string } {
  if (!b2PublicoConfigurado()) throw new Error(`B2 público não configurado (${ENV.join("/")})`);
  cliente ??= new AwsClient({
    accessKeyId: process.env.B2_PUBLICO_KEY_ID!,
    secretAccessKey: process.env.B2_PUBLICO_APP_KEY!,
    service: "s3",
    region: process.env.B2_REGION!,
  });
  const endpoint = process.env.B2_ENDPOINT!.replace(/\/+$/, "");
  return { c: cliente, base: `${endpoint}/${process.env.B2_PUBLICO_BUCKET}` };
}

/** Caminho relativo seguro: sem `..`, sem barra inicial, só [A-Za-z0-9._/-]. */
export function caminhoPublicoValido(caminho: string): boolean {
  return (
    typeof caminho === "string" &&
    caminho.length > 0 &&
    caminho.length <= 300 &&
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(caminho) &&
    !caminho.split("/").some((p) => p === "" || p === "." || p === "..")
  );
}

function exige(caminho: string) {
  if (!caminhoPublicoValido(caminho)) throw new Error(`caminho público inválido: ${caminho}`);
}

/** URL pública (permanente) de um caminho no bucket do B2. */
export function urlPublicaB2(caminho: string): string {
  exige(caminho);
  return `${process.env.B2_PUBLICO_URL!.replace(/\/+$/, "")}/${caminho}`;
}

/** Cache de um ano: o caminho é novo a cada envio, o conteúdo nunca muda. */
const CACHE = "public, max-age=31536000, immutable";

/**
 * Grava um arquivo público pelo servidor e devolve a URL absoluta.
 * `bucketReserva` é o bucket do Supabase usado só quando o B2 público não está
 * configurado.
 */
export async function guardarPublico(
  caminho: string,
  corpo: ArrayBuffer | Uint8Array | Blob,
  mime: string,
  bucketReserva = "photos",
): Promise<string> {
  exige(caminho);
  // Toda imagem entra compactada (WebP ≤1600px) — a extensão acompanha.
  ({ corpo, mime, caminho } = await compactarImagem(corpo, mime, caminho));
  const tipo = mime || "application/octet-stream";
  if (!b2PublicoConfigurado()) {
    const db = createSupabaseAdminClient();
    const { error } = await db.storage.from(bucketReserva).upload(caminho, corpo, { contentType: tipo, upsert: true });
    if (error) throw new Error(error.message);
    return db.storage.from(bucketReserva).getPublicUrl(caminho).data.publicUrl;
  }
  const { c, base } = b2();
  const r = await c.fetch(`${base}/${caminho}`, {
    method: "PUT",
    body: corpo as BodyInit,
    headers: { "content-type": tipo, "cache-control": CACHE },
  });
  if (!r.ok) throw new Error(`B2 PUT ${caminho}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return urlPublicaB2(caminho);
}

/**
 * URL assinada de ENVIO pro navegador subir direto (arquivo grande — a Vercel
 * corta o corpo em 4,5 MB). Contrato `{ signedUrl, publicUrl }`, o mesmo que as
 * telas já usavam com o Supabase.
 *
 * No B2 o `content-length` entra na assinatura: quem declarou 2 MB não sobe
 * 200 MB. `tamanho` ausente (rota antiga que não recebe) = sem essa trava.
 */
export async function assinarEnvioPublico(
  caminho: string,
  tamanho: number | null,
  bucketReserva = "photos",
  /** Quando dado, o `content-type` entra na assinatura: o PUT não escolhe o
   *  tipo que o bucket vai servir (SVG com <script>, HTML). O navegador manda
   *  `file.type`, o mesmo valor que declarou pra rota. */
  mime?: string,
): Promise<{ signedUrl: string; publicUrl: string }> {
  exige(caminho);
  if (!b2PublicoConfigurado()) {
    const db = createSupabaseAdminClient();
    const { data, error } = await db.storage.from(bucketReserva).createSignedUploadUrl(caminho);
    if (error || !data) throw new Error(error?.message ?? "sem dados");
    return { signedUrl: data.signedUrl, publicUrl: db.storage.from(bucketReserva).getPublicUrl(caminho).data.publicUrl };
  }
  const { c, base } = b2();
  const u = new URL(`${base}/${caminho}`);
  u.searchParams.set("X-Amz-Expires", "900");
  const headers: Record<string, string> = {};
  if (tamanho != null) {
    if (!Number.isInteger(tamanho) || tamanho <= 0) throw new Error("tamanho do envio inválido");
    headers["content-length"] = String(tamanho);
  }
  if (mime) headers["content-type"] = mime;
  const assinada = await c.sign(new Request(u.toString(), { method: "PUT", headers }), {
    aws: { signQuery: true, allHeaders: Object.keys(headers).length > 0 },
  });
  return { signedUrl: assinada.url, publicUrl: urlPublicaB2(caminho) };
}

/** Apaga por URL pública (B2 ou Supabase antigo). Idempotente. */
export async function apagarPublicoPorUrl(url: string): Promise<void> {
  const base = process.env.B2_PUBLICO_URL?.replace(/\/+$/, "");
  if (base && b2PublicoConfigurado() && url.startsWith(`${base}/`)) {
    const caminho = url.slice(base.length + 1).split("?")[0];
    exige(caminho);
    const { c, base: b } = b2();
    const r = await c.fetch(`${b}/${caminho}`, { method: "DELETE" });
    if (!r.ok && r.status !== 404) throw new Error(`B2 DELETE ${caminho}: ${r.status}`);
    return;
  }
  const m = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+?)(\?|$)/);
  if (m) await createSupabaseAdminClient().storage.from(m[1]).remove([decodeURIComponent(m[2])]);
}
