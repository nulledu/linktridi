"use client";

// Porte de `registry/ui/smooth-ring.json` do Monocharts — o loader do repo.
// Trilho no cinza do tema, arco girando na tinta da pessoa. O giro respeita
// prefers-reduced-motion (vira pulso de opacidade — indicador continua, o
// movimento circular não).

export function SmoothRing({ size = 36, rotulo }: { size?: number; rotulo?: string }) {
  return (
    <div role="status" aria-label={rotulo ?? "Carregando"} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <svg className="mc-spin" viewBox="0 0 32 32" style={{ width: size, height: size, display: "block" }}>
        <circle cx="16" cy="16" r="14" fill="none" strokeWidth="3" style={{ stroke: "var(--mc-anel-trilho)" }} />
        <circle cx="16" cy="16" r="14" fill="none" strokeWidth="3" strokeDasharray="38 80" strokeLinecap="round" style={{ stroke: "var(--graf-1)" }} />
      </svg>
      {rotulo && <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600 }}>{rotulo}</span>}
    </div>
  );
}

/** O loader centrado num cartão Monocharts — o estado "buscando" das abas. */
export function McCarregando({ rotulo = "Carregando…" }: { rotulo?: string }) {
  return (
    <div className="mc-card" style={{ minHeight: 220, alignItems: "center", justifyContent: "center" }}>
      <SmoothRing rotulo={rotulo} />
    </div>
  );
}
