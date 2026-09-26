import type { Metadata } from "next";

// A página é "use client" e não pode exportar metadata — o layout do segmento
// existe só pra dar título próprio à aba.
export const metadata: Metadata = {
  title: "Primeiro acesso · Gaius",
  robots: { index: false, follow: false },
};

export default function PrimeiroAcessoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
