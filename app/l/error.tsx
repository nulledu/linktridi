"use client";

import { useEffect } from "react";

// Erro da VITRINE: público, cara neutra (o tema da loja pode ser exatamente o
// que quebrou), sem nada do ERP. O botão re-renderiza o segmento sem recarregar.
export default function VitrineErro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[erro na vitrine]", error);
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
        gap: 14,
        padding: "48px max(18px, calc((100% - 480px) / 2))",
        background: "#fafafa",
        color: "#1a1a1a",
        textAlign: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "clamp(22px, 6vw, 30px)", lineHeight: 1.2, fontWeight: 700 }}>
        A loja não conseguiu abrir
      </h1>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "#5a5a5a" }}>
        Foi um erro do nosso lado, não do seu. Tentar de novo costuma resolver.
      </p>
      <button
        onClick={reset}
        style={{
          marginTop: 6,
          minHeight: 44,
          padding: "0 28px",
          borderRadius: 10,
          border: "1px solid #d8d8d8",
          background: "#1a1a1a",
          color: "#fff",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Tentar de novo
      </button>
      {error.digest && (
        <p style={{ margin: 0, fontSize: 12, color: "#8a8a8a" }}>
          Código: <code>{error.digest}</code>
        </p>
      )}
    </main>
  );
}
