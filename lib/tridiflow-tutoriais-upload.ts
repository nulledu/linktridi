// ── Central de Tutoriais · mídia (formatos, tetos, caminho e links) ─────────
// Por que existe: o envio passava pela função da Vercel, que corta o corpo em
// 4,5 MB — o vídeo gravado no celular morria no meio em produção, enquanto a
// tela prometia "até 100 MB". E a foto subia crua: capa de 8 MB numa página
// pública aberta no 4G por quem está com o carimbo numa mão e o celular na
// outra.
//
// Puro (roda no navegador e no servidor): o editor recusa ANTES de subir, pra
// poupar a espera; a rota `/api/tridiflow/tutoriais/upload-url` confere de
// novo antes de assinar. As duas leem esta tabela — e as duas só veem o tipo
// e o tamanho que o navegador DECLARA. A URL assinada do Supabase amarra só o
// caminho: o PUT grava o Content-Type e o tamanho que vierem nele. O que
// segura quem pula o editor (um SVG com script gravado como `x.png`, um vídeo
// de 45 MB) é a regra do bucket `tutoriais`, que a rota monta a partir DESTA
// tabela (`ACEITE_MIDIA_TUTORIAL.qualquer` e o maior teto): formato ou teto
// novo aqui passa a valer lá também.
import { emMB } from "@/lib/tridiflow-midia";
import { embedDoTutorialVideo, normalizarUrlPublica } from "@/lib/tridiflow-tutoriais";

// ── Legado ───────────────────────────────────────────────────────────────────
// A rota antiga (`/api/tridiflow/tutoriais/upload`, FormData pela Vercel) ainda
// usa estes três até o editor trocar o CampoArquivo pelo CampoMidia.
export const MIMES_IMAGEM_TUTORIAL = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const MIMES_VIDEO_TUTORIAL = new Set(["video/mp4", "video/webm"]);

export function validarArquivoTutorial(file: Pick<File, "type" | "size">): string | null {
  const imagem = MIMES_IMAGEM_TUTORIAL.has(file.type);
  const video = MIMES_VIDEO_TUTORIAL.has(file.type);
  if (!imagem && !video) return "Envie uma imagem JPG, PNG, WEBP ou GIF, ou um vídeo MP4 ou WEBM.";
  const limite = imagem ? 8 * 1024 * 1024 : 100 * 1024 * 1024;
  if (file.size > limite) return imagem ? "A imagem pode ter no máximo 8 MB." : "O vídeo pode ter no máximo 100 MB.";
  return null;
}

export function extensaoTutorial(mime: string): string {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm" } as Record<string, string>)[mime] ?? "bin";
}

// ── Mídia por URL assinada ───────────────────────────────────────────────────
export type TipoMidiaTutorial = "imagem" | "gif" | "video";
/** O que o CAMPO aceita. A rota usa "qualquer": quem sabe se o campo é de
 *  foto ou de vídeo é a tela; o servidor só confere formato e tamanho. */
export type AceitaMidiaTutorial = "imagem" | "video" | "qualquer";

const MB = 1024 * 1024;

/** Tetos por tipo. `imagem` vale pro arquivo JÁ COMPRIMIDO que sai do
 *  navegador (1600 px em WebP, ≈150–400 KB): o teto só barra a foto que a
 *  compressão não conseguiu reduzir. GIF é apertado porque é o formato mais
 *  caro por segundo de movimento. Vídeo em 20 MB: um passo de 30–60 s em 720p
 *  cabe; o vídeo cru do celular não — e esse fica melhor no YouTube, que
 *  entrega na qualidade da conexão de quem assiste. */
export const TETO_MIDIA_TUTORIAL: Record<TipoMidiaTutorial, number> = {
  imagem: 8 * MB,
  gif: 4 * MB,
  video: 20 * MB,
};

/** Foto crua, ANTES da compressão do navegador. Celular bom tira foto de
 *  5–25 MB; ela entra, vira WebP de 1600 px e só então encara os 8 MB. Sem
 *  este degrau a foto do próprio celular seria recusada antes de ter a chance
 *  de encolher. */
export const TETO_IMAGEM_CRUA = 25 * MB;

const FORMATOS: Record<string, { tipo: TipoMidiaTutorial; ext: string }> = {
  "image/jpeg": { tipo: "imagem", ext: "jpg" },
  "image/png": { tipo: "imagem", ext: "png" },
  "image/webp": { tipo: "imagem", ext: "webp" },
  "image/avif": { tipo: "imagem", ext: "avif" },
  "image/gif": { tipo: "gif", ext: "gif" },
  "video/mp4": { tipo: "video", ext: "mp4" },
  "video/webm": { tipo: "video", ext: "webm" },
};

/** `accept` do seletor de arquivo de cada campo — a mesma lista da tabela.
 *  HEIC e .mov ficam FORA de propósito: com eles no `accept`, o iPhone deixa
 *  de converter a foto pra JPG sozinho na hora de escolher. Quem arrasta ou
 *  cola um desses (o seletor não filtra esses gestos) recebe a mensagem que
 *  diz como exportar. */
export const ACEITE_MIDIA_TUTORIAL: Record<AceitaMidiaTutorial, string> = {
  imagem: "image/jpeg,image/png,image/webp,image/avif,image/gif",
  video: "video/mp4,video/webm",
  qualquer: "image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm",
};

// Chrome no Windows entrega `.heic` (e às vezes `.webm`) com `type` vazio: sem
// deduzir pela extensão, a pessoa leria "formato não aceito" em vez de "exporte
// como JPG".
const POR_EXTENSAO: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif",
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  heic: "image/heic", heif: "image/heif", svg: "image/svg+xml",
};

/** O `type` do arquivo ou, quando o navegador não diz, o deduzido do nome. */
export function mimeDoArquivo(f: Pick<File, "name" | "type">): string {
  if (f.type) return f.type.toLowerCase();
  const ext = /\.([a-z0-9]+)$/i.exec(f.name || "")?.[1]?.toLowerCase() ?? "";
  return POR_EXTENSAO[ext] ?? "";
}

const ROTULO: Record<TipoMidiaTutorial, string> = { imagem: "Foto", gif: "GIF", video: "Vídeo" };

// O que fazer quando passa do teto. "Arquivo muito grande" manda a pessoa
// adivinhar; a mensagem diz o limite, o tamanho real e COMO resolver.
function comoResolver(tipo: TipoMidiaTutorial, aceita: AceitaMidiaTutorial): string {
  if (tipo === "imagem") return "Reduza a foto pra no máximo 2000 px no lado maior e envie de novo.";
  if (tipo === "video") return "Suba no YouTube (pode ser não listado) e cole o link aqui — carrega mais rápido pra quem assiste.";
  // Mandar pro MP4 num campo que só aceita foto seria mandar pra um beco.
  return aceita === "imagem"
    ? "Encurte o GIF ou reduza a largura pra até 800 px e envie de novo."
    : "GIF pesa de 5 a 10 vezes um MP4 do mesmo trecho: envie o vídeo em MP4 no lugar.";
}

const CAMPO_ERRADO: Record<"imagem" | "video", string> = {
  imagem: "Este campo é só de foto: envie JPG, PNG, WebP ou GIF.",
  video: "Este campo é só de vídeo: envie MP4 ou WebM, ou cole um link do YouTube.",
};

const FORMATOS_DO_CAMPO: Record<AceitaMidiaTutorial, string> = {
  imagem: "foto JPG, PNG, WebP ou GIF",
  video: "vídeo MP4 ou WebM",
  qualquer: "foto (JPG, PNG, WebP), GIF ou vídeo MP4",
};

export type ClassificacaoMidiaTutorial =
  | { ok: true; tipo: TipoMidiaTutorial; ext: string }
  | { ok: false; erro: string };

/**
 * Decide se o arquivo pode subir e com que extensão.
 *
 * `crua: true` é a conferência de ANTES da compressão do navegador — a foto
 * vale até `TETO_IMAGEM_CRUA`; GIF e vídeo não são comprimidos e seguem o teto
 * de sempre. Depois de comprimir, confere-se de novo sem a opção.
 */
export function classificarMidiaTutorial(
  mime: string,
  tamanho: number,
  aceita: AceitaMidiaTutorial,
  opcoes: { crua?: boolean } = {},
): ClassificacaoMidiaTutorial {
  const m = (mime || "").toLowerCase().split(";")[0].trim();
  // Campo errado primeiro: pra quem mandou um vídeo na capa, "exporte em MP4"
  // seria resposta pra pergunta que ninguém fez.
  const familia = m.startsWith("video/") ? "video" : m.startsWith("image/") ? "imagem" : null;
  if (familia && aceita !== "qualquer" && familia !== aceita) return { ok: false, erro: CAMPO_ERRADO[aceita] };
  // .mov do iPhone é HEVC na maioria das vezes: toca no Safari e fica tela
  // preta no Chrome/Android — some pra metade de quem abre o tutorial.
  if (m === "video/quicktime") {
    return { ok: false, erro: "Vídeo .mov não toca em todo celular. Exporte em MP4 (H.264) e envie de novo." };
  }
  // HEIC só abre no Safari: a foto sumiria da página no Android e no Windows.
  if (m === "image/heic" || m === "image/heif" || m === "image/heic-sequence" || m === "image/heif-sequence") {
    return { ok: false, erro: "Foto HEIC (o padrão do iPhone) não abre em todo navegador. Exporte como JPG e envie de novo." };
  }
  // SVG é documento: carrega script dentro de uma página pública.
  if (m === "image/svg+xml") return { ok: false, erro: "SVG não é aceito porque pode carregar código. Exporte como PNG e envie de novo." };
  const f = FORMATOS[m];
  if (!f) return { ok: false, erro: `Formato não aceito. Use ${FORMATOS_DO_CAMPO[aceita]}.` };
  if (!Number.isFinite(tamanho) || tamanho <= 0) return { ok: false, erro: "O arquivo veio vazio. Escolha de novo." };
  const teto = f.tipo === "imagem" && opcoes.crua ? TETO_IMAGEM_CRUA : TETO_MIDIA_TUTORIAL[f.tipo];
  if (tamanho > teto) {
    return { ok: false, erro: `${ROTULO[f.tipo]} de ${emMB(tamanho)} passa do limite de ${emMB(teto)}. ${comoResolver(f.tipo, aceita)}` };
  }
  return { ok: true, tipo: f.tipo, ext: f.ext };
}

/** Caminho no bucket público: prefixo próprio (dá pra medir e limpar o que é
 *  dos tutoriais sem mexer em foto de produto) e nome único — arquivo nunca é
 *  sobrescrito, então o cache do navegador pode ser eterno. */
export function caminhoMidiaTutorial(ext: string, agora: Date = new Date()): string {
  const ano = agora.getUTCFullYear();
  const mes = String(agora.getUTCMonth() + 1).padStart(2, "0");
  return `tridiflow/tutoriais/${ano}/${mes}/${crypto.randomUUID()}.${ext}`;
}

// ── Endereço colado ──────────────────────────────────────────────────────────
const EXT_IMAGEM = /\.(jpe?g|png|webp|avif|gif)$/i;
const EXT_VIDEO = /\.(mp4|webm)$/i;
/** Página de vídeo (inclusive link sem id válido e o embed sem cookie): nunca
 *  é foto. A miniatura do YouTube mora em outro host ou termina em .jpg. */
const PAGINA_DE_VIDEO = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com)$/i;
/** Mídia que saiu do nosso Storage (a de hoje e a da rota antiga). */
const DO_NOSSO_STORAGE = /\/tridiflow\/tutoriais\//;

export type LinkDeMidia = { ok: true; url: string; tipo: "imagem" | "video" } | { ok: false; erro: string };

/**
 * Reconhece o endereço colado no campo. Vídeo vale se o player da página
 * pública sabe tocar (YouTube, Vimeo, arquivo .mp4/.webm); imagem, se é https
 * e termina em extensão de imagem — ou qualquer https que não seja vídeo,
 * quando o campo é só de foto (CDN de imagem raramente tem extensão no
 * caminho).
 *
 * Guarda o endereço como a pessoa colou (normalizado), não o do player: a
 * página pública monta o embed na hora de desenhar, e o link continua
 * reconhecível no editor.
 */
export function reconhecerLinkDeMidia(valor: string, aceita: AceitaMidiaTutorial): LinkDeMidia {
  const erro = aceita === "imagem"
    ? "Esse endereço não abre como imagem. Use um link que comece com https://."
    : "Esse link não abre como vídeo. Use um link do YouTube, do Vimeo ou de um arquivo .mp4.";
  const bruto = normalizarUrlPublica(valor);
  if (!bruto) return { ok: false, erro: "Cole o endereço antes de confirmar." };
  let u: URL;
  try { u = new URL(bruto); } catch { return { ok: false, erro }; }
  // http numa página https é bloqueado pelo navegador: a mídia sumiria no ar.
  if (u.protocol !== "https:") return { ok: false, erro };
  const url = u.toString();
  if (aceita !== "video" && EXT_IMAGEM.test(u.pathname)) return { ok: true, url, tipo: "imagem" };
  const e = embedDoTutorialVideo(url);
  // `embedDoTutorialVideo` aceita QUALQUER https como "arquivo"; aqui só
  // passa arquivo que o <video> toca — uma página de site viraria player preto.
  const video = !!e && (e.tipo !== "arquivo" || EXT_VIDEO.test(u.pathname));
  if (aceita === "imagem") {
    // Colar na capa o link do vídeo do tutorial é o engano provável. Aceito
    // como foto, virava <img> quebrado na página pública (e og:image inválido)
    // e o campo o chamava de "Foto", pedindo descrição de imagem.
    if (video || PAGINA_DE_VIDEO.test(u.hostname)) {
      return { ok: false, erro: "Este campo é só de foto, e esse link é de vídeo. Cole o endereço de uma imagem ou envie a foto." };
    }
    return { ok: true, url, tipo: "imagem" };
  }
  if (video) return { ok: true, url, tipo: "video" };
  return { ok: false, erro };
}

export type OrigemMidiaTutorial = "foto" | "video-enviado" | "youtube" | "vimeo" | "link";
export interface MidiaDescrita {
  origem: OrigemMidiaTutorial;
  /** Etiqueta que a pessoa lê no campo cheio ("Foto", "YouTube"…). */
  rotulo: string;
  /** É foto — o campo oferece a descrição pra leitor de tela. */
  imagem: boolean;
  /** Miniatura a desenhar; vazia = ícone no lugar. */
  miniatura: string;
  /** Saiu do nosso Storage (enviada pelo editor), não de um endereço colado.
   *  O campo só mostra o domínio de onde veio quando é de fora. */
  enviada: boolean;
}

const ROTULO_ORIGEM: Record<OrigemMidiaTutorial, string> = {
  foto: "Foto", "video-enviado": "Vídeo enviado", youtube: "YouTube", vimeo: "Vimeo", link: "Link",
};

/** O que está no campo, lido só do endereço guardado — vale pro que acabou de
 *  subir e pro que já estava salvo antes desta tela existir. `null` = vazio. */
export function descreverMidiaTutorial(url: string, capaUrl: string, aceita: AceitaMidiaTutorial): MidiaDescrita | null {
  const v = (url || "").trim();
  if (!v) return null;
  let caminho = v;
  try { caminho = new URL(normalizarUrlPublica(v)).pathname; } catch { /* caminho relativo: fica o texto */ }
  const enviada = DO_NOSSO_STORAGE.test(caminho);
  const monta = (origem: OrigemMidiaTutorial, miniatura: string): MidiaDescrita =>
    ({ origem, rotulo: ROTULO_ORIGEM[origem], imagem: origem === "foto", miniatura, enviada });
  if (aceita !== "imagem") {
    const e = embedDoTutorialVideo(v);
    if (e?.tipo === "youtube" && e.id) return monta("youtube", `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`);
    if (e?.tipo === "vimeo") return monta("vimeo", capaUrl);
  }
  // Endereço legado sem esquema ("cdn.com/a.jpg") viraria caminho relativo no <img>.
  if (aceita === "imagem" || EXT_IMAGEM.test(caminho)) return monta("foto", normalizarUrlPublica(v));
  if (EXT_VIDEO.test(caminho) && enviada) return monta("video-enviado", capaUrl);
  return monta("link", capaUrl);
}
