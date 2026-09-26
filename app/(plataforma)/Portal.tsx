"use client";

// Renderiza o conteúdo no <body> (fora da árvore). Modais com position:fixed
// DENTRO de um ancestral com backdrop-filter/transform/filter (ex.: cards .glass)
// eram "contidos" por ele e saíam do centro da tela / ficavam cortados. Portar
// pro body escapa esse bloco de contenção → o fixed volta a ser relativo à tela.
// `mounted` evita mismatch de hidratação (document só existe no cliente).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
