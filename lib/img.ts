// Compressão de imagem no cliente antes de subir pro Supabase — mantém os
// arquivos leves (redimensiona p/ no máx. 1280px e recomprime em JPEG ~0.7).
export async function compressImage(file: File, maxDim = 1280, quality = 0.7): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file; // se algo falhar, sobe o original
  }
}

// Comprime e sobe pro bucket de fotos; retorna a URL pública (ou null).
export async function uploadFotoComprimida(file: File): Promise<string | null> {
  const blob = await compressImage(file);
  const fd = new FormData();
  fd.append("file", new File([blob], `atividade-${Date.now()}.jpg`, { type: "image/jpeg" }));
  fd.append("bucket", "photos");
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  if (!r.ok) return null;
  const d = await r.json();
  return (d.url as string) || null;
}
