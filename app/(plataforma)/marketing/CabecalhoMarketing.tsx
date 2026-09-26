"use client";

// Cabeçalho do Marketing · Geral — título e a fileira de abas. É uma peça só
// porque os editores da aba Páginas (LinkTridi e Central de Tutoriais) moram
// em rota própria e precisam do MESMO topo: quem edita continua vendo que
// está no Marketing, com as outras abas a um clique, em vez de cair numa
// tela cheia sem caminho de volta.
import Link from "next/link";
import { Icon } from "../Icon";
import { Abas } from "../ui/Abas";

export const ABAS_MARKETING = [
  { key: "painel", label: "Painel", icon: "chart-line" },
  { key: "criativos", label: "Biblioteca", icon: "layout-grid" },
  { key: "stories", label: "Stories", icon: "brand-instagram" },
  { key: "desempenho", label: "Desempenho", icon: "target" },
  // Contingência saiu daqui (24/09/26): é área própria, só pela barra lateral
  // (/marketing/contingencia).
  // "Páginas": o que o CLIENTE abre — o link da bio (LinkTridi) e o site do QR
  // das caixas (Central de Tutoriais). As chaves continuam `tridiflow:*`.
  { key: "paginas", label: "Páginas", icon: "world-www" },
] as const;
export type AbaMarketing = (typeof ABAS_MARKETING)[number]["key"];
export type PaginaMarketing = "linktridi" | "tutoriais";

export interface PermissoesMarketing {
  podeDesempenho: boolean; podeContingencia: boolean;
  podeLinkTridiLista: boolean; podeTutoriais: boolean;
}

export function abasDoMarketing(p: PermissoesMarketing) {
  return ABAS_MARKETING.filter((a) =>
    (a.key !== "desempenho" || p.podeDesempenho)
    && (a.key !== "paginas" || p.podeLinkTridiLista || p.podeTutoriais));
}

export function paginasDoMarketing(p: PermissoesMarketing) {
  return [
    ...(p.podeLinkTridiLista ? [{ valor: "linktridi" as const, rotulo: "LinkTridi", href: "/marketing?aba=paginas&ver=linktridi" }] : []),
    ...(p.podeTutoriais ? [{ valor: "tutoriais" as const, rotulo: "Central de Tutoriais", href: "/marketing?aba=paginas&ver=tutoriais" }] : []),
  ];
}

/** Título + abas. Com `onAba` as abas trocam no lugar (a própria /marketing);
 *  sem ele viram links pra /marketing?aba=… (os editores de página). */
export function CabecalhoMarketing({ permissoes, aba, onAba, acoes }: {
  permissoes: PermissoesMarketing; aba: AbaMarketing;
  onAba?: (a: AbaMarketing) => void;
  acoes?: React.ReactNode;
}) {
  const abas = abasDoMarketing(permissoes);
  return <>
    <header style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Marketing</h1>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>
          Produção de criativos da equipe, resultado do orgânico e as páginas que o cliente abre.
        </p>
      </div>
      {acoes}
    </header>

    <div className="tab-strip" style={{ display: "flex", gap: 8 }}>
      {abas.map((a) => {
        const ativo = aba === a.key;
        const estilo: React.CSSProperties = {
          minHeight: "var(--tap)", padding: "0 16px", borderRadius: 12, cursor: "pointer", whiteSpace: "nowrap",
          fontWeight: 700, fontSize: 13.5, display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none",
          background: ativo ? "var(--seg-pill, var(--surface))" : "transparent",
          color: ativo ? "var(--text)" : "var(--text-dim)",
          border: `1px solid ${ativo ? "var(--border)" : "transparent"}`,
        };
        const conteudo = <><Icon name={a.icon} size={15} color={ativo ? "var(--primary-texto)" : "var(--text-dim)"} /> {a.label}</>;
        return onAba
          ? <button key={a.key} type="button" aria-pressed={ativo} onClick={() => onAba(a.key)} style={estilo}>{conteudo}</button>
          : <Link key={a.key} href={a.key === "painel" ? "/marketing" : `/marketing?aba=${a.key}`} aria-current={ativo ? "page" : undefined} style={estilo}>{conteudo}</Link>;
      })}
    </div>
  </>;
}

/** Seletor LinkTridi | Central de Tutoriais de dentro da aba Páginas. */
export function SeletorPaginas({ permissoes, valor, onMuda }: {
  permissoes: PermissoesMarketing; valor: PaginaMarketing; onMuda?: (v: PaginaMarketing) => void;
}) {
  const itens = paginasDoMarketing(permissoes);
  if (itens.length < 2) return null;
  // Na /marketing troca no lugar; nos editores é navegação (volta pra lista).
  return onMuda
    ? <Abas ariaLabel="Páginas" itens={itens.map(({ valor, rotulo }) => ({ valor, rotulo }))} valor={valor} onMuda={onMuda} />
    : <Abas ariaLabel="Páginas" itens={itens} valor={valor} />;
}

/** Moldura dos editores de página: o topo do Marketing com "Páginas" acesa,
 *  o seletor e o editor embaixo — dentro do sistema, sem tela cheia. */
export function MolduraPaginaMarketing({ permissoes, ver, children }: {
  permissoes: PermissoesMarketing; ver: PaginaMarketing; children: React.ReactNode;
}) {
  return <div className="mkt-pagina" style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
    <CabecalhoMarketing permissoes={permissoes} aba="paginas" />
    <SeletorPaginas permissoes={permissoes} valor={ver} />
    <div className="mkt-pagina-editor" style={{ minWidth: 0 }}>{children}</div>
  </div>;
}
