"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "./(plataforma)/Icon";

// Fronteira de erro de ROTA (o "500" que a pessoa vê). Pega qualquer exceção
// de renderização abaixo do layout raiz e oferece o único caminho que costuma
// resolver: tentar de novo. `reset()` re-renderiza o segmento sem recarregar a
// página inteira — a sessão e o tema continuam de pé.
//
// O layout raiz continua vivo aqui; quem morre COM o layout cai no
// `global-error.tsx`, que precisa desenhar o próprio <html>.
export default function ErroDeRota({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sem serviço de telemetria no projeto: o console é o registro. O `digest`
    // é o que casa esta tela com a linha do log do servidor.
    console.error("[erro de rota]", error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100dvh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 20,
        padding: "calc(40px + var(--safe-t)) max(18px, calc((100% - 520px) / 2)) calc(48px + var(--safe-b))",
        background: "var(--bg)",
        color: "var(--text)",
        textAlign: "center",
      }}
    >
      <div className="gaius-atmos" aria-hidden />

      <div
        aria-hidden
        style={{
          width: 76,
          height: 76,
          borderRadius: "var(--r-lg)",
          display: "grid",
          placeItems: "center",
          background: "color-mix(in srgb, var(--perigo) 15%, transparent)",
          border: "1px solid color-mix(in srgb, var(--perigo) 34%, transparent)",
        }}
      >
        <Icon name="alert-triangle" size={36} color="var(--perigo)" />
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: ".14em", color: "var(--text-dim)" }}>
          ALGO QUEBROU AQUI
        </p>
        <h1 style={{ margin: 0, fontSize: "clamp(24px, 6.5vw, 32px)", lineHeight: 1.15, fontWeight: 800 }}>
          Não conseguimos abrir esta tela
        </h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "var(--text-dim)" }}>
          O erro é nosso, não seu — e nada do que você fez até agora foi perdido.
          Tentar de novo resolve na maioria das vezes.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", width: "100%" }}>
        <button className="ui-btn" data-v="primario" data-t="lg" onClick={reset} style={{ flex: "1 1 200px", maxWidth: 260 }}>
          <Icon name="refresh" size={18} color="var(--on-primary, #fff)" />
          Tentar de novo
        </button>
        <Link className="ui-btn" data-v="secundario" data-t="lg" href="/inicio" style={{ flex: "1 1 160px", maxWidth: 260 }}>
          <Icon name="home" size={18} />
          Voltar ao início
        </Link>
      </div>

      {error.digest && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>
          Código do erro: <code style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{error.digest}</code>
        </p>
      )}
    </main>
  );
}
