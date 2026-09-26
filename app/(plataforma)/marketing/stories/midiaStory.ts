// ── Mídia de um story, no navegador ──────────────────────────────────────────
// Do arquivo escolhido até as duas URLs gravadas no story:
//   1. confere tipo, tamanho e duração ANTES de subir (frase com o limite e
//      como resolver — "arquivo muito grande" manda a pessoa adivinhar);
//   2. comprime o print (WebP de 1600 px) e tira a MINIATURA (540 px) — é ela
//      que o quadro desenha, não a mídia inteira;
//   3. calcula o dHash da miniatura (o que reconhece a "mesma arte");
//   4. sobe mídia e miniatura DIRETO pro B2 (presign + PUT), com progresso.
//
// As peças são as do app: `comprimirImagem`/`capaDoVideo` (ui/midia.ts),
// `medirCriativo`/`tipoDoCriativo` (a mesma régua de tipo da Biblioteca de
// Criativos) e `enviarArquivoPrivado` (ui/enviarArquivo.ts).

import { capaDoVideo, comprimirImagem } from "../../ui/midia";
import { enviarArquivoPrivado } from "../../ui/enviarArquivo";
import { emMB, tetoDoEnvio } from "@/lib/armazenamento/referencia";
import { medirCriativo, tipoDoCriativo } from "@/lib/criativos/regras";
import { dhashDePixels } from "@/lib/marketing-stories/semelhanca";
import { DURACAO_MAX_STORY_S, type MidiaStory } from "@/lib/marketing-stories/tipos";

export interface MidiaPreparada {
  /** O que sobe como mídia: o print comprimido, ou o vídeo original. */
  arquivo: File;
  /** A miniatura (WebP ~540 px). `null` quando o navegador não gerou (HEVC no Chrome). */
  capa: File | null;
  tipo: MidiaStory;
  largura: number | null;
  altura: number | null;
  duracao: number | null;
  hashVisual: string | null;
  /** `blob:` pra prévia no formulário — liberar com `liberarMidia`. */
  previa: string;
  previaCapa: string | null;
  /** Quando o arquivo foi gravado. O print é tirado logo depois de postar:
   *  é a melhor sugestão de "quando foi ao ar" que existe sem perguntar. */
  modificadoEm: number | null;
}

export const ACEITA = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime";

/** "Imagem até 8 MB · Vídeo até 40 MB e 60 s" */
export function textoDosLimitesStory(): string {
  const img = emMB(tetoDoEnvio("stories", "image/jpeg"));
  const vid = emMB(tetoDoEnvio("stories", "video/mp4"));
  return `Imagem até ${img} · Vídeo até ${vid} e ${DURACAO_MAX_STORY_S} s`;
}

/** Miniatura do print. `comprimirImagem` devolve o ORIGINAL quando não consegue:
 *  aí não há miniatura, e o quadro desenha a própria mídia (que já é pequena). */
async function miniaturaDaImagem(f: File): Promise<File | null> {
  const m = await comprimirImagem(f, 540, 0.8);
  return m === f ? null : m;
}

/** dHash de 64 bits: a imagem reduzida a 9×8 em cinza. `null` se o navegador não abrir. */
export async function hashDaImagem(b: Blob | null): Promise<string | null> {
  if (!b || typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  try {
    const bmp = await createImageBitmap(b);
    const c = document.createElement("canvas");
    c.width = 9;
    c.height = 8;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) { bmp.close(); return null; }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, 9, 8);
    bmp.close();
    const px = ctx.getImageData(0, 0, 9, 8).data;
    const cinza: number[] = [];
    for (let i = 0; i < 72; i++) cinza.push(px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114);
    return dhashDePixels(cinza);
  } catch {
    return null;
  }
}

export async function prepararMidia(f: File): Promise<{ ok: true; midia: MidiaPreparada } | { ok: false; erro: string }> {
  const tipo = tipoDoCriativo(f.type);
  if (!tipo) {
    return { ok: false, erro: "Story aceita imagem (JPG, PNG, WebP, GIF) e vídeo (MP4, WebM, MOV). Converta o arquivo e tente de novo." };
  }
  if (!f.size) return { ok: false, erro: "O arquivo está vazio." };

  const medida = await medirCriativo(f);
  if (tipo === "video") {
    const teto = tetoDoEnvio("stories", f.type);
    if (f.size > teto) {
      return {
        ok: false,
        erro: `Vídeo de story aqui vai até ${emMB(teto)} e este tem ${emMB(f.size)}. Exporte em 1080p com bitrate menor — o Instagram recodifica tudo mesmo.`,
      };
    }
    // Meio segundo de folga: quem exportou 60,3 s não fez nada de errado.
    if (medida.duracao != null && medida.duracao > DURACAO_MAX_STORY_S + 0.5) {
      return { ok: false, erro: `O vídeo tem ${Math.round(medida.duracao)} s e um story vai até ${DURACAO_MAX_STORY_S} s. Corte antes de subir.` };
    }
  }

  const arquivo = tipo === "imagem" ? await comprimirImagem(f, 1600, 0.85) : f;
  if (tipo === "imagem") {
    const teto = tetoDoEnvio("stories", arquivo.type);
    if (arquivo.size > teto) {
      return {
        ok: false,
        erro: `Imagem aqui vai até ${emMB(teto)} e esta tem ${emMB(arquivo.size)} mesmo comprimida. Exporte como JPG ou reduza para 1080 px no lado maior.`,
      };
    }
  }

  const capa = tipo === "imagem" ? await miniaturaDaImagem(f) : await capaDoVideo(f, 540);
  const hashVisual = await hashDaImagem(capa ?? (tipo === "imagem" ? arquivo : null));
  return {
    ok: true,
    midia: {
      arquivo, capa, tipo, ...medida, hashVisual,
      previa: URL.createObjectURL(arquivo),
      previaCapa: capa ? URL.createObjectURL(capa) : null,
      modificadoEm: Number.isFinite(f.lastModified) && f.lastModified > 0 ? f.lastModified : null,
    },
  };
}

export function liberarMidia(m: MidiaPreparada | null | undefined) {
  if (!m) return;
  if (m.previa.startsWith("blob:")) URL.revokeObjectURL(m.previa);
  if (m.previaCapa?.startsWith("blob:")) URL.revokeObjectURL(m.previaCapa);
}

/**
 * Sobe mídia e miniatura em paralelo, com UM progresso (pesado pelo tamanho de
 * cada uma). Miniatura que falhar não derruba o story — ele entra sem ela e o
 * quadro usa a mídia. Mídia que falhar derruba, e a miniatura que já subiu é
 * descartada (senão fica órfã no bucket).
 */
export async function enviarMidia(
  m: MidiaPreparada,
  aoProgredir?: (fracao: number) => void,
): Promise<{ midiaUrl: string; capaUrl: string | null }> {
  const total = m.arquivo.size + (m.capa?.size ?? 0) || 1;
  let a = 0;
  let b = 0;
  const avisar = () => aoProgredir?.(Math.min(1, (a + b) / total));
  const [principal, capa] = await Promise.allSettled([
    enviarArquivoPrivado(m.arquivo, "stories", (p) => { a = p * m.arquivo.size; avisar(); }, null),
    m.capa
      ? enviarArquivoPrivado(m.capa, "stories", (p) => { b = p * (m.capa?.size ?? 0); avisar(); }, null)
      : Promise.resolve(null),
  ]);
  if (principal.status === "rejected") {
    if (capa.status === "fulfilled" && capa.value) descartarNoServidor([capa.value.url]);
    throw principal.reason;
  }
  aoProgredir?.(1);
  return { midiaUrl: principal.value.url, capaUrl: capa.status === "fulfilled" ? capa.value?.url ?? null : null };
}

export function descartarNoServidor(urls: string[]) {
  const lista = urls.filter(Boolean);
  if (!lista.length) return;
  // `keepalive`: o descarte sai mesmo se a pessoa fechar a aba logo depois.
  void fetch("/api/marketing/stories/midia", {
    method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ urls: lista }), keepalive: true,
  }).catch(() => {});
}

/** A frase pra tela quando o envio falha. */
export function mensagemDeEnvio(e: unknown): string {
  const m = (e as Error)?.message || "";
  if (m === "storage_off") return "O armazenamento privado não está ligado neste ambiente (faltam as variáveis B2_*).";
  if (m === "tipo_nao_aceito") return "Esse tipo de arquivo não entra em story.";
  if (m === "sem_permissao") return "Você não tem permissão pra registrar stories (Marketing · criar).";
  if (m === "rede") return "A conexão caiu no meio do envio. Confira a internet e tente de novo.";
  return "Não deu pra enviar o arquivo. Tente de novo.";
}
