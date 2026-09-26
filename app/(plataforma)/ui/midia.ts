// Mídia no navegador: comprimir a foto, tirar a capa do vídeo e subir DIRETO
// ao Storage por URL assinada, com progresso e cancelamento.
//
// Sem React de propósito: é o mesmo trabalho em todo editor que sobe mídia
// pública. Cada tela tinha a sua cópia, e cópia de código de mídia diverge
// exatamente onde dói — orientação da foto, formato que o Safari não sabe
// gerar, capa que trava o envio.
//
// Por que PUT direto e não uma rota de upload: a função da Vercel corta o
// corpo em 4,5 MB. O servidor só ASSINA (a rota confere permissão, tipo e
// tamanho); os bytes vão do navegador pro Storage.

/** GIF perderia o movimento no canvas; SVG é documento, não se redesenha. */
const NAO_COMPRIME = new Set(["image/gif", "image/svg+xml"]);
const PRAZO_CAPA_MS = 8000;

const semExtensao = (nome: string) => (nome || "").replace(/\.[^.]+$/, "");

/** WebP e, onde o navegador não sabe gerar WebP (o Safari cai em PNG, maior
 *  que a própria foto), JPEG sobre fundo branco — a transparência do PNG
 *  viraria preto no JPEG. */
async function paraBlob(c: HTMLCanvasElement, qualidade: number): Promise<Blob | null> {
  const webp = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/webp", qualidade));
  if (webp?.type === "image/webp") return webp;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
  }
  return new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", qualidade));
}

/**
 * Foto de celular vem com 4–12 MB, e a página pública abre no 4G. Aqui ela
 * vira WebP de no máximo `ladoMaximo` px (1600 cobre a leitura em tela 2x) —
 * uns 150–400 KB sem perda visível.
 *
 * Devolve o ORIGINAL quando não dá pra comprimir (navegador sem
 * `createImageBitmap`, jsdom, formato que o canvas não abre) ou quando o
 * resultado não fica menor: comprimir é economia de quem visita, nunca motivo
 * pra falhar o envio.
 */
export async function comprimirImagem(f: File, ladoMaximo = 1600, qualidade = 0.82): Promise<File> {
  if (!f.type.startsWith("image/") || NAO_COMPRIME.has(f.type)) return f;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return f;
  try {
    // `from-image` explícito: em navegador antigo o padrão era ignorar o EXIF,
    // e a foto tirada em pé subia deitada.
    const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
    const escala = Math.min(1, ladoMaximo / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * escala));
    c.height = Math.max(1, Math.round(bmp.height * escala));
    const ctx = c.getContext("2d");
    if (!ctx) { bmp.close(); return f; }
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const blob = await paraBlob(c, qualidade);
    if (!blob || blob.size >= f.size || !/^image\/(webp|jpeg)$/.test(blob.type)) return f;
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `${semExtensao(f.name) || "foto"}.${ext}`, { type: blob.type });
  } catch {
    return f;
  }
}

/**
 * Capa tirada do próprio vídeo (o quadro de 0,1 s). Sem ela o player nasce
 * preto até alguém apertar o play.
 *
 * Vídeo que o navegador não decodifica (HEVC no Chrome) ou que passa do prazo
 * de 8 s não trava nada: sai `null`, e o envio do vídeo segue sem capa.
 */
export async function capaDoVideo(f: File, ladoMaximo = 1280): Promise<File | null> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return null;
  const url = URL.createObjectURL(f);
  const v = document.createElement("video");
  let prazo: ReturnType<typeof setTimeout> | undefined;
  const quadro = (async (): Promise<File | null> => {
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    await new Promise<void>((ok, falha) => { v.onloadeddata = () => ok(); v.onerror = () => falha(new Error("video")); });
    v.currentTime = Math.min(0.1, (v.duration || 1) / 2);
    await new Promise<void>((ok, falha) => { v.onseeked = () => ok(); v.onerror = () => falha(new Error("video")); });
    if (!v.videoWidth || !v.videoHeight) return null;   // só áudio: não há quadro
    const escala = Math.min(1, ladoMaximo / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(v.videoWidth * escala));
    c.height = Math.max(1, Math.round(v.videoHeight * escala));
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const blob = await paraBlob(c, 0.8);
    if (!blob) return null;
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `${semExtensao(f.name) || "video"}-capa.${ext}`, { type: blob.type });
  })().catch(() => null);   // perdeu pro prazo e falhou depois: ninguém espera mais
  try {
    return await Promise.race([quadro, new Promise<null>((ok) => { prazo = setTimeout(() => ok(null), PRAZO_CAPA_MS); })]);
  } finally {
    clearTimeout(prazo);
    v.onloadeddata = null;
    v.onseeked = null;
    v.onerror = null;
    v.removeAttribute("src");
    URL.revokeObjectURL(url);
  }
}

/** O envio foi cancelado (Cancelar, ou a tela fechou) — não é erro pra mostrar. */
export function envioCancelado(e: unknown): boolean {
  return (e as { name?: unknown } | null)?.name === "AbortError";
}
const cancelado = () => new DOMException("Envio cancelado.", "AbortError");

export interface OpcoesEnvio {
  /** Rota que responde `{ signedUrl, publicUrl }` a um POST `{ mime, tamanho }`.
   *  O caminho assinado tem de ser NOVO a cada envio (nome único, sem upsert):
   *  o arquivo sobe com cache de um ano, e trocar o conteúdo num caminho já
   *  usado deixaria quem já abriu vendo o antigo. */
  rota: string;
  /** Fração já enviada, de 0 a 1. */
  onProgresso?: (fracao: number) => void;
  sinal?: AbortSignal;
}

/**
 * Pede a assinatura à `rota` e sobe o arquivo com PUT direto no Storage.
 * Devolve o endereço PÚBLICO. XHR e não fetch no PUT: só ele dá o progresso
 * do envio — sem número na tela, a pessoa acha que travou e manda de novo.
 */
export async function enviarParaStorage(f: File, { rota, onProgresso, sinal }: OpcoesEnvio): Promise<string> {
  // Toda imagem sobe compactada: o PUT é direto pro storage, sem servidor no
  // meio. Já comprimida (webp menor) passa reto — comprimir não piora.
  f = await comprimirImagem(f);
  if (sinal?.aborted) throw cancelado();
  let r: Response;
  try {
    r = await fetch(rota, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mime: f.type, tamanho: f.size }),
      signal: sinal,
    });
  } catch (e) {
    if (envioCancelado(e) || sinal?.aborted) throw cancelado();
    throw new Error("Sem conexão com o servidor. Confira a internet e tente de novo.");
  }
  // Sessão vencida chega como 401 ou como redirect pro login (200 com HTML).
  // Sem esta leitura a pessoa leria "não deu pra preparar" e tentaria de novo
  // à toa.
  if (r.status === 401 || r.redirected) throw new Error("Sua sessão expirou. Entre de novo e envie o arquivo outra vez.");
  const d = (await r.json().catch(() => ({}))) as { signedUrl?: string; publicUrl?: string; error?: string };
  if (!r.ok || !d.signedUrl || !d.publicUrl) {
    throw new Error(d.error || "Não deu pra preparar o envio agora. Tente de novo em instantes.");
  }
  await subir(d.signedUrl, f, onProgresso, sinal);
  return d.publicUrl;
}

function subir(url: string, f: File, onProgresso?: (fracao: number) => void, sinal?: AbortSignal): Promise<void> {
  return new Promise((ok, falha) => {
    if (sinal?.aborted) { falha(cancelado()); return; }
    const x = new XMLHttpRequest();
    const aoCancelar = () => x.abort();
    const solta = () => sinal?.removeEventListener("abort", aoCancelar);
    x.open("PUT", url);
    x.setRequestHeader("Content-Type", f.type || "application/octet-stream");
    // Corpo cru sem este cabeçalho o Storage grava como `no-cache`: toda visita
    // à página pública revalidava cada foto e vídeo antes de desenhar (a rota
    // antiga, pelo storage-js, gravava 1 h). Um ano porque o caminho é novo a
    // cada envio e a assinatura não sobrescreve — o conteúdo nunca muda.
    x.setRequestHeader("Cache-Control", "max-age=31536000");
    x.upload.onprogress = (e) => { if (e.lengthComputable && e.total > 0) onProgresso?.(Math.min(1, e.loaded / e.total)); };
    x.onload = () => {
      solta();
      if (x.status >= 200 && x.status < 300) { onProgresso?.(1); ok(); return; }
      falha(new Error(x.status === 413
        ? "O Storage recusou o arquivo pelo tamanho. Reduza o arquivo e envie de novo."
        : `O envio parou no meio (${x.status}). Tente de novo.`));
    };
    x.onerror = () => { solta(); falha(new Error("A conexão caiu no meio do envio. Confira a internet e tente de novo.")); };
    x.onabort = () => { solta(); falha(cancelado()); };
    sinal?.addEventListener("abort", aoCancelar, { once: true });
    x.send(f);
  });
}
