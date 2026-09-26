"use client";

// Porta do Montador: só carrega o código dele fora de produção e nas /dev-*.
// `ssr: false` porque ele vive num portal no <body> e mede o DOM.
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const MontadorDev = dynamic(() => import("./MontadorDev"), { ssr: false });

export function MontadorHost() {
  const rota = usePathname() || "";
  if (process.env.NODE_ENV === "production" || !rota.startsWith("/dev-")) return null;
  return <MontadorDev />;
}
