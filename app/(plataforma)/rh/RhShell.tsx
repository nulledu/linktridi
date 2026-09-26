"use client";

// Workspace do RH: trilho próprio dentro do ERP, como o Financeiro e o
// TridiMarket. Usa os tokens do Gaius (claro/escuro do sistema) — nenhum
// segundo design system enxertado no meio do app.
//
// A diferença estrutural para o Financeiro é uma só, e é a ausência do seletor
// de empresa: o RH não trabalha por empresa. A pessoa é a mesma na Tridi e na
// Gedux; quem reparte gente por CNPJ é a folha, que mora no Financeiro.

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "../Icon";
import type { PoderesRh } from "@/lib/rh/gate";

const ACENTO = "var(--primary-texto)";

interface ItemNav {
  href: string;
  label: string;
  icone: string;
  exato?: boolean;
  podeVer?: (p: PoderesRh) => boolean;
}

/**
 * Cada item declara a chave que o abre — e não "estar no módulo".
 *
 * É a lição do Financeiro: quando o superusuário passou a entrar só pela porta,
 * a barra mostrava seis itens e nenhum abria. Menu que promete tela e não
 * entrega é pior que menu curto, porque a pessoa conclui que está quebrado.
 *
 * Conceder o RH a alguém não é uma tela AQUI DENTRO: é a ficha da pessoa, na
 * aba Acesso. Esta barra só mostra o que já foi concedido — nunca quem concede.
 *
 * As portas do módulo, separadas pela PERGUNTA que cada uma responde:
 *
 *   Colaboradores — quem é a pessoa, e o que ela pode fazer. A lista, a ficha
 *                   em pop-up (com a aba Acesso) e os atalhos do dia.
 *   Ponto         — quanto a equipe trabalhou (batidas, saldo, turnos)
 *
 * `/rh/gestao` NÃO está aqui de propósito: ela virou a tela de CADASTRO DE
 * CONTA (criar pessoa, convite, aparelhos), que se usa de vez em quando, e é
 * alcançada pelos atalhos de Colaboradores. Como item de menu ela anunciava uma
 * segunda lista de gente e uma segunda ficha — o dono pediu para juntar, e
 * juntar é isto: uma porta por assunto, não duas para o mesmo.
 */
const NAV: ItemNav[] = [
  { href: "/rh/colaboradores", label: "Colaboradores", icone: "users", podeVer: (p) => p.ver },
  { href: "/rh/ponto", label: "Ponto & horas", icone: "clock-hour-4", podeVer: (p) => p.ponto },
  { href: "/rh/curriculos", label: "Currículos", icone: "id-badge", podeVer: (p) => p.curriculos },
  { href: "/rh/calendario", label: "Calendário", icone: "calendar", podeVer: (p) => p.calendario },
];

export function RhShell({
  name, role, photoUrl, poderes, curriculosNovos = 0, children,
}: {
  name: string;
  role: string;
  photoUrl: string | null;
  poderes: PoderesRh;
  /** Candidatos `novo` que ninguém abriu ainda — a bolinha em "Currículos". */
  curriculosNovos?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = useRef<HTMLElement>(null);

  // No celular o trilho vira faixa horizontal (fundação `.ws-rail`): sem trazer
  // a aba atual pra vista, a pessoa não sabe em que tela está.
  useEffect(() => {
    nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  /**
   * VOLTAR mostra a tela de antes — do cache, não do servidor.
   *
   * O Next restaura a navegação de voltar/avançar do cache do navegador, e
   * nenhuma configuração muda isso (é o que evita o pulo de layout). Então
   * mudar a situação de alguém e voltar para a lista mostrava a situação de
   * ANTES; no celular, onde voltar é o gesto principal, a tela "nunca
   * atualizava". O refresh aqui é disparado pelo gesto da pessoa, uma vez por
   * volta — não é poll.
   */
  const voltou = useRef(false);
  useEffect(() => {
    const marcar = () => { voltou.current = true; };
    window.addEventListener("popstate", marcar);
    return () => window.removeEventListener("popstate", marcar);
  }, []);
  useEffect(() => {
    if (!voltou.current) return;
    voltou.current = false;
    router.refresh();
  }, [pathname, router]);

  const ativoEm = (n: ItemNav) =>
    n.exato ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + "/");

  const linkEstilo = (ativo: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
    borderRadius: "var(--r-sm)", textDecoration: "none", minHeight: "var(--tap)", minWidth: 0,
    background: ativo ? `color-mix(in srgb, ${ACENTO} 12%, transparent)` : "transparent",
    boxShadow: ativo ? `inset 0 0 0 1px color-mix(in srgb, ${ACENTO} 28%, transparent)` : "none",
    color: ativo ? "var(--text)" : "var(--text-dim)",
    fontSize: 14, fontWeight: ativo ? 700 : 600,
  });

  const visiveis = NAV.filter((n) => !n.podeVer || n.podeVer(poderes));

  return (
    <div className="rh-scope ws-shell" style={{ display: "flex", minHeight: "100dvh" }}>
      <aside
        className="ws-rail"
        style={{
          width: 244, flex: "none", display: "flex", flexDirection: "column", padding: 16, gap: 4,
          position: "sticky", top: 0, height: "100dvh", background: "var(--surface)",
          borderRight: "1px solid var(--border)",
        }}
      >
        {/* Marca do módulo. No celular o rótulo some (`.ws-brand-text` da
            fundação) e sobra só o símbolo, que é o que cabe na faixa de 44px. */}
        <div className="ws-brand" style={{ padding: "0 0 14px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10, minHeight: "var(--tap)", padding: "6px 2px" }}>
            <span
              aria-hidden
              style={{
                width: 30, height: 30, flex: "none", borderRadius: 9, display: "grid", placeItems: "center",
                background: `color-mix(in srgb, ${ACENTO} 15%, transparent)`,
              }}
            >
              <Icon name="id-badge" size={17} color={ACENTO} />
            </span>
            <span className="ws-brand-text" style={{ minWidth: 0, flex: 1 }}>
              <strong
                style={{
                  display: "block", fontSize: 15, fontWeight: 800, letterSpacing: "-.02em",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                RH
              </strong>
              <small style={{ fontSize: 10.5, color: "var(--text-dim)" }}>Recursos Humanos</small>
            </span>
          </span>
        </div>

        <nav
          ref={nav}
          className="ws-nav"
          style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, overflowY: "auto", margin: "2px -4px", padding: "0 4px" }}
        >
          {visiveis.map((n) => {
            const ativo = ativoEm(n);
            return (
              <Link key={n.href} href={n.href} aria-current={ativo ? "page" : undefined} style={linkEstilo(ativo)}>
                <NavIcone nome={n.icone} tamanho={18} ativo={ativo} />
                <span style={{ flex: 1, minWidth: 0 }}>{n.label}</span>
                {/* "Currículos · 8": o número some sozinho quando os perfis
                    são abertos (visto_em), sem ninguém precisar "marcar lido". */}
                {n.href === "/rh/curriculos" && curriculosNovos > 0 && (
                  <span
                    className="mt-num"
                    aria-label={`${curriculosNovos} candidatos novos`}
                    style={{
                      flex: "none", minWidth: 20, height: 20, padding: "0 6px", borderRadius: "var(--r-pill)",
                      display: "inline-grid", placeItems: "center", fontSize: 11, fontWeight: 800,
                      background: "var(--azul)", color: "#fff", fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {curriculosNovos > 99 ? "99+" : curriculosNovos}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div
          className="ws-user"
          style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}
        >
          {photoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={photoUrl} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flex: "none" }} />
            : (
              <div
                style={{
                  width: 34, height: 34, borderRadius: "50%", background: "var(--surface-2)", display: "grid",
                  placeItems: "center", fontWeight: 800, fontSize: 14, flex: "none", color: "var(--text)",
                }}
              >
                {(name || "?").charAt(0).toUpperCase()}
              </div>
            )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "capitalize" }}>{role}</div>
          </div>
        </div>

        <Link
          href="/home"
          title="Voltar ao sistema"
          className="ws-exit"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 8,
            // O alvo de 44px no celular (onde o rótulo sai e sobra só o ícone)
            // é da fundação, no `.ws-exit` do `globals.css` — aqui não se
            // repete, senão a regra passa a morar em dois lugares.
            minHeight: "var(--tap)",
            padding: "0 12px", borderRadius: "var(--r-sm)", textDecoration: "none",
            border: "1px solid var(--border)", color: "var(--text-dim)", fontSize: 12.5, fontWeight: 700,
          }}
        >
          <Icon name="logout" size={15} color="var(--text-dim)" />
          <span className="ws-exit-label">Sair do RH</span>
        </Link>
      </aside>

      <main className="ws-main" style={{ flex: 1, minWidth: 0, padding: "26px clamp(14px, 1.6vw, 30px)", overflowX: "hidden" }}>
        {children}
      </main>
    </div>
  );
}

// O giro que substitui o ícone enquanto a rota está em voo — mesma peça do
// `FinanceiroShell` e do `Shell` da plataforma, e existe pelo mesmo motivo: a
// ficha leva segundos, e o clique não deixava nenhum rastro até o `loading.tsx`
// entrar. `useLinkStatus` só vale dentro de um `<Link>` e se desarma sozinho.
function NavIcone({ nome, tamanho, ativo }: { nome: string; tamanho: number; ativo: boolean }) {
  const { pending } = useLinkStatus();
  if (pending) {
    return (
      <span
        className="spin"
        aria-label="Carregando"
        style={{
          width: tamanho, height: tamanho, borderRadius: "50%", flex: "none",
          border: "2px solid var(--surface-3, var(--border))",
          borderTopColor: ativo ? ACENTO : "var(--text)",
        }}
      />
    );
  }
  return <Icon name={nome} size={tamanho} color={ativo ? ACENTO : "var(--text-dim)"} />;
}
