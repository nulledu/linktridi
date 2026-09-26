import type { Metadata } from "next";

// A página é "use client" e não pode exportar metadata — o layout do segmento
// existe SÓ pra dar título próprio à aba (é a tela que todo deslogado vê).
export const metadata: Metadata = {
  title: "Entrar · Gaius",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
