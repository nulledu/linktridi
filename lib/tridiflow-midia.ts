// ── LinkTridi · mídia dos cartões (formatos, tetos e caminho) ────────────────
// Por que existe: o bio link da marca rodava com GIFs de 9 MB feitos em
// conversor de vídeo. Cada visita puxava dezenas de MB, a página demorava a
// aparecer e o Cloudinary gratuito que hospedava os arquivos cortou o acesso
// (401) — os cinco cartões ficaram sem foto do dia pra noite. A regra aqui é
// o que impede o mesmo buraco de voltar pelo botão "Enviar" do editor.
//
// Puro (client-safe): o editor usa pra recusar ANTES de subir e a rota de
// upload usa pra recusar de novo no servidor — as duas leem a mesma tabela.

export type TipoMidiaLT = "imagem" | "gif" | "video";

const MB = 1024 * 1024;

/** Tetos por tipo. Foto já sai do editor comprimida em WebP (≈100–300 KB), o
 *  teto dela só barra o arquivo cru que a compressão não conseguiu reduzir.
 *  GIF é apertado de propósito: é o formato mais caro por segundo de movimento.
 *  Vídeo fica em 6 MB porque sai do Storage público a cada visita — um loop de
 *  10 s em 720p cabe folgado, um vídeo cru do celular não. */
export const TETO_MIDIA_LT: Record<TipoMidiaLT, number> = {
  imagem: 8 * MB,
  gif: 3 * MB,
  video: 6 * MB,
};

const FORMATOS: Record<string, { tipo: TipoMidiaLT; ext: string }> = {
  "image/jpeg": { tipo: "imagem", ext: "jpg" },
  "image/png": { tipo: "imagem", ext: "png" },
  "image/webp": { tipo: "imagem", ext: "webp" },
  "image/avif": { tipo: "imagem", ext: "avif" },
  "image/gif": { tipo: "gif", ext: "gif" },
  "video/mp4": { tipo: "video", ext: "mp4" },
  "video/webm": { tipo: "video", ext: "webm" },
};

/** "6 MB", "12,4 MB" — como a mensagem de erro fala com a pessoa. */
export const emMB = (n: number): string =>
  `${(n / MB).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

const ROTULO: Record<TipoMidiaLT, string> = { imagem: "Foto", gif: "GIF", video: "Vídeo" };

// O que fazer quando passa do teto. "Arquivo muito grande" manda a pessoa
// adivinhar; aqui a mensagem diz o limite, o tamanho real e COMO resolver.
const COMO_RESOLVER: Record<TipoMidiaLT, string> = {
  imagem: "Reduza a foto pra no máximo 2000 px no lado maior e envie de novo.",
  gif: "GIF pesa de 5 a 10 vezes um MP4 do mesmo trecho: envie o vídeo original em MP4 (Mídia › Vídeo).",
  video: "Corte pra até 10 s e exporte em 720p — um loop assim fica entre 2 e 5 MB.",
};

export type ClassificacaoMidiaLT =
  | { ok: true; tipo: TipoMidiaLT; ext: string }
  | { ok: false; erro: string };

export function classificarMidiaLT(mime: string, tamanho: number): ClassificacaoMidiaLT {
  const m = (mime || "").toLowerCase();
  // .mov do iPhone é HEVC na maioria das vezes: toca no Safari e fica tela
  // preta no Chrome/Android — ou seja, some pra metade de quem vem do Instagram.
  if (m === "video/quicktime") {
    return { ok: false, erro: "Vídeo .mov não toca em todo celular. Exporte em MP4 (H.264) e envie de novo." };
  }
  const f = FORMATOS[m];
  if (!f) return { ok: false, erro: "Formato não aceito. Use foto (JPG, PNG, WebP), GIF ou vídeo MP4." };
  if (!Number.isFinite(tamanho) || tamanho <= 0) return { ok: false, erro: "O arquivo veio vazio. Escolha de novo." };
  const teto = TETO_MIDIA_LT[f.tipo];
  if (tamanho > teto) {
    return { ok: false, erro: `${ROTULO[f.tipo]} de ${emMB(tamanho)} passa do limite de ${emMB(teto)}. ${COMO_RESOLVER[f.tipo]}` };
  }
  return { ok: true, tipo: f.tipo, ext: f.ext };
}

/** Caminho no bucket público: prefixo próprio (dá pra medir e limpar o que é
 *  do LinkTridi sem mexer em foto de produto do resto do app) e nome único —
 *  arquivo nunca é sobrescrito, então o cache do navegador pode ser eterno. */
export function caminhoMidiaLT(ext: string, agora: Date = new Date()): string {
  const ano = agora.getUTCFullYear();
  const mes = String(agora.getUTCMonth() + 1).padStart(2, "0");
  return `linktridi/${ano}/${mes}/${crypto.randomUUID()}.${ext}`;
}
