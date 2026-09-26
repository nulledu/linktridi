"use client";

// ── Layout base do criador de lojas ──────────────────────────────────────────
// Barra lateral + cabeçalho. É o esqueleto que TODA tela do módulo herda, e a
// única coisa que ele decide é ONDE a pessoa está:
//
//   /lojas...            → navegação do CRIADOR (as lojas, os modelos, domínios)
//   /lojas/<id>/...      → navegação DAQUELA loja
//
// A navegação de dentro de uma loja é em TRÊS blocos, e a divisão não é
// estética: "o que eu vendo" (pedido, produto, cliente) muda todo dia; "por
// onde eu vendo" (loja online, Instagram, marketplaces) muda quando o negócio
// muda; e configuração visita-se uma vez. Uma lista corrida de dezesseis itens
// esconde justamente os quatro do dia a dia.
//
// O canal "Loja Online" abre uma sub-lista (Temas, Páginas, Navegação,
// Domínios) só quando a pessoa está dentro dele. Sub-item sempre visível numa
// lista já longa vira ruído; sub-item que nunca aparece vira coisa que ninguém
// acha.
//
// A responsividade NÃO é escrita aqui: `ws-rail`/`ws-nav`/`ws-main` são a
// fundação (globals.css). No computador é sidebar de 248px; a partir de 900px
// pra baixo ela vira faixa horizontal presa no topo com as abas rolando de
// lado. Por isso nada de popover dentro do `.ws-nav`: no celular ele ganha
// `mask-image`, que recorta qualquer coisa que tente sair da faixa.

import { Tecla } from "@/app/(plataforma)/ui/exibicao";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "../Icon";
import { ROTULO_LOJA, urlDaLoja, type Loja, type StatusLoja } from "@/lib/lojas";
import { baseDoModulo } from "./base";

interface ItemNav {
  href: string;
  label: string;
  icon: string;
  /** Só acende no caminho exato (senão "Produtos" acenderia dentro de "Pedidos"). */
  exato?: boolean;
  /** Número à direita — pedidos esperando, por exemplo. */
  contagem?: number;
  /** Sub-itens, mostrados quando o pai está aberto. */
  filhos?: ItemNav[];
  /** Ação secundária à direita (o "olho" que abre a vitrine). */
  espiar?: string;
}

// Telas do CRIADOR (fora de qualquer loja). Guardadas pelo segmento, e não
// pelo caminho completo, porque o prefixo do módulo é variável — ver `baseDe`.
const CRIADOR: ItemNav[] = [
  { href: "", label: "Minhas lojas", icon: "shopping-bag", exato: true },
  { href: "/modelos", label: "Modelos", icon: "template" },
  { href: "/dominios", label: "Domínios", icon: "world" },
];

/** O dia a dia de quem vende. Ordem de uso, não alfabética. */
const navPrincipal = (base: string, id: string, pedidos?: number): ItemNav[] => [
  { href: `${base}/${id}`, label: "Início", icon: "layout-grid", exato: true },
  { href: `${base}/${id}/pedidos`, label: "Pedidos", icon: "shopping-cart", contagem: pedidos },
  { href: `${base}/${id}/produtos`, label: "Produtos", icon: "package" },
  { href: `${base}/${id}/clientes`, label: "Clientes", icon: "users" },
  { href: `${base}/${id}/analises`, label: "Análises", icon: "chart-bar" },
  // A barra só lista o que EXISTE. Marketing, Descontos e Apps eram telas de
  // "em breve" — quando forem construídas, voltam pra cá junto com a tela.
];

/** Por onde a loja vende. */
const navCanais = (base: string, id: string, vitrine: string): ItemNav[] => [
  {
    href: `${base}/${id}/loja`,
    label: "Loja Online",
    icon: "world-www",
    espiar: vitrine,
    filhos: [
      { href: `${base}/${id}/temas`, label: "Temas", icon: "palette" },
      { href: `${base}/${id}/paginas`, label: "Páginas", icon: "file-text" },
      { href: `${base}/${id}/navegacao`, label: "Navegação", icon: "list" },
      { href: `${base}/${id}/dominios`, label: "Domínios", icon: "world" },
    ],
  },
  // Instagram/Facebook/Google/Marketplaces eram telas de "em breve" — saem da
  // barra até existirem de verdade.
];

const navCriador = (base: string): ItemNav[] =>
  CRIADOR.map((n) => ({ ...n, href: base + n.href || "/" }));

/** Id da loja quando a rota é `<base>/<id>/...`. `null` na área do criador. */
function lojaDaRota(pathname: string, base: string): string | null {
  const seg = pathname.slice(base.length).replace(/^\//, "").split("/")[0];
  if (!seg) return null;
  // "modelos" e "dominios" são telas do criador, não lojas com esse nome.
  if (CRIADOR.some((n) => n.href === `/${seg}`)) return null;
  return seg;
}

/** O que a barra precisa saber de cada loja. Menos que `Loja` de propósito: o
 *  shell não desenha produto nem pedido, e carregar o resto seria peso à toa. */
export interface LojaDaBarra {
  id: string;
  nome: string;
  slug: string;
  status: StatusLoja;
  dominio: string | null;
}

export function LojasShell({ name, role, photoUrl, lojas = [], children }: {
  name: string;
  role: string;
  photoUrl: string | null;
  /** Vem do layout, do servidor. Vazio só no banco de provas. */
  lojas?: LojaDaBarra[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const qDaUrl = useSearchParams().get("q") ?? "";
  const navRef = useRef<HTMLElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  const base = baseDoModulo(pathname);
  const lojaId = lojaDaRota(pathname, base);
  const loja = useMemo(() => lojas.find((l) => l.id === lojaId) ?? null, [lojas, lojaId]);

  // Estar DENTRO de uma loja é uma pergunta sobre a rota, não sobre a lista: um
  // id que ainda não chegou (ou que não está nesta lista) não pode devolver a
  // pessoa pro menu do criador enquanto ela olha o painel daquela loja.
  const dentroDeUmaLoja = !!lojaId;

  const [busca, setBusca] = useState(qDaUrl);
  useEffect(() => { setBusca(qDaUrl); }, [qDaUrl]);

  // ⌘K / Ctrl+K cai na busca. É o atalho que a barra anuncia — anunciar um
  // atalho que não funciona é pior do que não anunciar.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        buscaRef.current?.focus();
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, []);

  // Faixa horizontal no celular: traz a aba atual pra vista. Sem isto, entrar
  // em "Configurações" mostra a faixa começando em "Início" e parece que o
  // menu não acompanhou o clique.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  const ativo = (n: ItemNav) =>
    n.exato ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + "/");

  /** O canal está aberto quando a pessoa está nele ou em qualquer filho. */
  const abertoNoCanal = (n: ItemNav) => ativo(n) || (n.filhos ?? []).some(ativo);

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const termo = busca.trim();
    const destino = lojaId ? `${base}/${lojaId}/produtos` : base;
    router.push(termo ? `${destino}?q=${encodeURIComponent(termo)}` : destino);
  }

  const grupos: { titulo?: string; itens: ItemNav[] }[] = dentroDeUmaLoja
    ? [
        { itens: navPrincipal(base, lojaId!) },
        { titulo: "Canais de venda", itens: navCanais(base, lojaId!, loja ? urlDaLoja(loja as Loja) : "#") },
      ]
    : [{ itens: navCriador(base) }];

  return (
    <div className="ws-shell lj-shell">
      <aside className="ws-rail lj-rail">
        {/* Marca e troca de loja numa peça só: onde estou e como saio daqui.
            No celular a fundação encolhe pro símbolo, que é o que cabe. */}
        <Link href={base} className="lj-marca" title={loja ? "Trocar de loja" : "Minhas lojas"}>
          <span className="lj-marca-ico">
            <Icon name="shopping-bag" size={17} color="var(--on-primary, #fff)" />
          </span>
          <span className="lj-marca-txt">
            <strong>{loja?.nome ?? "Minhas lojas"}</strong>
          </span>
          <Icon name="chevron-down" size={14} color="var(--text-dim)" />
        </Link>

        <nav ref={navRef} className="ws-nav lj-nav" aria-label="Seções">
          {grupos.map((g, i) => (
            <div className="lj-grupo" key={g.titulo ?? i}>
              {g.titulo && <p className="lj-grupo-tit">{g.titulo}</p>}
              {g.itens.map((n) => {
                const on = ativo(n);
                const aberto = n.filhos ? abertoNoCanal(n) : false;
                return (
                  <div key={n.href}>
                    <span className="lj-linha">
                      <Link
                        href={n.href}
                        aria-current={on ? "page" : undefined}
                        className="lj-nav-item"
                        data-on={on ? "1" : undefined}
                      >
                        <Icon name={n.icon} size={18} color={on ? "var(--primary-texto)" : "var(--neutro)"} />
                        <span>{n.label}</span>
                        {n.contagem != null && n.contagem > 0 && (
                          <span className="lj-contagem">{n.contagem > 99 ? "99+" : n.contagem}</span>
                        )}
                      </Link>
                      {n.espiar && (
                        <a
                          className="lj-espiar"
                          href={n.espiar}
                          target="_blank"
                          rel="noreferrer noopener"
                          title="Abrir a loja numa aba nova"
                          aria-label="Abrir a loja numa aba nova"
                        >
                          <Icon name="eye" size={15} color="var(--text-dim)" />
                        </a>
                      )}
                    </span>

                    {aberto && n.filhos && (
                      <div className="lj-sub">
                        {n.filhos.map((f) => (
                          <Link
                            key={f.href}
                            href={f.href}
                            aria-current={ativo(f) ? "page" : undefined}
                            className="lj-sub-item"
                            data-on={ativo(f) ? "1" : undefined}
                          >
                            {f.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="lj-rodape">
          {lojaId && (
            <Link
              href={`${base}/${lojaId}/configuracoes`}
              className="lj-nav-item"
              data-on={pathname.startsWith(`${base}/${lojaId}/configuracoes`) ? "1" : undefined}
            >
              <Icon name="settings" size={18} color="var(--neutro)" />
              <span>Configurações</span>
            </Link>
          )}

          <div className="lj-usuario" title={`${name} · ${role}`}>
            {photoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={photoUrl} alt="" className="lj-avatar" />
              : <span className="lj-avatar lj-avatar-letra">{(name || "V").charAt(0).toUpperCase()}</span>}
            <span className="lj-usuario-txt">
              <strong>{name}</strong>
              <small>{role}</small>
            </span>
          </div>

          <Link href="/central" className="lj-sair" title="Voltar ao sistema">
            <Icon name="logout" size={15} color="var(--text-dim)" />
            <span>Voltar ao sistema</span>
          </Link>
        </div>
      </aside>

      <main className="ws-main lj-main">
        <header className="lj-topbar">
          <form className="lj-busca" onSubmit={buscar} role="search">
            <Icon name="search" size={16} color="var(--text-dim)" />
            <input
              ref={buscaRef}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              type="search"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Buscar..."
              aria-label={loja ? "Buscar na loja" : "Buscar lojas"}
            />
            <span className="lj-atalho" aria-hidden="true"><Tecla mods={["command"]}>K</Tecla></span>
          </form>

          <div className="lj-topbar-dir">
            {loja && (
              <span className="lj-status" title={`Loja ${ROTULO_LOJA[loja.status].txt.toLowerCase()}`}>
                <span className="lj-ponto" style={{ background: ROTULO_LOJA[loja.status].cor }} aria-hidden="true" />
                {ROTULO_LOJA[loja.status].txt}
              </span>
            )}
            <button type="button" className="lj-sino" title="Notificações" aria-label="Notificações">
              <Icon name="bell" size={18} color="var(--text-dim)" />
            </button>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
