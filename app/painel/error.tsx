"use client";

import { useEffect } from "react";

// Erro da TV: não tem ninguém com mouse na frente da parede, então a tela se
// recupera SOZINHA — tenta o `reset()` em 20s e, se quebrar de novo, recarrega
// a página inteira em 60s. Nunca fica parada num erro genérico.
export default function PainelErro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[erro no painel]", error);
    const tenta = setTimeout(() => reset(), 20_000);
    const recarrega = setTimeout(() => window.location.reload(), 60_000);
    return () => {
      clearTimeout(tenta);
      clearTimeout(recarrega);
    };
  }, [error, reset]);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 16,
        padding: 40,
        background: "#0c0c14",
        color: "#e8e8f2",
        textAlign: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800 }}>Painel reiniciando…</h1>
      <p style={{ margin: 0, fontSize: 18, color: "#9a9ab0" }}>
        O painel encontrou um erro e vai tentar de novo sozinho em instantes.
      </p>
      {error.digest && (
        <p style={{ margin: 0, fontSize: 13, color: "#5a5a70" }}>Código: {error.digest}</p>
      )}
    </main>
  );
}
