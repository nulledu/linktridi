/**
 * Esqueleto de DENTRO de uma loja — troca de aba (Produtos, Pedidos, Temas…)
 * sem derrubar a sensação de lugar.
 *
 * O `loading.tsx` de /lojas mostra o esqueleto genérico com fileira de KPIs;
 * dentro da loja quase toda aba é cabeçalho + uma lista. Com a forma certa, o
 * conteúdo chega POR CIMA dos ossos em vez de reorganizar a tela. A sidebar da
 * loja (no layout de /lojas) continua parada — só o miolo troca.
 */
export default function CarregandoLoja() {
  const osso = (h: number, w: string | number, r = 10, i = 0): React.CSSProperties => ({
    height: h, width: w, borderRadius: r, background: "var(--surface-2)",
    animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.06}s`,
  });

  return (
    <div aria-busy="true" aria-label="Carregando" style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <div style={osso(28, "min(220px, 50%)", 10)} />
        <div style={osso(40, 130, 20, 1)} />
      </div>

      <div style={{ ...osso(460, "100%", 18, 2), padding: 16, display: "grid", gap: 12, alignContent: "start" }}>
        <div style={{ height: 14, width: "35%", borderRadius: 7, background: "var(--surface)" }} />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "36px 1fr 90px", gap: 12, alignItems: "center" }}>
            <div style={{ height: 36, width: 36, borderRadius: 10, background: "var(--surface)" }} />
            <div style={{ height: 12, width: `${68 - i * 5}%`, borderRadius: 6, background: "var(--surface)" }} />
            <div style={{ height: 12, width: "100%", borderRadius: 6, background: "var(--surface)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
