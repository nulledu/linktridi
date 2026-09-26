// ── O que o candidato pode anexar como currículo ─────────────────────────────
// Um lugar só pro navegador (filtro do seletor, erro amigável) e pro servidor
// (presign). Imagem entrou em 21/09/2026: muita gente só tem o currículo como
// foto no celular. HEIC/HEIF baixa como arquivo (o navegador não abre inline).

export const EXTENSOES_CURRICULO = ["pdf", "doc", "docx", "jpg", "jpeg", "png", "webp", "heic", "heif"] as const;
export const ACEITOS_TEXTO = "PDF, Word ou foto (JPG, PNG)";
export const ACCEPT_CURRICULO = ".pdf,.doc,.docx,application/pdf,image/*";

export function extensaoDoArquivo(nome: string): string {
  return nome.includes(".") ? nome.split(".").pop()!.toLowerCase() : "";
}

export function curriculoAceito(ext: string): boolean {
  return (EXTENSOES_CURRICULO as readonly string[]).includes(ext);
}

const MIME: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  heic: "image/heic", heif: "image/heif",
};

/** Mime do envio: define o teto (família imagem/outro) e o Content-Type do PUT. */
export function mimeDoCurriculo(ext: string): string {
  return MIME[ext] ?? "application/octet-stream";
}
