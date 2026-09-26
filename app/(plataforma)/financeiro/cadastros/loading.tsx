/**
 * Esqueleto dos Cadastros — no instante do clique, com a FORMA das telas de
 * cadastro (cabeçalho + busca + lista de fichas), não a da Visão Geral.
 *
 * O `loading.tsx` do módulo mostra fileira de números + dois cartões; aqui a
 * tela que chega é uma lista de contatos/empresas/colaboradores. O esqueleto
 * com a forma errada dá o "pulo" na troca: os ossos somem e nada do que estava
 * desenhado corresponde ao que pintou. Este cobre TODA rota de /cadastros
 * (contatos, contas, fornecedores, recorrências, colaboradores) e o trilho do
 * módulo continua parado — só o miolo troca.
 */
export default function CarregandoCadastros() {
  const osso = (h: number, w: string | number, r = 10, i = 0): React.CSSProperties => ({
    height: h, width: w, borderRadius: r, background: "var(--surface-2)",
    animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.06}s`,
  });

  return (
    <div aria-busy="true" aria-label="Carregando" style={{ minWidth: 0 }}>
      {/* Cabeçalho: título e o botão de criar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={osso(30, "min(240px, 55%)", 10)} />
        <div style={osso(44, 150, 22, 1)} />
      </div>

      {/* Busca / filtros */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={osso(44, "min(340px, 70%)", 12, 2)} />
        <div style={osso(44, 110, 12, 3)} />
      </div>

      {/* A lista de fichas — uma coluna generosa que colapsa sozinha */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", gap: 12 }}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} style={{ ...osso(92, "100%", 16, i + 4), padding: 14, display: "grid", gridTemplateColumns: "40px 1fr", gap: 12, alignItems: "center" }}>
            <div style={{ height: 40, width: 40, borderRadius: 20, background: "var(--surface)" }} />
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ height: 13, width: `${72 - (i % 4) * 8}%`, borderRadius: 6, background: "var(--surface)" }} />
              <div style={{ height: 11, width: `${48 - (i % 3) * 6}%`, borderRadius: 6, background: "var(--surface)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
