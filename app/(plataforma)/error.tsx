"use client";

import { useEffect } from "react";
import { Icon } from "./Icon";

// Fronteira de erro DENTRO do shell: uma tela que quebra derruba só a coluna
// de conteúdo — sidebar, topo e navegação continuam de pé, então a pessoa
// troca de área sem recarregar nada. Quem morre COM o layout cai no
// `app/error.tsx` (tela cheia) e, por fim, no `global-error.tsx`.
export default function ErroDaTela({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sem serviço de telemetria: o console é o registro; o `digest` casa esta
    // tela com a linha do log do servidor.
    console.error("[erro de tela]", error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "60dvh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 18,
        padding: "40px max(18px, calc((100% - 480px) / 2)) 48px",
        color: "var(--text)",
        textAlign: "center",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 64,
          height: 64,
          borderRadius: "var(--r-lg)",
          display: "grid",
          placeItems: "center",
          background: "color-mix(in srgb, var(--perigo) 15%, transparent)",
          border: "1px solid color-mix(in srgb, var(--perigo) 34%, transparent)",
        }}
      >
        <Icon name="alert-triangle" size={30} color="var(--perigo)" />
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: "clamp(20px, 5.5vw, 26px)", lineHeight: 1.2, fontWeight: 800 }}>
          Esta tela não conseguiu abrir
        </h1>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: "var(--text-dim)" }}>
          O resto do sistema continua funcionando — dá pra trocar de área pelo
          menu ao lado. Tentar de novo costuma resolver.
        </p>
      </div>

      <button className="ui-btn" data-v="primario" data-t="lg" onClick={reset} style={{ minWidth: 200 }}>
        <Icon name="refresh" size={18} color="var(--on-primary, #fff)" />
        Tentar de novo
      </button>

      {error.digest && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>
          Código do erro: <code style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{error.digest}</code>
        </p>
      )}
    </main>
  );
}
