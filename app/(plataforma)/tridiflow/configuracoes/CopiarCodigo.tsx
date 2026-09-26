"use client";

// Bloco de código copiável (usado em Webhooks). Client por causa do clipboard.
// O botão confirma no próprio lugar (ícone vira visto, rótulo vira "Copiado").
import { BotaoCopiar } from "../_shared/ConfigMicro";

export function CopiarCodigo({ codigo }: { codigo: string }) {
  return (
    <div style={{ position: "relative" }}>
      <BotaoCopiar texto={codigo} tom="escuro" style={{ position: "absolute", top: 8, right: 8 }} />
      {/* Topo reservado pro botão: sem isso ele cobria a 1ª linha no celular. */}
      <pre style={{ margin: 0, background: "#0f172a", color: "#e2e8f0", borderRadius: 12, padding: "48px 14px 14px", fontSize: 12, lineHeight: 1.55, overflowX: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", whiteSpace: "pre" }}>{codigo}</pre>
    </div>
  );
}
