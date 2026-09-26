"use client";

import { comprimirImagem } from "./midia";
import type { AreaPrivada } from "@/lib/armazenamento/referencia";

// Upload de arquivo PRIVADO a partir do navegador.
//
// 1) pede ao servidor uma URL assinada (`/api/arquivos/presign`);
// 2) sobe o arquivo DIRETO no Backblaze com um PUT (XHR, pra ter progresso);
// 3) devolve `{ url, nome, mime, tamanho }` — o mesmo contrato do
//    `/api/upload`, então quem guardava a resposta dele guarda esta igual.
//
// `url` é relativa (`/api/arquivos/<chave>`): o navegador resolve contra o app,
// a rota confere a sessão e redireciona pra assinatura de curta duração.
//
// Se o B2 não estiver configurado (503) cai no `/api/upload` de antes — o
// arquivo vai pro Supabase e a tela nem percebe. Não é o caminho esperado em
// produção; é o que impede a Central de parar por variável de ambiente
// faltando.

export type ArquivoEnviado = { url: string; nome: string; mime: string; tamanho: number | null };

function xhr(
  metodo: string,
  url: string,
  corpo: XMLHttpRequestBodyInit,
  opts: { mime?: string; aoProgredir?: (pct: number) => void } = {},
): Promise<{ status: number; texto: string }> {
  return new Promise((ok, erro) => {
    const x = new XMLHttpRequest();
    x.open(metodo, url);
    if (opts.mime) x.setRequestHeader("content-type", opts.mime);
    x.upload.onprogress = (e) => { if (e.lengthComputable) opts.aoProgredir?.(e.loaded / e.total); };
    x.onload = () => ok({ status: x.status, texto: x.responseText });
    x.onerror = () => erro(new Error("rede"));
    x.send(corpo);
  });
}

export async function enviarArquivoPrivado(
  file: File,
  area: AreaPrivada,
  aoProgredir?: (pct: number) => void,
  /** bucket do Supabase usado no fallback quando o B2 está desligado. `null` =
   *  sem reserva: a área só aceita o B2 (a rota dela confere que a URL é
   *  `/api/arquivos/<área>/…`), e cair num bucket PÚBLICO deixaria o arquivo
   *  aberto na internet E recusado no registro — pior dos dois mundos. */
  bucketReserva: "chat" | "photos" | null = "chat",
): Promise<ArquivoEnviado> {
  // Toda imagem sobe compactada (WebP ≤1600px) — este envio vai DIRETO pro
  // B2, o servidor nunca vê os bytes, então é aqui ou em lugar nenhum.
  // Exceção: criativo de anúncio sobe como foi entregue (vai pro Meta, que
  // recodifica e não aceita WebP em todo posicionamento).
  if (area !== "criativos") file = await comprimirImagem(file);
  const mime = file.type || "application/octet-stream";
  const pre = await fetch("/api/arquivos/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ area, nome: file.name, mime, tamanho: file.size }),
  });
  if (pre.status === 503) {
    if (!bucketReserva) throw new Error("storage_off");
    return enviarPeloSupabase(file, bucketReserva, aoProgredir);
  }
  const j = (await pre.json().catch(() => null)) as { url?: string; put?: string; error?: string } | null;
  if (!pre.ok || !j?.put || !j.url) throw new Error(j?.error || "upload");

  const r = await xhr("PUT", j.put, file, { mime, aoProgredir });
  if (r.status < 200 || r.status >= 300) throw new Error(`upload (${r.status})`);
  return { url: j.url, nome: file.name || j.url.split("/").pop()!, mime, tamanho: file.size ?? null };
}

async function enviarPeloSupabase(
  file: File,
  bucket: string,
  aoProgredir?: (pct: number) => void,
): Promise<ArquivoEnviado> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("bucket", bucket);
  const r = await xhr("POST", "/api/upload", fd, { aoProgredir });
  let j: (ArquivoEnviado & { error?: string }) | null = null;
  try { j = JSON.parse(r.texto); } catch { /* resposta sem JSON */ }
  if (r.status >= 300 || !j?.url) throw new Error(j?.error || "upload");
  return { url: j.url, nome: j.nome, mime: j.mime, tamanho: j.tamanho };
}
