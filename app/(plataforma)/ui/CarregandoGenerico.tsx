/**
 * Esqueleto genérico para módulos sem forma própria — mesma ideia do
 * `loading.tsx` do Financeiro: aparece no instante do clique, o trilho
 * fica parado, e o conteúdo chega por cima em vez da tela anterior
 * congelada até o servidor responder. Cabeçalho + fileira de números +
 * um bloco de lista; cobre a forma mais comum das telas do app.
 */
export function CarregandoGenerico() {
  const osso = (h: number, w: string | number, r = 10, i = 0): React.CSSProperties => ({
    height: h, width: w, borderRadius: r, background: "var(--surface-2)",
    animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.06}s`,
  });

  return (
    <div aria-busy="true" aria-label="Carregando" style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <div style={osso(30, "min(240px, 55%)", 10)} />
        <div style={osso(44, 150, 22, 1)} />
      </div>

      <div className="kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 12, marginBottom: 18 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ ...osso(96, "100%", 18, i + 2), padding: 16, display: "grid", alignContent: "space-between" }}>
            <div style={{ height: 12, width: "60%", borderRadius: 6, background: "var(--surface)" }} />
            <div style={{ height: 24, width: "45%", borderRadius: 8, background: "var(--surface)" }} />
          </div>
        ))}
      </div>

      <div style={{ ...osso(420, "100%", 20, 6), padding: 18, display: "grid", gap: 12, alignContent: "start" }}>
        <div style={{ height: 16, width: "40%", borderRadius: 8, background: "var(--surface)" }} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "28px 1fr 80px", gap: 12, alignItems: "center" }}>
            <div style={{ height: 28, width: 28, borderRadius: 8, background: "var(--surface)" }} />
            <div style={{ height: 12, width: `${70 - i * 6}%`, borderRadius: 6, background: "var(--surface)" }} />
            <div style={{ height: 12, width: "100%", borderRadius: 6, background: "var(--surface)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
