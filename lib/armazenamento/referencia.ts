// Referência de arquivo PRIVADO — a parte isomórfica (roda no navegador e no
// servidor, sem SDK nenhum).
//
// Regra da casa a partir de set/2026: o que é público (foto de produto, logo,
// criativo, vitrine) continua no Storage do Supabase, com URL pública
// absoluta gravada no banco. O que é PRIVADO (mídia do chat, anexo de
// mensagem, vídeo, selfie) vai pro Backblaze B2 num bucket fechado, e o que
// vai pro banco é um caminho RELATIVO do próprio app: `/api/arquivos/<chave>`.
//
// Por que caminho relativo e não `b2:chave`: todo leitor de `url` que já
// existe (img src, <a download>, <video>) continua funcionando sem mexer em
// nada — o navegador resolve contra o domínio do app, a rota confere a sessão
// e redireciona pra uma URL assinada de curta duração. O que já está no
// Supabase (URL absoluta) segue igual; só o NOVO nasce no B2.

export const ROTA_ARQUIVOS = "/api/arquivos";

/** Áreas privadas conhecidas — viram o primeiro segmento da chave. */
export const AREAS_PRIVADAS = [
  "chat", // Central · Mensagens (anexos, imagens, áudios)
  "videos", // vídeos internos (tutoriais, treinamentos)
  "criativos", // Biblioteca de Criativos (peça de anúncio: imagem e vídeo curto)
  "stories", // Marketing · Stories (o print ou o vídeo de cada story que foi ao ar)
  "ponto", // selfies e provas do ponto
  "atestados", // comprovante da justificativa de ponto (atestado, declaração, convocação)
  "documentos", // PDFs e documentos internos
  "curriculos", // currículos de candidatos (funil de candidatura, upload público)
  "modelos", // arquivos de impressão 3D (STL, OBJ, 3MF, G-code…) — biblioteca do módulo 3D
  "design", // Design › Biblioteca: templates, fontes, mockups, editáveis, referências
  "geral", // qualquer outro arquivo privado
] as const;
export type AreaPrivada = (typeof AREAS_PRIVADAS)[number];

export function ehAreaPrivada(v: unknown): v is AreaPrivada {
  return typeof v === "string" && (AREAS_PRIVADAS as readonly string[]).includes(v);
}

/**
 * Áreas em que o NAVEGADOR pode pedir presign, e a chave de módulo que isso
 * exige (`null` = qualquer pessoa ativa). `ponto` e `documentos` ficam de fora:
 * selfie só nasce do tablet, anexo do Financeiro e nota do mercadinho só
 * nascem das rotas dos módulos, que já validam tipo, tamanho e empresa. Sem
 * esta lista, qualquer usuário criava arquivo em área que nem enxerga.
 */
export const AREAS_DO_NAVEGADOR: Partial<Record<AreaPrivada, string | null>> = {
  chat: null,
  geral: null,
  videos: null,
  criativos: "marketing:criar",
  // Quem registra story é quem cria no Marketing — a mesma chave que a rota de
  // stories pede pra gravar. Presign aqui sem ela seria arquivo órfão garantido.
  stories: "marketing:criar",
  // O colaborador sobe o PRÓPRIO atestado ao pedir a justificativa, e ele não
  // tem chave nenhuma do RH — por isso escrever é aberto a qualquer pessoa
  // ativa, como em `chat` e `geral`. O que é restrito aqui é LER (abaixo):
  // documento de saúde não abre pra quem tem o link.
  atestados: null,
  // Modelo 3D nasce da tela da biblioteca, e quem enxerga a área envia — o
  // módulo é a oficina inteira, não tem papel "só leitura" por enquanto.
  modelos: "3d",
  // Material do setor nasce da Biblioteca do Design; quem tem o módulo envia.
  design: "design",
};

/**
 * Quem LÊ cada área pela rota genérica (`null` = qualquer pessoa ativa;
 * `"superusuario"` é regra própria). É o espelho das permissões dos módulos:
 * ter o link não pode valer mais que ter a área.
 */
export const LEITURA_POR_AREA: Record<AreaPrivada, string | string[] | null | "superusuario"> = {
  chat: null,
  geral: null,
  videos: null,
  // Lista = QUALQUER uma das chaves abre. A peça do criativo é vista de dois
  // lugares: Marketing (quem produz) e Tridify (quem compra mídia e quer ver
  // qual anúncio é aquele que vendeu).
  criativos: ["marketing:ver", "trafego:analisar"],
  // A chave da ÁREA (qualquer sub do Marketing a liga): é a mesma que a página
  // e a rota de stories pedem. Com uma sub aqui, quem enxerga o quadro veria
  // cards sem imagem — a mídia 403 dentro de uma tela que abriu.
  stories: "marketing",
  documentos: "financeiro:ver",
  // Currículo é dado sensível do candidato: só quem trabalha os funis (a mesma
  // chave que abre o editor e a tela de Resultados do TridiFlow) lê o arquivo.
  curriculos: ["tridiflow:projetos", "rh:curriculos_arquivo"],
  modelos: "3d",
  design: "design",
  ponto: "superusuario",
  // Atestado é informação de saúde — a mesma razão que faz `rh:atestados` ser
  // chave `sensivel` em `lib/areas.ts`. Abre pra quem cuida de atestado no RH
  // e pra quem administra o ponto (é de lá que a justificativa é decidida).
  // Quem SUBIU o arquivo também reabre o dele: essa exceção é por DONO e mora
  // na rota (`donoDoAnexoDoPonto`), não aqui — chave não distingue pessoa.
  atestados: ["rh:atestados", "administracao", "colaboradores"],
};

const MB = 1024 * 1024;

/**
 * TETO DE TAMANHO, em bytes, por área e por família de mime. `0` = tipo não
 * aceito naquela área. É a MESMA tabela que a rota de presign aplica e que a
 * tela mostra antes de a pessoa escolher o arquivo — teto que só existe no
 * servidor vira "falhou e não disse por quê".
 *
 * Por que a Biblioteca de Criativos é a área mais apertada do app: peça de
 * anúncio é feita pra rodar no feed, e a própria Meta recodifica tudo que
 * chega. Vídeo 1080p vertical de 30 s bem codificado dá 15–22 MB; de 60 s bem
 * comprimido, ~30 MB. Imagem de anúncio, mesmo PNG cheio de texto, raramente
 * passa de 3 MB. Então 30 MB de vídeo e 8 MB de imagem cobrem com folga TODO
 * criativo legítimo e barram o que não deveria estar aqui: export cru, ProRes,
 * 4K, gravação de tela de 10 minutos. O limite não é economia de disco — é o
 * que mantém a biblioteca sendo biblioteca.
 */
export const TETO_PADRAO = 100 * MB;
const TETOS: Partial<Record<AreaPrivada, { imagem?: number; video?: number; outro?: number }>> = {
  criativos: { imagem: 8 * MB, video: 30 * MB, outro: 0 },
  // Story é registro do que foi ao ar, não peça de produção: o print chega
  // comprimido pela tela (WebP de 1600 px, uns 300 KB) e o vídeo tem no máximo
  // 60 s, que é o teto do próprio Instagram por story. 40 MB cobre 60 s em
  // 1080p bem exportado; gravação de tela crua e 4K ficam de fora.
  stories: { imagem: 8 * MB, video: 40 * MB, outro: 0 },
  videos: { video: 500 * MB, imagem: 8 * MB, outro: 0 },
  // Currículo: documento (PDF/DOC/DOCX) ou FOTO do currículo (21/09/2026 —
  // muita gente só tem no celular). 10 MB cobre foto de câmera; vídeo barrado.
  curriculos: { outro: 10 * MB, imagem: 10 * MB, video: 0 },
  // Atestado é foto de papel ou PDF do consultório. 8 MB cobre com folga a foto
  // de celular; vídeo não tem o que fazer aqui.
  atestados: { imagem: 8 * MB, outro: 10 * MB, video: 0 },
  // Modelo de impressão chega como `outro` (STL/OBJ/3MF/G-code viram
  // octet-stream no navegador). 200 MB cobre peça grande fatiada; imagem é a
  // foto/render da peça que ilustra o card; vídeo não tem o que fazer aqui.
  modelos: { outro: 200 * MB, imagem: 8 * MB, video: 0 },
  // Editável de design é pesado: PSD/AI em camadas e pacote de fonte passam
  // fácil de 50 MB. Imagem pronta (mockup, referência) cabe em 25; vídeo só
  // como referência curta.
  design: { outro: 150 * MB, imagem: 25 * MB, video: 50 * MB },
};

/** Família do mime, que é o que os tetos usam (o mime exato varia por navegador). */
export function familiaDoMime(mime: string): "imagem" | "video" | "audio" | "outro" {
  const m = (mime || "").split(";")[0].trim().toLowerCase();
  if (m.startsWith("image/")) return "imagem";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "outro";
}

/** Quantos bytes esta área aceita deste mime. `0` = recusa o tipo. */
export function tetoDoEnvio(area: AreaPrivada, mime: string): number {
  const regra = TETOS[area];
  if (!regra) return TETO_PADRAO;
  const familia = familiaDoMime(mime);
  const chave = familia === "audio" ? "outro" : familia;
  return regra[chave] ?? regra.outro ?? TETO_PADRAO;
}

/** "8 MB", "30 MB" — pra mensagem de erro e pra dica na tela. */
export function emMB(bytes: number): string {
  return `${Math.round((bytes / MB) * 10) / 10} MB`.replace(".0 ", " ");
}

/** Nome de arquivo pra cabeçalho: sem aspas, barra, quebra de linha nem controle; 150 chars. */
export function nomeParaCabecalho(nome: string | null | undefined, reserva = "arquivo"): string {
  const limpo = (nome ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f"\\/]/g, "_")
    .trim()
    .slice(0, 150);
  return limpo || reserva;
}

/**
 * Tipo servido a partir da EXTENSÃO da chave, nunca do que o cliente gravou.
 * O PUT direto no B2 aceita qualquer `content-type` (um `.jpg` pode nascer
 * `text/html`), e servir isso inline abriria HTML de um usuário na origem do
 * B2. Só o que é seguro exibir abre inline; o resto baixa como
 * `application/octet-stream`. O `.svg` fica fora de propósito: carrega script.
 */
const INLINE: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", "3gp": "video/3gpp",
  mp3: "audio/mpeg", ogg: "audio/ogg", oga: "audio/ogg", m4a: "audio/mp4", amr: "audio/amr", weba: "audio/webm", wav: "audio/wav", opus: "audio/ogg",
  pdf: "application/pdf",
};

export function tipoServido(chave: string): { mime: string; inline: boolean } {
  const ext = chave.includes(".") ? chave.split(".").pop()!.toLowerCase() : "";
  const mime = INLINE[ext];
  return mime ? { mime, inline: true } : { mime: "application/octet-stream", inline: false };
}

/** Uma chave é `area/aaaa/mm/<id>.<ext>` — sem `..`, sem barra dupla, sem espaço. */
const CHAVE_OK = /^[a-z]+\/\d{4}\/\d{2}\/[a-z0-9-]+(\.[a-z0-9]{1,10})?$/;

export function chaveValida(chave: string): boolean {
  if (!CHAVE_OK.test(chave)) return false;
  const area = chave.split("/")[0];
  return ehAreaPrivada(area);
}

export function areaDaChave(chave: string): AreaPrivada | null {
  const area = chave.split("/")[0];
  return ehAreaPrivada(area) ? area : null;
}

/** Extensão limpa (só letras/números, no máximo 10) a partir do nome ou do mime. */
export function extensaoDe(nome: string, mime?: string | null): string {
  const doNome = nome.includes(".") ? nome.split(".").pop()!.toLowerCase() : "";
  if (/^[a-z0-9]{1,10}$/.test(doNome)) return doNome;
  const porMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/webm": "weba",
    "audio/mp4": "m4a",
    "application/pdf": "pdf",
  };
  return (mime && porMime[mime]) || "bin";
}

/** Gera a chave de um arquivo novo: `area/aaaa/mm/<uuid>.<ext>`. */
export function novaChave(area: AreaPrivada, nome: string, mime?: string | null, agora = new Date()): string {
  const aaaa = agora.getUTCFullYear();
  const mm = String(agora.getUTCMonth() + 1).padStart(2, "0");
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${area}/${aaaa}/${mm}/${id}.${extensaoDe(nome, mime)}`;
}

/** O que vai pro banco: caminho relativo servido pela rota autenticada. */
export function urlPrivada(chave: string): string {
  return `${ROTA_ARQUIVOS}/${chave}`;
}

/** `true` se o valor gravado aponta pro armazenamento privado. */
export function ehUrlPrivada(valor: string | null | undefined): boolean {
  return typeof valor === "string" && valor.startsWith(`${ROTA_ARQUIVOS}/`);
}

/** Chave a partir do valor gravado (`/api/arquivos/<chave>`), ou null. */
export function chaveDaUrl(valor: string | null | undefined): string | null {
  if (!ehUrlPrivada(valor)) return null;
  const chave = valor!.slice(ROTA_ARQUIVOS.length + 1).split("?")[0];
  return chaveValida(chave) ? chave : null;
}
