"use client";

// Workspace do TridiMarket: sidebar própria dentro do ERP, como o TridiFlow.
// Diferença de propósito: aqui NÃO há um design system separado — o workspace
// usa os tokens do Gaius (tema claro/escuro do ERP) e só troca o acento pelo
// índigo da marca. Assim o mercadinho parece parte do sistema, não um enxerto.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "../Icon";
import { TridiMarketMark } from "../administracao/TridiMarketMark";

const NAV: { href: string; label: string; icon: string; exact?: boolean }[] = [
  { href: "/tridimarket", label: "Painel", icon: "layout-grid", exact: true },
  { href: "/tridimarket/vendas", label: "Vendas", icon: "shopping-cart" },
  { href: "/tridimarket/pessoas", label: "Pessoas", icon: "users" },
  // "Estoque" saiu da barra: era a mesma lista de Produtos com outra ação, e a
  // separação obrigava a trocar de tela no meio de uma conferência.
  { href: "/tridimarket/produtos", label: "Produtos", icon: "package" },
  { href: "/tridimarket/financeiro", label: "Financeiro", icon: "receipt" },
  { href: "/tridimarket/suspeitas", label: "Suspeitas", icon: "shield" },
  { href: "/tridimarket/empresas", label: "Empresas", icon: "building-warehouse" },
  { href: "/tridimarket/tablets", label: "Tablets", icon: "device-mobile" },
  { href: "/tridimarket/ajustes", label: "Ajustes", icon: "settings" },
];

// Mesmo roxo do sistema (var(--primary-texto)) — o painel do mercadinho acompanha o ERP.
export const TRIDIMARKET_INDIGO = "var(--primary-texto)";

export function TridiMarketShell({ name, role, photoUrl, children }: {
  name: string; role: string; photoUrl: string | null; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);

  // No celular o rail vira faixa horizontal rolável: sem isto a aba atual pode
  // ficar fora da vista e a pessoa não sabe onde está.
  useEffect(() => {
    nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  return (
    <div className="tm-workspace ws-shell" style={{ display: "flex", minHeight: "100dvh" }}>

      <aside className="ws-rail" style={{
        width: 236, flex: "none", display: "flex", flexDirection: "column", padding: 16, gap: 4,
        position: "sticky", top: 0, height: "100dvh", background: "var(--surface)",
        borderRight: "1px solid var(--border)",
      }}>
        {/* Marca sem a caixa roxa: o símbolo é a própria marca, em índigo, e
            grande. A sacola dentro de um quadrado colorido competia com ela e
            deixava a logo pequena. */}
        <div className="ws-brand" style={{ display: "flex", alignItems: "center", gap: 11, padding: "2px 4px 18px" }}>
          <TridiMarketMark size={42} color={TRIDIMARKET_INDIGO} style={{ flex: "none" }} />
          <span className="ws-brand-text" style={{ minWidth: 0 }}>
            <strong style={{ display: "block", fontSize: 17, fontWeight: 800, letterSpacing: "-.02em", color: "var(--text)" }}>TridiMarket</strong>
            <small style={{ fontSize: 10.5, color: "var(--text-dim)" }}>Mercadinho interno</small>
          </span>
        </div>

        <nav ref={nav} className="ws-nav" style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, overflowY: "auto", margin: "2px -4px", padding: "0 4px" }}>
          {NAV.map((n) => {
            const active = n.exact ? pathname === n.href : (pathname === n.href || pathname.startsWith(n.href + "/"));
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: "var(--r-sm)", textDecoration: "none",
                background: active ? `color-mix(in srgb, ${TRIDIMARKET_INDIGO} 12%, transparent)` : "transparent",
                boxShadow: active ? `inset 0 0 0 1px color-mix(in srgb, ${TRIDIMARKET_INDIGO} 30%, transparent)` : "none",
                color: active ? "var(--text)" : "var(--text-dim)", fontSize: 14, fontWeight: active ? 700 : 600,
              }}>
                <Icon name={n.icon} size={18} color={active ? TRIDIMARKET_INDIGO : "var(--text-dim)"} /> {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="ws-user" style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
          {photoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={photoUrl} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flex: "none" }} />
            : <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--surface-2)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14, flex: "none", color: "var(--text)" }}>{(name || "V").charAt(0).toUpperCase()}</div>}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>{name}</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "capitalize" }}>{role}</div>
          </div>
        </div>
        <Link href="/home" title="Voltar ao sistema" className="ws-exit" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 8,
          padding: "9px 12px", borderRadius: "var(--r-sm)", textDecoration: "none", border: "1px solid var(--border)",
          color: "var(--text-dim)", fontSize: 12.5, fontWeight: 700,
        }}>
          <Icon name="logout" size={15} color="var(--text-dim)" /> <span className="ws-exit-label">Sair do TridiMarket</span>
        </Link>
      </aside>

      <main className="ws-main" style={{ flex: 1, minWidth: 0, padding: "26px 30px", overflowX: "hidden" }}>{children}</main>
    </div>
  );
}
