/**
 * O esqueleto do Financeiro — aparece NO MESMO INSTANTE da navegação.
 *
 * Cada ida ao Supabase custa 250–700 ms daqui, e uma tela soma algumas. O
 * número caiu com cache e paralelismo, mas o que a pessoa SENTE é o intervalo
 * entre o clique e a primeira pintura: com esta peça o trilho fica parado, o
 * lugar de cada bloco já está desenhado, e o conteúdo chega por cima — em vez
 * da tela anterior congelada até o servidor responder.
 *
 * É um `loading.tsx` do App Router: o layout (trilho, seletor de empresa) não
 * recarrega; só o miolo troca. Vale para TODA rota abaixo de `/financeiro`,
 * porque a fronteira de Suspense é a do layout — cadastros, notas, patrimônio
 * entram de graça.
 *
 * O desenho copia a forma que quase toda tela do módulo tem: cabeçalho com
 * ação, uma fileira de números e dois cartões lado a lado (lista + resumo). No
 * celular os dois viram coluna pelo mesmo `.duo-lista` da fundação. Nada aqui
 * mede nada; é só o lugar das coisas.
 */
export default function CarregandoFinanceiro() {
  const osso = (h: number, w: string | number, r = 10, i = 0): React.CSSProperties => ({
    height: h, width: w, borderRadius: r, background: "var(--surface-2)",
    animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.06}s`,
  });

  return (
    <div aria-busy="true" aria-label="Carregando" style={{ minWidth: 0 }}>
      {/* Cabeçalho: título e o botão de criar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <div style={osso(30, "min(240px, 55%)", 10)} />
        <div style={osso(44, 150, 22, 1)} />
      </div>

      {/* A fileira de números */}
      <div className="kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 12, marginBottom: 18 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ ...osso(96, "100%", 18, i + 2), padding: 16, display: "grid", alignContent: "space-between" }}>
            <div style={{ height: 12, width: "60%", borderRadius: 6, background: "var(--surface)" }} />
            <div style={{ height: 24, width: "45%", borderRadius: 8, background: "var(--surface)" }} />
          </div>
        ))}
      </div>

      {/* Lista + resumo, lado a lado — coluna no celular */}
      <div className="duo-lista" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(min(100%, 280px), 1fr)", gap: 14 }}>
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
        <div style={{ ...osso(420, "100%", 20, 7), padding: 18, display: "grid", gap: 14, alignContent: "start" }}>
          <div style={{ height: 16, width: "55%", borderRadius: 8, background: "var(--surface)" }} />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ height: 10, width: `${90 - i * 15}%`, borderRadius: 6, background: "var(--surface)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
