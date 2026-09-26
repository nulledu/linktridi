/**
 * Esqueleto do EDITOR de página — a forma é barra de ferramentas + palco + painel,
 * não a grade de cards do `loading.tsx` do módulo. Abrir uma página mostrava a
 * grade de workspace por um instante e depois o editor reorganizava tudo; com
 * a forma certa, o editor chega por cima dos ossos. No celular o painel
 * colapsa pra baixo sozinho (minmax com min(100%, …)).
 */
export default function CarregandoEditor() {
  const osso = (h: number, w: string | number, r = 10, i = 0): React.CSSProperties => ({
    height: h, width: w, borderRadius: r, background: "var(--surface-2)",
    animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.06}s`,
  });

  return (
    <div aria-busy="true" aria-label="Carregando" style={{ minWidth: 0 }}>
      {/* Barra: nome do bot + ações de publicar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={osso(28, "min(220px, 50%)", 10)} />
        <div style={{ display: "flex", gap: 8 }}>
          <div style={osso(40, 96, 20, 1)} />
          <div style={osso(40, 120, 20, 2)} />
        </div>
      </div>

      {/* Palco + painel lateral — coluna no celular */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(min(100%, 300px), 340px)", gap: 14 }}>
        <div style={{ ...osso(520, "100%", 18, 3), padding: 18, display: "grid", gap: 14, alignContent: "start" }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ height: 72, width: `min(100%, ${420 - i * 30}px)`, borderRadius: 14, background: "var(--surface)", marginLeft: i % 2 ? "auto" : 0 }} />
          ))}
        </div>
        <div style={{ ...osso(520, "100%", 18, 4), padding: 16, display: "grid", gap: 12, alignContent: "start" }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: 40, width: "100%", borderRadius: 10, background: "var(--surface)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
