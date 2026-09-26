import { ImageResponse } from "next/og";

// Card de compartilhamento (WhatsApp, Slack, LinkedIn, X). Gerado no BUILD —
// esta rota é estática, então não custa invocação por acesso do robô.
//
// Desenhado em vez de virar PNG no repositório: assim a marca acompanha o
// símbolo do `GaiusMark.tsx` sem manter dois arquivos em sincronia na mão.
// O `next/og` roda um subconjunto do CSS: só flex, sem grid e sem cascata.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Gaius · Tridi — painel de vendas e produção em tempo real";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 84px",
          // Horizonte de eventos: o mesmo glow roxo da atmosfera do app, pintado
          // NO FUNDO em vez de num filho absoluto — o Satori recorta o filho que
          // passa da borda e o brilho saía com canto reto no meio da imagem.
          backgroundColor: "#000000",
          backgroundImage:
            "radial-gradient(circle 620px at 82% 6%, rgba(124,58,237,.55), rgba(124,58,237,0))",
          color: "#f5f5f7",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(124,58,237,.22)",
              border: "2px solid rgba(124,58,237,.55)",
            }}
          >
            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#c4a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
              <path d="M12 12h5" />
              <path d="M17 12v4" />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 34, letterSpacing: 8, fontWeight: 700, color: "#c4a6ff" }}>
            GAIUS
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 44, fontSize: 78, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
          Vendas e produção
        </div>
        <div style={{ display: "flex", fontSize: 78, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, color: "#b9b9c2" }}>
          em tempo real
        </div>

        <div style={{ display: "flex", marginTop: 40, fontSize: 30, color: "#8e8e93" }}>
          ERP da Tridi · estoque, pessoas, financeiro e tráfego num lugar só
        </div>
      </div>
    ),
    size,
  );
}
