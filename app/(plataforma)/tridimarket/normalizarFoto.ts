"use client";

import { encaixarNoQuadrado, LADO_PADRAO } from "@/lib/tridimarket/imagem";

// Padroniza a foto ANTES de subir: quadrado de 1000×1000 com a embalagem
// inteira dentro e fundo branco na sobra.
//
// Por que no navegador e não no servidor: o projeto não tem `sharp`, e colocar
// um binário de imagem no build só por causa disso pesa mais do que resolve. O
// arquivo já está na mão de quem escolheu — normalizar aqui também economiza
// upload (foto de celular de 4 MB sobe como ~150 KB).
//
// Fundo BRANCO, não transparente: a lista do tablet e a do ERP têm fundos
// diferentes (e tema claro/escuro), então PNG transparente ficaria com halo
// escuro num e sumiria no outro. Branco é o fundo em que foto de produto foi
// fotografada.

/** Falhou a decodificação (SVG, arquivo corrompido) → sobe o original. */
export async function normalizarQuadrada(arquivo: File, lado = LADO_PADRAO): Promise<File> {
  try {
    const bitmap = await carregar(arquivo);
    const canvas = document.createElement("canvas");
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext("2d");
    if (!ctx) return arquivo;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, lado, lado);
    const e = encaixarNoQuadrado(bitmap.width, bitmap.height, lado);
    if (!e.largura || !e.altura) return arquivo;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, e.x, e.y, e.largura, e.altura);
    if ("close" in bitmap) bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.9));
    if (!blob) return arquivo;
    const nome = arquivo.name.replace(/\.[^.]+$/, "") || "foto";
    return new File([blob], `${nome}.jpg`, { type: "image/jpeg" });
  } catch {
    return arquivo;
  }
}

async function carregar(arquivo: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") return await createImageBitmap(arquivo);
  const url = URL.createObjectURL(arquivo);
  try {
    return await new Promise<HTMLImageElement>((ok, falhou) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => falhou(new Error("decode"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
