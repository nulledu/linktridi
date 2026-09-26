"use client";

// Workspace do Financeiro: sidebar própria dentro do ERP, como o TridiMarket.
// Usa os tokens do Gaius (claro/escuro do sistema) — no tema claro a sidebar já
// nasce branca com acento roxo, que é o desenho dos mockups, sem um segundo
// design system enxertado no meio do app.

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Marca } from "./ui";
import { Dropdown, type SecaoDropdown } from "../ui/Dropdown";
import { confirmar } from "../Toast";
import { painelAberto } from "../ui/controles";
// A constante vem de `./cookie`, e não de `./empresa`: aquele importa
// `next/headers`, que não existe no navegador.
import { COOKIE_EMPRESA, SLUG_GERAL } from "./cookie";
import type { Empresa } from "@/lib/financeiro/tipos";
import type { PoderesFinanceiro } from "@/lib/financeiro/gate";
import { TrocaIcone } from "../ui/micro";

const ACENTO = "var(--primary-texto)";

/** Quanto tempo a aba precisa ficar escondida para valer recarregar ao voltar. */
const FORA_POR_MS = 3 * 60_000;

interface ItemNav { href: string; label: string; icone: string; exato?: boolean; podeVer?: (p: PoderesFinanceiro) => boolean }

/**
 * TODA tela de dinheiro depende de `financeiro:ver`, e por isso o `podeVer`
 * está em cada uma.
 *
 * Antes elas não tinham nenhum, porque "estar no módulo" e "poder ver" eram a
 * mesma coisa na prática. Deixaram de ser quando o superusuário passou a
 * entrar só pela porta (`financeiro`): sem esta linha ele veria seis itens na
 * barra e nenhum abriria — menu que promete tela e não entrega.
 *
 * Conceder o Financeiro a alguém não é mais uma tela AQUI DENTRO: é a ficha da
 * pessoa em Pessoas › Gestão de equipe, como qualquer outra área. Esta barra
 * só mostra o que já foi concedido — nunca quem concede.
 */
const so = (p: PoderesFinanceiro) => p.ver;

const NAV: ItemNav[] = [
  { href: "/financeiro", label: "Visão Geral", icone: "layout-grid", exato: true, podeVer: so },
  { href: "/financeiro/compromissos", label: "Compromissos", icone: "calendar-event", podeVer: so },
  { href: "/financeiro/compras", label: "Compras", icone: "shopping-cart", podeVer: so },
  { href: "/financeiro/notas", label: "Notas Fiscais", icone: "file-text", podeVer: so },
  // Dinheiro que VOLTA fica ao lado do que sai: estorno é a contramão da
  // venda, e quem cuida de pagamento é quem disputa chargeback.
  { href: "/financeiro/estornos", label: "Estornos", icone: "arrow-back-up", podeVer: so },
  { href: "/financeiro/patrimonio", label: "Patrimônio", icone: "package", podeVer: so },
  // Auditoria fica no menu principal, e não dentro de Cadastros: ela não é um
  // cadastro, é a resposta para "quem mexeu nisto?" — a pergunta que aparece
  // no meio de qualquer uma das telas acima.
  { href: "/financeiro/auditoria", label: "Auditoria", icone: "history", podeVer: so },
];

/**
 * Fica separada por um traço, junto do resto do menu principal — e não dentro
 * de Cadastros: não é um cadastro OPERACIONAL (fornecedor, conta, recorrência),
 * é a MOLDURA do módulo inteiro. `financeiro:config` é sub de área restrita:
 * ninguém tem por padrão, nem o superusuário — só entra concedida de
 * propósito, na ficha da pessoa em Pessoas.
 */
const CONFIGURACAO: ItemNav[] = [
  { href: "/financeiro/configuracoes", label: "Configurações", icone: "settings", podeVer: (p) => p.config },
];

const CADASTROS: ItemNav[] = [
  { href: "/financeiro/cadastros/recorrencias", label: "Recorrências", icone: "refresh", podeVer: so },
  { href: "/financeiro/cadastros/contas", label: "Bancos e Gateways", icone: "wallet", podeVer: so },
  { href: "/financeiro/cadastros/contatos", label: "Contatos e empresas", icone: "users", podeVer: so },
  { href: "/financeiro/cadastros/colaboradores", label: "Colaboradores", icone: "users", podeVer: (p) => p.ver && p.folha },
];

export function FinanceiroShell({
  name, role, photoUrl, empresas, empresaAtiva, logos = {}, geral = false, poderes, schemaPendente, children,
}: {
  name: string; role: string; photoUrl: string | null;
  empresas: Empresa[]; empresaAtiva: Empresa | null;
  /** `empresa.id` → link ASSINADO do logo. Vem do layout, vence em 1h. */
  logos?: Record<string, string>;
  /** "Ver geral" ligado: as telas somam as empresas e não deixam cadastrar. */
  geral?: boolean;
  poderes: PoderesFinanceiro; schemaPendente: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = useRef<HTMLElement>(null);
  const [cadastrosAberto, setCadastrosAberto] = useState(() => pathname.startsWith("/financeiro/cadastros"));

  // No celular o rail vira faixa horizontal (fundação `.ws-rail`): sem trazer a
  // aba atual pra vista, a pessoa não sabe em que tela está.
  useEffect(() => {
    nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  useEffect(() => {
    if (pathname.startsWith("/financeiro/cadastros")) setCadastrosAberto(true);
  }, [pathname]);

  /**
   * VOLTAR mostra a tela de antes — do cache, não do servidor.
   *
   * O Next restaura a navegação de voltar/avançar do cache do navegador, e
   * nenhuma configuração muda isso (é o que evita o pulo de layout). Então
   * pagar um compromisso e voltar para a Visão Geral mostrava o saldo de ANTES
   * do pagamento; no celular, onde voltar é o gesto principal, a tela "nunca
   * atualizava". O refresh aqui é disparado pelo gesto da pessoa, uma vez por
   * volta — não é poll. Ele roda DEPOIS de o caminho trocar, senão recarrega a
   * tela que estava saindo.
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

  /**
   * Aba que ficou escondida e voltou: o "hoje" e os números são de quando a
   * tela foi aberta — numa aba deixada de um dia para o outro, "vence hoje"
   * era ontem. Recarrega UMA vez ao voltar, e só se ficou fora por mais de
   * alguns minutos: alternar de aba por um instante não custa uma invocação.
   * Não é intervalo — é o mesmo `visibilitychange` que o CLAUDE.md manda usar.
   */
  useEffect(() => {
    let escondidaDesde = 0;
    const aoMudar = () => {
      if (document.hidden) { escondidaDesde = Date.now(); return; }
      if (escondidaDesde && Date.now() - escondidaDesde >= FORA_POR_MS) router.refresh();
      escondidaDesde = 0;
    };
    document.addEventListener("visibilitychange", aoMudar);
    return () => document.removeEventListener("visibilitychange", aoMudar);
  }, [router]);

  /**
   * Trocar de empresa é COOKIE + refresh — nenhuma escrita no banco e nenhuma
   * invocação de API. O seletor é clicado o dia inteiro; uma rota por clique
   * seria exatamente o tipo de gasto que já pausou este projeto na Vercel.
   *
   * `router.refresh()` refaz a árvore no servidor, então toda consulta da rota
   * atual volta com a empresa nova — que é o §2 da especificação.
   */
  const trocarEmpresa = async (slug: string) => {
    // §2: com formulário aberto, a troca recarrega a árvore no servidor e o que
    // estava digitado some sem aviso. Pergunta ANTES — só quando há painel
    // aberto, senão a pergunta vira ruído em todo clique no seletor.
    if (painelAberto()) {
      const segue = await confirmar("Trocar de empresa agora?", {
        detalhe: "Há um cadastro aberto. O que ainda não foi salvo se perde na troca.",
        perigo: true,
      });
      if (!segue) return;
    }
    document.cookie = `${COOKIE_EMPRESA}=${encodeURIComponent(slug)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  };

  // Seletor de empresa = Dropdown do sistema, escolha única. A empresa atual
  // (ou a "Visão geral") nasce marcada; o logo de cada uma vai no `inicio`.
  const secoesEmpresa: SecaoDropdown[] = [];
  if (empresas.length) secoesEmpresa.push({
    titulo: "Empresa", selecao: "unica",
    selecionados: geral ? [] : empresaAtiva ? [empresaAtiva.id] : [],
    itens: empresas.map((e) => ({
      id: e.id, rotulo: e.nome, descricao: e.cnpj ?? undefined,
      inicio: <Marca marca={{ nome: e.nome, logo: logos[e.id] ?? null, icone: e.icone ?? null, cor: e.cor ?? null }} tamanho={26} raio={8} />,
      onSelect: () => void trocarEmpresa(e.slug),
    })),
  });
  // "Ver geral" só com mais de uma empresa: com uma só ele mostraria
  // exatamente a mesma tela com outro nome, e opção que não muda nada faz a
  // pessoa procurar a diferença. É LEITURA — as telas somam e escondem o
  // "novo", porque cadastrar precisa dizer em qual empresa.
  if (empresas.length > 1) secoesEmpresa.push({
    selecao: "unica", selecionados: geral ? [SLUG_GERAL] : [],
    itens: [{
      id: SLUG_GERAL, rotulo: "Visão geral", descricao: `As ${empresas.length} empresas somadas`,
      inicio: (
        <span aria-hidden style={{
          width: 26, height: 26, flex: "none", borderRadius: 8, display: "grid", placeItems: "center",
          background: `color-mix(in srgb, ${ACENTO} 14%, transparent)`,
        }}>
          <Icon name="stack-2" size={15} color={ACENTO} />
        </span>
      ),
      onSelect: () => void trocarEmpresa(SLUG_GERAL),
    }],
  });

  const cadastrosVisiveis = CADASTROS.filter((c) => !c.podeVer || c.podeVer(poderes));
  const ativoEm = (n: ItemNav) =>
    n.exato ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + "/");

  const linkEstilo = (ativo: boolean, recuado = false): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 12, padding: recuado ? "9px 12px 9px 22px" : "10px 12px",
    borderRadius: "var(--r-sm)", textDecoration: "none", minHeight: "var(--tap)", minWidth: 0,
    background: ativo ? `color-mix(in srgb, ${ACENTO} 12%, transparent)` : "transparent",
    boxShadow: ativo ? `inset 0 0 0 1px color-mix(in srgb, ${ACENTO} 28%, transparent)` : "none",
    color: ativo ? "var(--text)" : "var(--text-dim)",
    fontSize: recuado ? 13 : 14, fontWeight: ativo ? 700 : 600,
  });

  return (
    <div className="fin-scope ws-shell" style={{ display: "flex", minHeight: "100dvh" }}>
      <aside
        className="ws-rail"
        style={{
          width: 244, flex: "none", display: "flex", flexDirection: "column", padding: 16, gap: 4,
          position: "sticky", top: 0, height: "100dvh", background: "var(--surface)",
          borderRight: "1px solid var(--border)",
        }}
      >
        {/* Marca + seletor de empresa. No celular o rótulo some (`.ws-brand-text`
            da fundação) e sobra um alvo de 44px que abre a mesma folha — sem
            isso, trocar de empresa viraria coisa só de computador. */}
        <div className="ws-brand" style={{ padding: "0 0 14px" }}>
          <Dropdown titulo="Empresa" secoes={secoesEmpresa} largura={244}
            // Sem empresa não há o que escolher — o aviso ocupa a folha, como antes.
            cabecalho={empresas.length === 0 ? (
              <p style={{ padding: "4px 10px 10px", fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
                Nenhuma empresa disponível. {schemaPendente ? "Rode supabase/financeiro.sql." : "Fale com quem administra o financeiro."}
              </p>
            ) : undefined}
            gatilho={({ ref, ...g }) => (
          <button
            ref={ref}
            type="button"
            {...g}
            title={geral ? "Vendo todas as empresas somadas" : empresaAtiva ? `Empresa: ${empresaAtiva.nome}` : "Escolher empresa"}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: "var(--tap)",
              padding: "6px 8px", borderRadius: "var(--r-sm)", cursor: "pointer",
              background: "transparent", border: "1px solid var(--border)", color: "var(--text)",
            }}
          >
            {/* O logo da empresa manda no botão. A carteira genérica só aparece
                quando não há empresa escolhida — com duas empresas, um ícone
                igual para as duas não diz em qual você está. */}
            {geral ? (
              <span
                aria-hidden
                style={{
                  width: 30, height: 30, flex: "none", borderRadius: 9, display: "grid", placeItems: "center",
                  background: `color-mix(in srgb, ${ACENTO} 15%, transparent)`,
                }}
              >
                <Icon name="stack-2" size={17} color={ACENTO} />
              </span>
            ) : empresaAtiva ? (
              <Marca
                marca={{
                  nome: empresaAtiva.nome,
                  logo: logos[empresaAtiva.id] ?? null,
                  icone: empresaAtiva.icone ?? null,
                  cor: empresaAtiva.cor ?? null,
                }}
                tamanho={30}
                raio={9}
              />
            ) : (
              <span
                aria-hidden
                style={{
                  width: 30, height: 30, flex: "none", borderRadius: 9, display: "grid", placeItems: "center",
                  background: `color-mix(in srgb, ${ACENTO} 15%, transparent)`,
                }}
              >
                <Icon name="wallet" size={17} color={ACENTO} />
              </span>
            )}
            <span className="ws-brand-text" style={{ minWidth: 0, flex: 1, textAlign: "start" }}>
              <strong
                style={{
                  display: "block", fontSize: 15, fontWeight: 800, letterSpacing: "-.02em",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {geral ? "Visão geral" : empresaAtiva?.nome ?? "Financeiro"}
              </strong>
              <small style={{ fontSize: 10.5, color: "var(--text-dim)" }}>
                {geral ? `${empresas.length} empresas somadas` : "Financeiro"}
              </small>
            </span>
            <Icon name="chevron-down" size={15} color="var(--text-dim)" />
          </button>
            )} />

        </div>

        <nav
          ref={nav}
          className="ws-nav"
          style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, overflowY: "auto", margin: "2px -4px", padding: "0 4px" }}
        >
          {NAV.filter((n) => !n.podeVer || n.podeVer(poderes)).map((n) => {
            const ativo = ativoEm(n);
            return (
              <Link key={n.href} href={n.href} aria-current={ativo ? "page" : undefined} style={linkEstilo(ativo)}>
                <NavIcone nome={n.icone} tamanho={18} ativo={ativo} />
                {n.label}
              </Link>
            );
          })}

          {cadastrosVisiveis.length > 0 && (
            <>
              {/* Dois alvos separados, e não um botão só: "Cadastros" LEVA à
                  porta dos cadastros (antes só abria o submenu, e um item de
                  menu que não vai a lugar nenhum lê como link quebrado), e o
                  chevron ao lado abre a lista sem sair da tela. Aninhar um
                  botão dentro do <a> seria HTML inválido e o toque no celular
                  cairia no elemento errado. */}
              <span style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
                <Link
                  href="/financeiro/cadastros"
                  aria-current={pathname === "/financeiro/cadastros" ? "page" : undefined}
                  style={{ ...linkEstilo(pathname === "/financeiro/cadastros"), flex: 1, minWidth: 0 }}
                >
                  <Icon
                    name="folder"
                    size={18}
                    color={pathname === "/financeiro/cadastros" ? ACENTO : "var(--text-dim)"}
                  />
                  Cadastros
                </Link>
                <button
                  type="button"
                  onClick={() => setCadastrosAberto((a) => !a)}
                  aria-expanded={cadastrosAberto}
                  aria-label={cadastrosAberto ? "Recolher cadastros" : "Expandir cadastros"}
                  style={{
                    display: "grid", placeItems: "center", flex: "none",
                    width: "var(--tap)", minHeight: "var(--tap)", borderRadius: "var(--r-sm)",
                    cursor: "pointer", background: "transparent", border: "none",
                  }}
                >
                  <TrocaIcone ligado={cadastrosAberto} a="chevron-down" b="chevron-up" size={15} corA="var(--text-dim)" corB="var(--text-dim)" />
                </button>
              </span>
              {cadastrosAberto && cadastrosVisiveis.map((c) => {
                const ativo = ativoEm(c);
                return (
                  <Link key={c.href} href={c.href} aria-current={ativo ? "page" : undefined} style={linkEstilo(ativo, true)}>
                    <NavIcone nome={c.icone} tamanho={16} ativo={ativo} />
                    {c.label}
                  </Link>
                );
              })}
            </>
          )}

          {CONFIGURACAO.filter((c) => !c.podeVer || c.podeVer(poderes)).map((c) => {
            const ativo = ativoEm(c);
            return (
              <Link
                key={c.href}
                href={c.href}
                aria-current={ativo ? "page" : undefined}
                style={{
                  ...linkEstilo(ativo),
                  // Mesmo traço que separava Acessos: aqui separa "trabalhar
                  // com dinheiro" de "decidir a moldura do módulo".
                  marginTop: 8, paddingTop: 12,
                  borderTop: "1px solid var(--border)",
                }}
              >
                <NavIcone nome={c.icone} tamanho={18} ativo={ativo} />
                {c.label}
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
                {(name || "V").charAt(0).toUpperCase()}
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
            minHeight: "var(--tap)", padding: "0 12px", borderRadius: "var(--r-sm)", textDecoration: "none",
            border: "1px solid var(--border)", color: "var(--text-dim)", fontSize: 12.5, fontWeight: 700,
          }}
        >
          <Icon name="logout" size={15} color="var(--text-dim)" />
          <span className="ws-exit-label">Sair do Financeiro</span>
        </Link>
      </aside>

      <main className="ws-main" style={{ flex: 1, minWidth: 0, padding: "26px clamp(14px, 1.6vw, 30px)", overflowX: "hidden" }}>
        {children}
      </main>
    </div>
  );
}

// O giro que substitui o ícone enquanto a rota está em voo — mesma peça do
// `Shell.tsx` da plataforma, e existe pelo mesmo motivo: a folha e os cadastros
// levam segundos, e o clique não deixava nenhum rastro até o `loading.tsx`
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
