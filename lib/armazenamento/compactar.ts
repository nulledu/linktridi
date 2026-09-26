import sharp from "sharp";

// ── Toda imagem entra compactada ────────────────────────────────────────────
// Regra do dono (24/09/2026): "quero compactadas sempre, antes de entrar no
// banco". Foto de celular chegava crua — a Central de Tutoriais baixava 16 MB
// pra mostrar círculos de 120px. Aqui é a ÚLTIMA porta: todo gravador do
// servidor (guardarPublico, enviarPrivado, os uploads diretos no Supabase)
// passa por ela. O navegador já comprime antes de subir (`comprimirImagem` em
// ui/midia.ts); isto pega o que vier sem passar por lá.
//
// WebP, lado máximo 1600px, qualidade 80, orientação do EXIF aplicada.
// GIF (pode ser animado) e SVG (vetor) passam intocados. Se o resultado não
// ficar menor, fica o original — comprimir nunca pode piorar o arquivo.
//
// A EXTENSÃO acompanha o conteúdo: o tipo servido sai da extensão da chave
// (`tipoServido` no privado), então quem grava usa o `caminho` devolvido.

export const LADO_MAXIMO = 1600;
const QUALIDADE = 80;
const COMPACTAVEIS = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif", "image/tiff", "image/bmp", "image/heic", "image/heif"]);

type Corpo = ArrayBuffer | Uint8Array | Blob | string;

export function trocarExtensao(caminho: string, ext: string): string {
  const barra = caminho.lastIndexOf("/");
  const ponto = caminho.lastIndexOf(".");
  return (ponto > barra ? caminho.slice(0, ponto) : caminho) + "." + ext;
}

export async function compactarImagem<C extends Corpo>(
  corpo: C, mime: string, caminho: string,
): Promise<{ corpo: C | Buffer; mime: string; caminho: string }> {
  const tipo = (mime || "").toLowerCase();
  if (!COMPACTAVEIS.has(tipo) || typeof corpo === "string") return { corpo, mime, caminho };
  try {
    const entrada = corpo instanceof Blob ? Buffer.from(await corpo.arrayBuffer())
      : Buffer.from(corpo instanceof Uint8Array ? corpo : new Uint8Array(corpo));
    const saida = await sharp(entrada, { failOn: "none" })
      .rotate()
      .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALIDADE })
      .toBuffer();
    if (saida.length >= entrada.length) return { corpo, mime, caminho };
    return { corpo: saida, mime: "image/webp", caminho: trocarExtensao(caminho, "webp") };
  } catch {
    // Arquivo que o sharp não lê (corrompido, formato exótico) segue como veio:
    // perder o envio é pior que guardar um arquivo grande.
    return { corpo, mime, caminho };
  }
}
