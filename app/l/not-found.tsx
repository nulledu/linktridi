import type { Metadata } from "next";

// 404 da VITRINE: quem cai aqui é cliente da loja, não colaborador — então
// nada de atalho pra /inicio, /login nem qualquer cara do ERP. A tela é
// neutra de propósito (sem tokens do tema da loja: o slug pode nem existir,
// que é exatamente o caso mais comum de cair aqui).
export const metadata: Metadata = {
  title: "Página não encontrada",
  robots: { index: false, follow: false },
};

export default function VitrineNaoEncontrada() {
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
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: ".14em", color: "#8a8a8a" }}>
        ERRO 404
      </p>
      <h1 style={{ margin: 0, fontSize: "clamp(24px, 6.5vw, 32px)", lineHeight: 1.2, fontWeight: 700 }}>
        Essa página não existe
      </h1>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "#5a5a5a" }}>
        O endereço pode estar errado ou a loja pode ter mudado este link.
        Confira o endereço que você recebeu, ou volte pela página anterior.
      </p>
    </main>
  );
}
