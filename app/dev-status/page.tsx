import { notFound } from "next/navigation";
import { StatusClient } from "../status/StatusClient";
import { StatusAlerta } from "../(plataforma)/StatusAviso";

// Banco de provas da página de status (/status), sem login. Lê o Gatus de
// verdade: o CORS de status.gedux.com.br libera localhost:3000.
// Duas travas (CLAUDE.md): DEV_ONLY_PREFIXES no middleware + este notFound.
export default function DevStatusPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main style={{ padding: "24px clamp(12px, 3vw, 32px)", minHeight: "100dvh", background: "var(--bg)" }}>
      <StatusClient />
      <StatusAlerta />
    </main>
  );
}
