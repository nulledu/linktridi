/**
 * O esqueleto do RH — aparece NO MESMO INSTANTE da navegação.
 *
 * Mesma peça do Financeiro e pelo mesmo motivo: cada ida ao Supabase custa
 * 250–700 ms daqui e uma tela soma algumas. O que a pessoa SENTE é o intervalo
 * entre o clique e a primeira pintura; com isto o trilho fica parado, o lugar
 * de cada bloco já está desenhado, e o conteúdo chega por cima — em vez da tela
 * anterior congelada até o servidor responder.
 *
 * Vale para TODA rota abaixo de `/rh`, porque a fronteira de Suspense é a do
 * layout: a ficha do colaborador e o calendário entram de graça.
 *
 * O desenho copia a forma da tela principal: cabeçalho com ação, a fileira de
 * cinco números e o cartão da lista. Nada aqui mede nada; é só o lugar das
 * coisas.
 */
export default function CarregandoRh() {
  const osso = (h: number, w: string | number, r = 10, i = 0): React.CSSProperties => ({
    height: h, width: w, borderRadius: r, background: "var(--surface-2)",
    animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.06}s`,
  });

  return (
    <div aria-busy="true" aria-label="Carregando" style={{ minWidth: 0 }}>
      {/* Cabeçalho: tarja, título e a ação */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
        <div style={{ display: "grid", gap: 6, minWidth: 0, flex: "0 1 auto" }}>
          <div style={osso(11, 70, 4)} />
          <div style={osso(30, "min(240px, 55vw)", 10)} />
        </div>
        <div style={osso(44, 150, 22, 1)} />
      </div>

      {/* Os cinco números */}
      <div
        className="kpi-row"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 14, marginBottom: 18 }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ ...osso(96, "100%", 18, i + 2), padding: 16, display: "grid", alignContent: "space-between" }}>
            <div style={{ height: 12, width: "60%", borderRadius: 6, background: "var(--surface)" }} />
            <div style={{ height: 24, width: "45%", borderRadius: 8, background: "var(--surface)" }} />
          </div>
        ))}
      </div>

      {/* O cartão da lista: busca, filtros e as linhas */}
      <div style={{ ...osso(480, "100%", 20, 7), padding: 18, display: "grid", gap: 14, alignContent: "start" }}>
        <div style={{ height: 16, width: "min(220px, 50%)", borderRadius: 8, background: "var(--surface)" }} />
        <div style={{ height: 40, width: "100%", borderRadius: 999, background: "var(--surface)" }} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "36px minmax(0, 1fr) 90px", gap: 12, alignItems: "center" }}>
            <div style={{ height: 36, width: 36, borderRadius: "50%", background: "var(--surface)" }} />
            <div style={{ height: 12, width: `${72 - i * 6}%`, borderRadius: 6, background: "var(--surface)" }} />
            <div style={{ height: 22, width: "100%", borderRadius: 999, background: "var(--surface)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
