import type { Metadata } from "next";
import { StatusClient } from "./StatusClient";

export const metadata: Metadata = { title: "Status · Tridi" };

// Página de status PÚBLICA (decisão do dono, 15/09/2026): qualquer pessoa com o
// link vê se as plataformas e os funis estão no ar, sem login. Fica fora de
// `(plataforma)` porque ali o layout exige sessão. Os dados não passam pelo
// Gaius: o navegador lê o Gatus e o flags.json na VPS (CORS só pro Gaius), então
// abrir esta página não custa invocação nem egress além da própria carga.
// O que continua fechado: o aviso na tela e o selo, só pra quem tem a chave
// `administracao:status` (admin, TI e gestor) — ver Shell.tsx.
export default function StatusPublicoPage() {
  return (
    <main style={{ minHeight: "100dvh", background: "var(--bg)", padding: "calc(24px + var(--safe-t, 0px)) clamp(12px, 3vw, 32px) calc(32px + var(--safe-b, 0px))" }}>
      <StatusClient />
    </main>
  );
}
