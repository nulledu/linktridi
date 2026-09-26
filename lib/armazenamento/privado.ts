import { AwsClient } from "aws4fetch";
import { compactarImagem } from "./compactar";
import { chaveValida, nomeParaCabecalho, tipoServido } from "./referencia";

// Armazenamento PRIVADO — Backblaze B2 pela API compatível com S3.
//
// Só o servidor fala com o B2. O navegador nunca vê a chave: ou o servidor
// envia o arquivo (rota multipart, arquivo pequeno), ou recebe uma URL
// assinada de PUT e sobe direto no B2 (arquivo grande — a Vercel corta o corpo
// em 4,5 MB, e vídeo não cabe nisso). Leitura é sempre URL assinada de curta
// duração, entregue por redirect na rota `/api/arquivos/<chave>` depois de
// conferir a sessão.
//
// aws4fetch em vez do @aws-sdk/client-s3: 7 KB, roda em edge e node, e só
// precisamos de PUT/GET/HEAD/DELETE + assinatura de query. O SDK oficial
// traria 3 MB pra fazer a mesma coisa.

const ENV = ["B2_ENDPOINT", "B2_REGION", "B2_BUCKET", "B2_KEY_ID", "B2_APP_KEY"] as const;

/** `true` quando as cinco variáveis estão presentes. Sem elas o app cai no Supabase. */
export function b2Configurado(): boolean {
  return ENV.every((k) => !!process.env[k]);
}

let cliente: AwsClient | null = null;
function b2(): { c: AwsClient; base: string } {
  if (!b2Configurado()) throw new Error("B2 não configurado (B2_ENDPOINT/B2_REGION/B2_BUCKET/B2_KEY_ID/B2_APP_KEY)");
  cliente ??= new AwsClient({
    accessKeyId: process.env.B2_KEY_ID!,
    secretAccessKey: process.env.B2_APP_KEY!,
    service: "s3",
    region: process.env.B2_REGION!,
  });
  const endpoint = process.env.B2_ENDPOINT!.replace(/\/+$/, "");
  return { c: cliente, base: `${endpoint}/${process.env.B2_BUCKET}` };
}

function exigeChave(chave: string) {
  if (!chaveValida(chave)) throw new Error(`chave privada inválida: ${chave}`);
}

/** Sobe um arquivo pelo servidor (use só pra arquivo pequeno — a rota tem teto de corpo). */
export async function enviarPrivado(
  chave: string,
  corpo: ArrayBuffer | Uint8Array | Blob | string,
  mime: string,
): Promise<string> {
  exigeChave(chave);
  // Toda imagem entra compactada (WebP ≤1600px). A extensão da chave muda
  // junto (o tipo servido sai dela) — quem chama guarda a chave DEVOLVIDA.
  ({ corpo, mime, caminho: chave } = await compactarImagem(corpo, mime, chave));
  const { c, base } = b2();
  const r = await c.fetch(`${base}/${chave}`, {
    method: "PUT",
    body: corpo as BodyInit,
    headers: { "content-type": mime || "application/octet-stream" },
  });
  if (!r.ok) throw new Error(`B2 PUT ${chave}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return chave;
}

/** Teto do prazo de uma URL assinada. Acima disso é link permanente com outro nome. */
const PRAZO_MAX = 600;

/**
 * URL assinada de LEITURA. Padrão 10 min — é o que o redirect entrega ao
 * navegador, e vale pra quem tiver o link até vencer; por isso o teto.
 *
 * `content-type` e `content-disposition` são FORÇADOS na resposta a partir da
 * extensão da chave (`tipoServido`): o que o cliente gravou no PUT não conta.
 * Extensão fora da lista de exibição sai como download binário.
 */
export async function urlAssinadaLeitura(
  chave: string,
  segundos = 600,
  opts: { nome?: string; download?: boolean } = {},
): Promise<string> {
  exigeChave(chave);
  const { c, base } = b2();
  const u = new URL(`${base}/${chave}`);
  u.searchParams.set("X-Amz-Expires", String(Math.min(Math.max(1, Math.floor(segundos)), PRAZO_MAX)));
  const tipo = tipoServido(chave);
  u.searchParams.set("response-content-type", tipo.mime);
  const nome = nomeParaCabecalho(opts.nome, chave.split("/").pop());
  const modo = opts.download || !tipo.inline ? "attachment" : "inline";
  u.searchParams.set(
    "response-content-disposition",
    `${modo}; filename="${nome}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
  );
  u.searchParams.set("response-cache-control", "private, max-age=600");
  const assinada = await c.sign(new Request(u.toString()), { aws: { signQuery: true } });
  return assinada.url;
}

/**
 * URL assinada de ENVIO (PUT). O navegador sobe direto no B2.
 *
 * O `content-length` ENTRA na assinatura: o B2 recusa (403) qualquer corpo de
 * tamanho diferente do declarado no presign — sem isso, "10 bytes" vira 5 GB
 * depois que a rota já disse sim. O `content-type` fica FORA de propósito:
 * navegador acrescenta charset, XHR troca o valor, e cada variação viraria
 * 403; o tipo servido na leitura vem da extensão da chave, não daqui.
 * Padrão 15 min: tempo de subir um vídeo grande.
 */
export async function urlAssinadaEnvio(chave: string, tamanho: number, segundos = 900): Promise<string> {
  exigeChave(chave);
  if (!Number.isInteger(tamanho) || tamanho <= 0) throw new Error("tamanho do envio inválido");
  const { c, base } = b2();
  const u = new URL(`${base}/${chave}`);
  u.searchParams.set("X-Amz-Expires", String(Math.min(Math.max(1, Math.floor(segundos)), 900)));
  const assinada = await c.sign(
    new Request(u.toString(), { method: "PUT", headers: { "content-length": String(tamanho) } }),
    { aws: { signQuery: true, allHeaders: true } },
  );
  return assinada.url;
}

/** Baixa os bytes pelo servidor (proxy). Evite: paga CPU na Vercel — prefira o redirect. */
export async function lerPrivado(chave: string): Promise<Response> {
  exigeChave(chave);
  const { c, base } = b2();
  return c.fetch(`${base}/${chave}`, { method: "GET" });
}

/** Metadados sem baixar o corpo; `null` se não existe. */
export async function existePrivado(chave: string): Promise<{ tamanho: number; mime: string } | null> {
  exigeChave(chave);
  const { c, base } = b2();
  const r = await c.fetch(`${base}/${chave}`, { method: "HEAD" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`B2 HEAD ${chave}: ${r.status}`);
  return {
    tamanho: Number(r.headers.get("content-length") ?? 0),
    mime: r.headers.get("content-type") ?? "application/octet-stream",
  };
}

/** Apaga (idempotente: 404 não é erro). */
export async function apagarPrivado(chave: string): Promise<void> {
  exigeChave(chave);
  const { c, base } = b2();
  const r = await c.fetch(`${base}/${chave}`, { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new Error(`B2 DELETE ${chave}: ${r.status}`);
}
