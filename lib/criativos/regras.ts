// ── Regras da Biblioteca de Criativos ────────────────────────────────────────
// Isomórfico: as partes puras rodam no servidor (a rota valida de novo) e no
// navegador (a tela avisa ANTES de subir 40 MB pra ouvir "não"). O que precisa
// de DOM (medir duração e dimensão) está marcado e só é chamado do cliente.
//
// O teto de tamanho NÃO mora aqui: mora em `lib/armazenamento/referencia.ts`
// (`tetoDoEnvio`), porque é a rota de presign que precisa aplicá-lo antes de
// assinar qualquer coisa. Aqui ficam as regras que são do PRODUTO: que tipo de
// arquivo é criativo, quanto tempo um vídeo de anúncio pode ter e como o
// formato é rotulado.

import { emMB, tetoDoEnvio } from "@/lib/armazenamento/referencia";

export const MIMES_IMAGEM = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const MIMES_VIDEO = ["video/mp4", "video/webm", "video/quicktime"] as const;

/**
 * Teto de duração. A pessoa disse "no máximo 1 minuto, quase sempre menos de
 * 30 s"; 90 s dá folga pra quem exportou 1:02 sem transformar a biblioteca em
 * arquivo de vídeo longo. Só o navegador consegue medir isto (o servidor teria
 * que decodificar o arquivo), então é disciplina, não segurança — quem barra
 * de verdade é o teto de TAMANHO, esse sim aplicado no servidor.
 */
export const DURACAO_MAX_S = 90;

export type TipoCriativo = "imagem" | "video";

export function tipoDoCriativo(mime: string): TipoCriativo | null {
  const m = (mime || "").split(";")[0].trim().toLowerCase();
  if ((MIMES_IMAGEM as readonly string[]).includes(m)) return "imagem";
  if ((MIMES_VIDEO as readonly string[]).includes(m)) return "video";
  return null;
}

/** Os tetos escritos pra tela: "Imagem até 8 MB · Vídeo até 30 MB, 90 s". */
export function textoDosLimites(): string {
  const img = emMB(tetoDoEnvio("criativos", "image/jpeg"));
  const vid = emMB(tetoDoEnvio("criativos", "video/mp4"));
  return `Imagem até ${img} · Vídeo até ${vid} e ${DURACAO_MAX_S} s`;
}

// ── Formato ──────────────────────────────────────────────────────────────────
// Rótulo pela proporção, não pelo tamanho exato: 1080×1350 e 864×1080 são a
// mesma peça de feed, e quem procura "vertical" quer as duas.

export const FORMATOS = ["1:1", "4:5", "9:16", "16:9", "outro"] as const;
export type Formato = (typeof FORMATOS)[number];

export function ehFormato(v: unknown): v is Formato {
  return typeof v === "string" && (FORMATOS as readonly string[]).includes(v);
}

export function formatoDe(largura?: number | null, altura?: number | null): Formato {
  if (!largura || !altura || largura <= 0 || altura <= 0) return "outro";
  const r = largura / altura;
  const perto = (alvo: number) => Math.abs(r - alvo) / alvo < 0.04;
  if (perto(1)) return "1:1";
  if (perto(4 / 5)) return "4:5";
  if (perto(9 / 16)) return "9:16";
  if (perto(16 / 9)) return "16:9";
  return "outro";
}

export const NOME_DO_FORMATO: Record<Formato, string> = {
  "1:1": "Quadrado",
  "4:5": "Retrato",
  "9:16": "Story",
  "16:9": "Paisagem",
  outro: "Outro",
};

// ── O arquivo, como a tela o enxerga ─────────────────────────────────────────
// Repare no que NÃO está aqui: a `chave` do B2. O navegador não tem o que
// fazer com ela (quem apaga é a rota, pelo id), e chave que não sai do
// servidor é chave que não vaza em log, print nem devtools.

export interface ArquivoCriativo {
  id: string;
  criativoId: string;
  /** `/api/arquivos/criativos/aaaa/mm/<uuid>.<ext>` — serve de `src` e de `href`. */
  url: string;
  nome: string;
  mime: string;
  tipo: TipoCriativo;
  tamanho: number;
  largura: number | null;
  altura: number | null;
  duracao: number | null;
  formato: Formato;
  /** A capa do criativo: o que aparece na lista. No máximo uma por criativo. */
  principal: boolean;
  autorNome: string | null;
  createdAt: string;
}

/** "0:28" — duração pra tela. Vídeo de anúncio nunca chega a uma hora. */
export function duracaoCurta(s?: number | null): string | null {
  if (s == null || !Number.isFinite(s) || s <= 0) return null;
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

// ── Medição e validação (NAVEGADOR) ──────────────────────────────────────────

export interface MedidaCriativo {
  largura: number | null;
  altura: number | null;
  duracao: number | null;
}

/**
 * Dimensão (e duração, se vídeo) lidas do próprio arquivo, sem subir nada.
 * Nunca lança: arquivo que o navegador não decodifica volta com tudo `null` e
 * segue o baile — a peça entra na biblioteca sem rótulo de formato, o que é
 * bem melhor que recusar um arquivo válido por causa de um codec.
 */
export async function medirCriativo(file: File): Promise<MedidaCriativo> {
  const vazio: MedidaCriativo = { largura: null, altura: null, duracao: null };
  const tipo = tipoDoCriativo(file.type);
  if (!tipo || typeof document === "undefined") return vazio;

  const url = URL.createObjectURL(file);
  try {
    if (tipo === "imagem") {
      const img = await carregar(Object.assign(new Image(), { src: url }), "load");
      return { largura: img?.naturalWidth ?? null, altura: img?.naturalHeight ?? null, duracao: null };
    }
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = url;
    const pronto = await carregar(v, "loadedmetadata");
    if (!pronto) return vazio;
    const d = Number.isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : null;
    return { largura: v.videoWidth || null, altura: v.videoHeight || null, duracao: d };
  } catch {
    return vazio;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Espera o evento de metadados com prazo — arquivo corrompido não trava a tela. */
function carregar<T extends HTMLElement>(el: T, evento: string, ms = 8000): Promise<T | null> {
  return new Promise((ok) => {
    const fim = (v: T | null) => { clearTimeout(t); ok(v); };
    const t = setTimeout(() => fim(null), ms);
    el.addEventListener(evento, () => fim(el), { once: true });
    el.addEventListener("error", () => fim(null), { once: true });
  });
}

export interface ProblemaCriativo {
  motivo: "tipo" | "tamanho" | "duracao" | "vazio";
  /** Frase pronta pra tela: o que houve E como resolver. */
  texto: string;
}

/**
 * Confere o arquivo ANTES do upload. A frase de erro sempre diz o limite e o
 * valor real — "arquivo muito grande" manda a pessoa adivinhar.
 */
export async function validarCriativo(
  file: File,
  medida?: MedidaCriativo,
): Promise<ProblemaCriativo | null> {
  const tipo = tipoDoCriativo(file.type);
  if (!tipo) {
    return {
      motivo: "tipo",
      texto: "A biblioteca aceita imagem (JPG, PNG, WebP, GIF) e vídeo (MP4, WebM, MOV). Converta o arquivo e tente de novo.",
    };
  }
  if (!file.size) return { motivo: "vazio", texto: "O arquivo está vazio." };

  const teto = tetoDoEnvio("criativos", file.type);
  if (file.size > teto) {
    const oQue = tipo === "video" ? "Vídeo" : "Imagem";
    const comoResolver = tipo === "video"
      ? "Exporte em 1080p com bitrate menor — peça de anúncio não precisa de mais que isso, a Meta recodifica tudo."
      : "Exporte como JPG ou WebP em vez de PNG, ou reduza para 1080 px no lado maior.";
    return {
      motivo: "tamanho",
      texto: `${oQue} aqui vai até ${emMB(teto)} e este tem ${emMB(file.size)}. ${comoResolver}`,
    };
  }

  const d = (medida ?? (await medirCriativo(file))).duracao;
  if (tipo === "video" && d != null && d > DURACAO_MAX_S) {
    return {
      motivo: "duracao",
      texto: `O vídeo tem ${Math.round(d)} s e o limite é ${DURACAO_MAX_S} s. Corte a peça antes de subir.`,
    };
  }
  return null;
}
