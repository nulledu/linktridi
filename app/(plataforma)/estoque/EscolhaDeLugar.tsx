"use client";

// ── "Este item está em mais de um lugar" ─────────────────────────────────────
//
// A resposta 409 `precisa_lugar` do ajuste-qr vira esta pergunta: uma fileira
// de botões com o lugar e o saldo. Compartilhado entre a Entrada por leitura e
// a baixa por etiqueta de produto — a MESMA pergunta nos dois painéis.

import type { LugarComSaldo } from "@/lib/estoque-transferencia";

export function EscolhaDeLugar({ frase, lugares, onEscolher }: {
  frase: string;
  lugares: LugarComSaldo[];
  onEscolher: (localId: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{frase}</span>
      {lugares.map((l) => (
        <button key={l.id} type="button" onClick={() => onEscolher(l.id)}
          style={{ minHeight: "var(--tap)", display: "flex", justifyContent: "space-between",
            gap: 8, alignItems: "center", padding: "8px 12px", borderRadius: "var(--r-sm)",
            border: "1.5px solid var(--border)", background: "var(--surface)",
            color: "var(--text)", textAlign: "left" }}>
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{l.caminho}</span>
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>{l.quantidade}</strong>
        </button>
      ))}
    </div>
  );
}
