"use client";

// Workspace do TridiFlow: sidebar própria (identidade do produto) dentro do ERP.
// Some nas telas do EDITOR (/tridiflow/<botId>) — lá o editor ocupa a tela toda.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "../Icon";
import { aplicarTema, lerAparencia, salvarAparenciaNaConta } from "@/lib/aparencia";
import { Fila, TrocaIcone } from "../ui/micro";
import "./_shared/config-micro.css";
import { ABAS, CHAVE_CONFIG } from "./abas";

// A lista de abas e a sub que cada uma exige moram em ./abas — o dashboard usa
// a MESMA lista pra decidir pra onde mandar quem não tem "projetos".
const CONFIG_BASE = "/tridiflow/configuracoes";
const CONFIG_SUB: { secao: string; label: string; icon: string }[] = [
  { secao: "dominios", label: "Domínios", icon: "world" },
  { secao: "usuarios", label: "Usuários", icon: "user-check" },
  { secao: "webhooks", label: "Webhooks", icon: "plug" },
  { secao: "logs", label: "Logs de atividades", icon: "history" },
  { secao: "rastreamento", label: "Rastreamento & Pixels", icon: "chart-dots" },
];
// Primeiros segmentos que são "workspace" (têm a sidebar). Outro = editor (tela cheia).
const WORKSPACE = new Set(["", "meus-bots", "templates", "temas", "analytics", "contatos", "integracoes", "configuracoes"]);

export function TridiflowShell({ name, role, photoUrl, keys, children }: {
  name: string; role: string; photoUrl: string | null; keys: string[]; children: React.ReactNode;
}) {
  // Só as abas que a grade liberou pra esta pessoa. Item de menu que leva a um
  // 403 é pior que item ausente: parece defeito do sistema, não permissão.
const NAV = ABAS.filter((a) => keys.includes(a.chave));
  const podeConfig = keys.includes(CHAVE_CONFIG);
  const pathname = usePathname();
  const tipoAtual = useSearchParams().get("tipo");
  const seg = pathname.replace(/^\/tridiflow\/?/, "").split("/")[0];
  const isEditor = !WORKSPACE.has(seg);
  const configAtivo = pathname === CONFIG_BASE || pathname.startsWith(CONFIG_BASE + "/");
  const [configOpen, setConfigOpen] = useState(configAtivo);
  // Tema do workspace (claro/escuro) — persistido. Aplica .tf-dark na raiz e cascateia pro editor.
  const [dark, setDark] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Rail horizontal no celular: traz a aba atual pra vista.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);
  // O TridiFlow guardava um tema SÓ DELE (`localStorage["tf-tema"]`), separado
  // do resto do sistema. Quem usava o Gaius no escuro entrava aqui e recebia um
  // workspace claro, até achar e apertar um segundo interruptor — e a escolha
  // não voltava na outra máquina, porque só o tema do app sobe pra conta.
  // "Tema" não é uma preferência por tela: é uma só, do sistema. Agora ele LÊ a
  // mesma fonte que todo mundo (`html.light`) e o botão daqui move essa fonte —
  // o controle continua onde estava, mas passou a mexer na coisa certa.
  useEffect(() => {
    const upd = () => setDark(!document.documentElement.classList.contains("light"));
    upd();
    const mo = new MutationObserver(upd);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  const alternarTema = () => {
    // Apertar aqui é escolher: sai do "sistema" pro oposto do que está pintando.
    const claro = document.documentElement.classList.contains("light");
    aplicarTema(claro ? "dark" : "light");     // o MutationObserver acima repinta
    salvarAparenciaNaConta(lerAparencia());    // e a escolha acompanha a pessoa
  };

  // Paleta da sidebar. Os tons de estrutura (fundo, borda, texto) vêm dos
  // tokens do app — é o que faz o workspace parecer o MESMO produto — e só o
  // acento continua próprio, que é a identidade do TridiFlow. Antes eram 20
  // hexadecimais escritos aqui: um roxo que ignorava a cor escolhida pela
  // pessoa e cinzas que não batiam com nenhum outro cinza do sistema.
  const S = dark ? {
    bg: "linear-gradient(180deg,#151b2e 0%,#0c1020 100%)", rightBorder: "rgba(255,255,255,.06)",
    brand: "#fff", text: "rgba(255,255,255,.64)", textActive: "#fff",
    icon: "rgba(255,255,255,.55)", iconActive: "var(--primary-texto)",
    activeBg: "color-mix(in srgb, var(--primary) 22%, transparent)",
    activeRing: "inset 0 0 0 1px color-mix(in srgb, var(--primary) 38%, transparent)",
    chevron: "rgba(255,255,255,.5)", divider: "rgba(255,255,255,.09)",
    subActiveBg: "color-mix(in srgb, var(--primary) 17%, transparent)",
    subBorderLeft: "rgba(255,255,255,.1)", subText: "rgba(255,255,255,.56)", subIcon: "rgba(255,255,255,.45)",
    avatarBg: "rgba(255,255,255,.14)", roleText: "rgba(255,255,255,.5)",
    btnBorder: "rgba(255,255,255,.12)", btnText: "rgba(255,255,255,.75)", btnIcon: "rgba(255,255,255,.7)",
  } : {
    bg: "linear-gradient(180deg,var(--surface),color-mix(in srgb, var(--bg) 62%, var(--surface)))",
    rightBorder: "var(--border)",
    brand: "var(--text)", text: "var(--text-dim)", textActive: "var(--text)",
    icon: "var(--neutro)", iconActive: "var(--primary-texto)",
    activeBg: "color-mix(in srgb, var(--primary) 10%, transparent)",
    activeRing: "inset 0 0 0 1px color-mix(in srgb, var(--primary) 26%, transparent)",
    chevron: "var(--neutro)", divider: "var(--border)",
    subActiveBg: "color-mix(in srgb, var(--primary) 9%, transparent)",
    subBorderLeft: "var(--border)", subText: "var(--text-dim)", subIcon: "var(--neutro)",
    avatarBg: "var(--surface-2)", roleText: "var(--text-dim)",
    btnBorder: "var(--border)", btnText: "var(--text-dim)", btnIcon: "var(--text-dim)",
  };

  return (
    <div className={"tf-workspace ws-shell" + (dark ? " tf-dark" : "")} style={{ display: "flex", minHeight: "100dvh" }}>

      <aside className="ws-rail" style={{ width: 246, flex: "none", background: S.bg, color: S.textActive, display: "flex", flexDirection: "column", padding: 16, gap: 4, position: "sticky", top: 0, height: "100dvh", borderRight: `1px solid ${S.rightBorder}` }}>
        {/* Marca */}
        <div className="ws-brand" style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 6px 16px" }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,color-mix(in srgb, var(--primary) 72%, #fff),var(--primary))", display: "grid", placeItems: "center", flex: "none", boxShadow: "0 4px 14px -4px color-mix(in srgb, var(--primary) 70%, transparent)" }}>
            <Icon name="message-chatbot" size={19} color="#fff" />
          </span>
          <strong className="ws-brand-text" style={{ fontSize: 18.5, fontWeight: 800, letterSpacing: "-.02em", color: S.brand }}>TridiFlow</strong>
        </div>

        {/* Navegação */}
        <nav ref={navRef} className="ws-nav" style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, overflowY: "auto", margin: "2px -4px", padding: "0 4px" }}>
          {NAV.map((n) => {
            // Projetos/Fluxos/Páginas dividem o mesmo caminho e só diferem pelo
            // ?tipo=. Sem comparar a query, os três acenderiam ao mesmo tempo.
            const [base, query] = n.href.split("?");
            const tipoDoItem = new URLSearchParams(query ?? "").get("tipo");
            const active = n.exact
              ? pathname === n.href
              : base === "/tridiflow/meus-bots"
                ? pathname === base && (tipoAtual ?? "") === (tipoDoItem ?? "")
                : (pathname === base || pathname.startsWith(base + "/"));
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 11, textDecoration: "none",
                background: active ? S.activeBg : "transparent",
                color: active ? S.textActive : S.text, fontSize: 14, fontWeight: active ? 700 : 600,
                boxShadow: active ? S.activeRing : "none",
              }}>
                <Icon name={n.icon} size={18} color={active ? S.iconActive : S.icon} /> {n.label}
              </Link>
            );
          })}

          {/* Configurações (grupo) */}
          {podeConfig && <button onClick={() => setConfigOpen((v) => !v)} aria-expanded={configOpen} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 11, border: "none", cursor: "pointer", width: "100%", textAlign: "left",
            background: configAtivo ? S.activeBg : "transparent",
            color: configAtivo ? S.textActive : S.text, fontSize: 14, fontWeight: configAtivo ? 700 : 600,
          }}>
            <Icon name="settings" size={18} color={configAtivo ? S.iconActive : S.icon} /> Configurações
            {/* Abrir passa do ponto, fechar é mais curto (tokens em config-micro.css). */}
            <span className="tfm-seta" data-aberta={configOpen ? "1" : undefined} style={{ marginLeft: "auto" }}>
              <Icon name="chevron-right" size={15} color={S.chevron} />
            </span>
          </button>}
          {/* `display: contents`: o invólucro só escalona a entrada dos filhos —
              no celular a faixa horizontal continua enxergando os links direto. */}
          {podeConfig && configOpen && <Fila style={{ display: "contents" }}>{CONFIG_SUB.map((s) => {
            const href = `${CONFIG_BASE}/${s.secao}`;
            // Times é a outra visão de Usuários (aba dentro da tela).
            const active = pathname === href || (s.secao === "usuarios" && pathname === `${CONFIG_BASE}/times`);
            return (
              <Link key={s.secao} href={href} aria-current={active ? "page" : undefined} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 12px 8px 22px", borderRadius: 10, textDecoration: "none", marginLeft: 8,
                borderLeft: `1px solid ${S.subBorderLeft}`,
                background: active ? S.subActiveBg : "transparent",
                color: active ? S.textActive : S.subText, fontSize: 13, fontWeight: active ? 700 : 600,
              }}>
                <Icon name={s.icon} size={15} color={active ? S.iconActive : S.subIcon} /> {s.label}
              </Link>
            );
          })}</Fila>}
        </nav>

        {/* Usuário + voltar ao ERP */}
        <div className="ws-user" style={{ borderTop: `1px solid ${S.divider}`, paddingTop: 12, marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
          {photoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={photoUrl} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flex: "none" }} />
            : <div style={{ width: 34, height: 34, borderRadius: "50%", background: S.avatarBg, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14, flex: "none", color: S.textActive }}>{(name || "V").charAt(0).toUpperCase()}</div>}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: S.textActive }}>{name}</div>
            <div style={{ fontSize: 11, color: S.roleText, textTransform: "capitalize" }}>{role}</div>
          </div>
        </div>
        <div className="ws-exit" style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Link href="/home" title="Voltar ao sistema"
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px 12px", borderRadius: 11, textDecoration: "none", border: `1px solid ${S.btnBorder}`, color: S.btnText, fontSize: 12.5, fontWeight: 700 }}>
            <Icon name="logout" size={15} color={S.btnIcon} /> <span className="ws-exit-label">Sair do TridiFlow</span>
          </Link>
          <button onClick={alternarTema} title={dark ? "Tema claro" : "Tema escuro"} aria-label="Alternar tema"
            style={{ flex: "none", width: 38, display: "grid", placeItems: "center", padding: "9px 0", borderRadius: 11, cursor: "pointer", background: "transparent", border: `1px solid ${S.btnBorder}`, color: S.btnText }}>
            <TrocaIcone ligado={dark} a="moon" b="sun" size={16} corA={S.btnIcon} corB={S.btnIcon} />
          </button>
        </div>
      </aside>

      <main className="ws-main" style={{ flex: 1, minWidth: 0, ...(isEditor ? { height: "100dvh", overflow: "hidden" } : { padding: "26px 32px", overflowX: "hidden" }) }}>{children}</main>
    </div>
  );
}
