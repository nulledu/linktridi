"use client";

import { useEffect } from "react";

// ÚLTIMA rede: pega o erro que derruba o próprio layout raiz. Aqui o React já
// descartou tudo — inclusive o <html> do `layout.tsx` —, então esta tela tem
// que desenhar o documento inteiro sozinha.
//
// Por isso NADA de import: sem `globals.css` (o layout que o importa é
// justamente o que morreu), sem `<Icon>` e sem `next/link`. Estilo é inline e
// o ícone é SVG do Tabler colado (mesmos paths do `Icon.tsx`, viewBox 0 0 24
// 24, stroke 2). Se este arquivo depender de algo que possa quebrar, não
// sobrou rede nenhuma embaixo.
export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[erro global]", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0 }}>
        {/* Tokens locais: o tema segue a preferência do sistema porque o script
            que aplica o tema salvo vive no layout raiz, que não rodou. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
.ge{--ge-bg:#f2f2f7;--ge-surf:#ffffff;--ge-txt:#1c1c1e;--ge-dim:#6b6b76;--ge-linha:rgba(0,0,0,.1);--ge-primary:#7c3aed;--ge-perigo:#d70015;}
@media (prefers-color-scheme: dark){.ge{--ge-bg:#000000;--ge-surf:rgba(255,255,255,.06);--ge-txt:#f5f5f7;--ge-dim:#b9b9c2;--ge-linha:rgba(255,255,255,.12);--ge-perigo:#ff453a;}}
.ge-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;
  min-height:44px;padding:0 21px;border-radius:12px;border:1px solid transparent;
  font:inherit;font-size:15px;font-weight:650;cursor:pointer;text-decoration:none;
  flex:1 1 200px;max-width:260px;-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
.ge-btn:active{transform:scale(.97);}
.ge-btn:focus-visible{outline:2px solid var(--ge-primary);outline-offset:2px;}
.ge-btn[data-v="1"]{background:var(--ge-primary);color:#fff;}
.ge-btn[data-v="2"]{background:var(--ge-surf);color:var(--ge-txt);border-color:var(--ge-linha);}
@media (prefers-reduced-motion: reduce){.ge-btn:active{transform:none;}}
`,
          }}
        />
        <main
          className="ge"
          style={{
            minHeight: "100dvh",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: 20,
            padding: "40px max(18px, calc((100% - 520px) / 2)) 48px",
            background: "var(--ge-bg)",
            color: "var(--ge-txt)",
            textAlign: "center",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          }}
        >
          <div
            aria-hidden
            style={{
              width: 76,
              height: 76,
              borderRadius: 22,
              display: "grid",
              placeItems: "center",
              background: "color-mix(in srgb, var(--ge-perigo) 15%, transparent)",
              border: "1px solid color-mix(in srgb, var(--ge-perigo) 34%, transparent)",
            }}
          >
            {/* Tabler · alert-triangle */}
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--ge-perigo)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 9v4" />
              <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0" />
              <path d="M12 16h.01" />
            </svg>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: ".14em", color: "var(--ge-dim)" }}>
              FALHA GERAL
            </p>
            <h1 style={{ margin: 0, fontSize: "clamp(24px, 6.5vw, 32px)", lineHeight: 1.15, fontWeight: 800 }}>
              O sistema não conseguiu carregar
            </h1>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "var(--ge-dim)" }}>
              Foi um erro nosso. Recarregar costuma resolver; se insistir,
              avise a equipe com o código abaixo.
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", width: "100%" }}>
            <button className="ge-btn" data-v="1" onClick={reset}>
              {/* Tabler · refresh */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
                <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
              </svg>
              Tentar de novo
            </button>
            {/* <a> e não <Link>: sem layout raiz, o roteador do cliente não é
                confiável — a navegação dura recarrega tudo do zero. */}
            <a className="ge-btn" data-v="2" href="/inicio">
              {/* Tabler · home */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l-2 0l9 -9l9 9l-2 0" />
                <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" />
                <path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6" />
              </svg>
              Voltar ao início
            </a>
          </div>

          {error.digest && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--ge-dim)" }}>
              Código do erro:{" "}
              <code style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{error.digest}</code>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
