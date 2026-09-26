"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { duracaoCss } from "./ui/micro";

// ── Skeletons de carregamento (shimmer) — substituem os "Carregando…" secos.
// Usam a classe .skeleton do globals.css (gradiente + keyframe shimmer). A ideia
// é o esqueleto ter o formato do conteúdo real, então a tela não "pula" ao carregar.

// Primitivo: um bloco shimmer. w/h aceitam número (px) ou string (%, etc).
export function Skeleton({ w = "100%", h = 16, r = 10, style }: { w?: number | string; h?: number | string; r?: number | string; style?: CSSProperties }) {
  return <span className="skeleton" style={{ display: "block", width: w, height: h, borderRadius: r, ...style }} />;
}

// Grade de KPIs (cards com rótulo + número grande).
export function SkeletonKpis({ n = 4 }: { n?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 12, marginBottom: 16 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="glass glass-spec" style={{ padding: "18px 20px", borderRadius: 18 }}>
          <Skeleton w={84} h={12} />
          <Skeleton w={64} h={32} r={9} style={{ marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}

// Lista tipo ranking (avatar + barra). Larguras decrescentes p/ parecer natural.
export function SkeletonList({ rows = 6, style }: { rows?: number; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 13, ...style }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <Skeleton w={30} h={30} r="50%" style={{ flex: "none" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton w={`${Math.max(28, 66 - i * 6)}%`} h={12} />
            <Skeleton h={7} r={5} style={{ marginTop: 7 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Painel (título + área de gráfico OU lista).
export function SkeletonPanel({ h = 200, lines = false }: { h?: number; lines?: boolean }) {
  return (
    <div className="glass glass-spec" style={{ padding: 22, borderRadius: 20 }}>
      <Skeleton w={150} h={15} />
      <Skeleton w={100} h={11} style={{ marginTop: 8 }} />
      {lines ? <SkeletonList rows={5} style={{ marginTop: 18 }} /> : <Skeleton h={h} r={14} style={{ marginTop: 16 }} />}
    </div>
  );
}

// Cartões de pedido/linha (usado em Pedidos e listas de itens).
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="glass glass-spec" style={{ padding: 16, borderRadius: 16, display: "flex", alignItems: "center", gap: 14 }}>
          <Skeleton w={44} h={44} r={12} style={{ flex: "none" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton w={`${Math.max(30, 55 - i * 5)}%`} h={13} />
            <Skeleton w="38%" h={11} style={{ marginTop: 8 }} />
          </div>
          <Skeleton w={70} h={20} r={8} style={{ flex: "none" }} />
        </div>
      ))}
    </div>
  );
}

// Layout-padrão de carregamento de dashboard: (título) + KPIs + 2 painéis + lista.
export function SkeletonDashboard({ title, kpis = 4 }: { title?: string; kpis?: number }) {
  return (
    <div style={{ maxWidth: 1180 }}>
      {title && <h1 style={{ fontSize: "clamp(22px, 6vw, 32px)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 20 }}>{title}</h1>}
      <SkeletonKpis n={kpis} />
      {/* `.duo` da fundação, não estilo inline: a classe `skeleton-2col` que
          estava aqui NUNCA existiu no CSS, então o `1.2fr 1fr` inline valia em
          qualquer largura — num celular de 390px dava duas colunas de 188 e
          157px, e o esqueleto (que é a PRIMEIRA coisa que a pessoa vê) já abria
          quebrado. `.duo` vira uma coluna abaixo de 900px. */}
      <div className="duo" style={{ marginBottom: 16 }}>
        <SkeletonPanel h={200} />
        <SkeletonPanel h={200} />
      </div>
      <SkeletonPanel lines />
    </div>
  );
}

/* ── Cruzamento esqueleto → conteúdo (receita `.t-skel`) ──────────────────────
   As duas camadas dividem a MESMA célula e trocam com desfoque cruzado. O
   `{carregando ? <Skeleton/> : <Conteudo/>}` troca o nó de uma vez, e é esse
   corte seco que faz a tela parecer que "piscou" ao terminar de carregar.

   Como adotar, onde a tela hoje faz o ternário:

     <EsqueletoOuConteudo pronto={!carregando} esqueleto={<SkeletonDashboard />}>
       {dados && <Painel dados={dados} />}
     </EsqueletoOuConteudo>

   O conteúdo mora sempre na árvore (por isso o `dados &&`), senão ele nasceria
   no mesmo quadro em que a classe acende e não haveria de onde cruzar. */

// A receita empilha as camadas com `position: absolute; inset: 0`, o que exige
// que o invólucro tenha altura PRÓPRIA — e aqui a altura é a do conteúdo (um
// painel, uma lista, um dashboard inteiro). Então as duas camadas ocupam a mesma
// célula de grade: o invólucro mede sozinho e o cruzamento continua o da receita.
// `minWidth: 0` porque item de grade nasce com `min-width: auto`: sem ele uma
// tabela larga estica a célula e a página ganha rolagem lateral no celular.
const CAMADA: CSSProperties = { position: "relative", gridArea: "1 / 1", minWidth: 0 };

export function EsqueletoOuConteudo({
  pronto,
  esqueleto,
  children,
  pulsar = true,
  className,
  style,
}: {
  pronto: boolean;
  esqueleto: ReactNode;
  children: ReactNode;
  /** Respiração do bloco inteiro. Desligue quando o esqueleto já for feito de
   *  `<Skeleton>` shimmer e as duas animações ficarem conversando por cima. */
  pulsar?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const [revelado, setRevelado] = useState(pronto);
  const [comEsqueleto, setComEsqueleto] = useState(!pronto);
  const [resetando, setResetando] = useState(false);
  const primeiro = useRef(true);

  useEffect(() => {
    // Quem nasce pronto (dados do servidor) não cruza nada: cruzamento na
    // primeira pintura é animação de estreia, não de carregamento.
    if (primeiro.current) { primeiro.current = false; return; }

    if (pronto) {
      // Um quadro entre montar o conteúdo e acender `.is-revealed`: sem ele o
      // navegador vê o nó já revelado na primeira pintura e não transiciona.
      const q = requestAnimationFrame(() => requestAnimationFrame(() => setRevelado(true)));
      const t = setTimeout(() => setComEsqueleto(false), duracaoCss("--reveal-dur", 400) + 80);
      return () => { cancelAnimationFrame(q); clearTimeout(t); };
    }

    // Voltou a carregar (refetch): o esqueleto reaparece SECO. Cruzamento ao
    // contrário — conteúdo desbotando de volta pro cinza — lê como falha.
    setComEsqueleto(true);
    setResetando(true);
    setRevelado(false);
    const q = requestAnimationFrame(() => requestAnimationFrame(() => setResetando(false)));
    return () => cancelAnimationFrame(q);
  }, [pronto]);

  const classes = ["t-skel", revelado ? "is-revealed" : "", resetando ? "is-resetting" : "", className]
    .filter(Boolean).join(" ");

  return (
    <div className={classes} style={{ display: "grid", ...style }} aria-busy={!pronto}>
      {comEsqueleto && (
        <div
          className={pulsar ? "t-skel-skeleton is-pulsing" : "t-skel-skeleton"}
          aria-hidden
          // `filter: none` enquanto o esqueleto está em cena, e some no MESMO
          // render em que `.is-revealed` entra (daí ele borrar ao sair). Motivo:
          // filtro diferente de `none` — até `blur(0)` — vira "backdrop root", e
          // os painéis `.glass` de dentro passariam a borrar o nada em vez da
          // página. O esqueleto ficaria chapado justamente na primeira coisa que
          // a pessoa vê.
          style={revelado ? { ...CAMADA, pointerEvents: "none" } : { ...CAMADA, pointerEvents: "none", filter: "none" }}
        >
          {esqueleto}
        </div>
      )}
      {/* Idem do outro lado: passado o cruzamento o conteúdo larga o filtro,
          senão todo `.glass` da tela ficaria sem o desfoque de fundo pra sempre. */}
      <div className="t-skel-content" style={comEsqueleto ? CAMADA : { ...CAMADA, filter: "none" }}>
        {children}
      </div>
    </div>
  );
}
