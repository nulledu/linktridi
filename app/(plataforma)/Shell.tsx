"use client";

import { useEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { ModuleDef, NavItem } from "@/lib/rbac";
import { OperacaoAbas } from "./operacao/OperacaoAbas";
import { type Role, rotaAtiva } from "@/lib/rbac";
import { Icon } from "./Icon";
import { GaiusMark } from "../GaiusMark";
import { UserPanel } from "./UserPanel";
import { Notificacoes } from "./Notificacoes";
import { StatusAlerta, StatusAviso } from "./StatusAviso";
import { UpdateBanner } from "./UpdateBanner";
import { CommandPalette } from "./CommandPalette";
import { GlobalLightbox } from "./GlobalLightbox";
import { ToastHost } from "./Toast";
import { FilaDeSalvamento } from "./ui/FilaDeSalvamento";
import { MobileTabBar } from "./MobileTabBar";
import { elastico, molar, projetar, rastro } from "./ui/gestos";
import { SussurroHost, sussurrar } from "../Sussurro";
import { DicaHost } from "./ui/Dica";
import { TrocaIcone } from "./ui/micro";
import { eggDoMomento, primeiraVez } from "@/lib/gaius-eggs";
import { PREF_RAIL, adotarDaConta, copiaLocal, escolherVersao, salvarVersionado, type Versionado } from "@/lib/prefs-da-conta";

// Mensagens não está em MODULES de propósito (ver comentário no <nav>): é um
// destino fixo, montado aqui com a mesma forma que os módulos têm.
const MENSAGENS_MOD: ModuleDef = {
  key: "mensagens", label: "Mensagens", href: "/mensagens", icon: "message",
  roles: ["admin", "gerente_producao", "gerente_vendas", "estoquista", "colaborador"],
  ready: true,
};

// Nome da tela atual, pro cabeçalho do celular. Casa pelo href MAIS LONGO que
// prefixa a rota — senão "/vendas" ganharia de "/vendas/comissoes" e o
// cabeçalho mostraria o nome errado justo na tela mais funda, que é onde a
// pessoa mais precisa saber onde está.
function tituloDaRota(pathname: string, modules: ModuleDef[]): string {
  let melhor: ModuleDef | null = null;
  for (const m of [MENSAGENS_MOD, ...modules]) {
    if (pathname === m.href || pathname.startsWith(m.href + "/")) {
      if (!melhor || m.href.length > melhor.href.length) melhor = m;
    }
  }
  return melhor?.label ?? "Gaius";
}

// Casca da plataforma: sidebar com os módulos permitidos + topbar com o usuário.
export function Shell({
  nav,
  modules,
  name,
  role,
  photoUrl = null,
  podeAvisar = false,
  verStatus = false,
  aparenciaNaConta,
  railConta,
  children,
}: {
  nav: NavItem[];
  modules: ModuleDef[];
  name: string;
  role: Role;
  photoUrl?: string | null;
  /** Pode disparar aviso pra outras pessoas (ex-aba "Notificações"). */
  podeAvisar?: boolean;
  /** Tem `administracao:status` (admin e TI): selo, aviso na tela e /status. */
  verStatus?: boolean;
  /** A conta tem tema/cor salvos? `undefined` = não se sabe (bancada /dev-*). */
  aparenciaNaConta?: boolean;
  /** Barra recolhida salva na conta, com a versão. `null` = nada salvo;
   *  `undefined` = não se sabe (bancada /dev-*). */
  railConta?: Versionado<boolean> | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // ACORDEÃO: um grupo aberto por vez. `null` = todos fechados, e o grupo do
  // caminho atual abre sozinho (o NavGroup resolve isso), então navegar não
  // apaga a pista de onde a pessoa está.
  // `undefined` = automático (segue a rota); depois do primeiro clique vale a
  // escolha da pessoa — antes o grupo da rota atual nunca fechava.
  const [grupoAberto, setGrupoAberto] = useState<string | null | undefined>(undefined);
  useEffect(() => { setGrupoAberto(undefined); }, [pathname]);

  // MODO FOCO (apps de Marketing): o layout inteiro vira o app — a sidebar
  // recolhe num menu hambúrguer e o conteúdo ocupa a tela ("site dentro do site").
  // `/lojas` (criador de lojas) entra aqui pelo MESMO motivo: ele traz sidebar
  // própria. Fora desta lista o módulo ganharia duas navegações empilhadas e,
  // no celular, a barra de baixo do ERP cobriria a barra de ações do editor de
  // produto — "Salvar" atrás de um menu.
  //
  // `/rh` entra pela MESMA razão do `/financeiro`: ele tem trilho próprio
  // (`RhShell`). Sem esta linha o módulo nascia com DUAS navegações empilhadas —
  // a barra do ERP à esquerda e o trilho do RH ao lado dela —, e no celular a
  // faixa do RH disputava espaço com a barra de baixo do sistema.
  const FOCO_PREFIXES = ["/tridiflow", "/trafego", "/tridimarket", "/lojas", "/financeiro", "/rh"];
  const foco = FOCO_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  // TridiFlow, Tridify (Tráfego) e TridiMarket têm a PRÓPRIA sidebar (workspace):
  // o Shell some por completo e cede a tela; a volta pro ERP fica dentro da
  // sidebar do app.
  const tridiApp = FOCO_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  // Mensagens usa a tela inteira (o padding do main sai), mas continua sendo
  // uma página do ERP: a sidebar fica, e no celular a barra de baixo também —
  // ao contrário dos workspaces, onde o Shell some por completo.
  // `/dev-chat` entra junto para a prova sem login conseguir exercitar o rail
  // (ele depende do Shell real). A página só existe fora de produção.
  const telaCheia = pathname === "/mensagens" || pathname.startsWith("/mensagens/")
    || pathname.startsWith("/dev-chat");
  const [focoOpen, setFocoOpen] = useState(false);   // gaveta aberta dentro do modo foco
  const MENSAGENS_NAV = modules.some((m) => m.key === "central") ? MENSAGENS_MOD : null;

  // RAIL: em Mensagens a sidebar do sistema encolhe para a faixa de ícones.
  // Não é o modo foco (que esconde a sidebar atrás de um hambúrguer): trocar de
  // módulo continua a UM clique, só sem os rótulos. A escolha fica guardada —
  // quem prefere a sidebar inteira expande uma vez e ela não volta a encolher.
  //
  // A escolha mora na CONTA (user_prefs "ui.rail") e vale em qualquer aparelho.
  // `railConta` vem do layout, na mesma leitura do tema, então a barra já nasce
  // no estado certo no HTML do servidor — antes ela nascia aberta e fechava
  // depois que o efeito lia o localStorage. A cópia do aparelho só decide
  // quando é mais nova que a da conta (troca que ainda não subiu, ou cache
  // velho do servidor); regra em lib/prefs-da-conta.ts.
  const CHAVE_RAIL = "gaius:rail";
  const [railManual, setRailManual] = useState<boolean | null>(railConta?.valor ?? null);
  useEffect(() => {
    const local = copiaLocal(CHAVE_RAIL);
    // O formato antigo guardava "1"/"0" (JSON.parse devolve número).
    const valor = local.valor === true || local.valor === 1 ? true
      : local.valor === false || local.valor === 0 ? false : null;
    const d = escolherVersao({ valor, em: local.em }, railConta);
    if (d.valor !== null) setRailManual(d.valor);
    if (d.adotarConta && railConta) adotarDaConta(CHAVE_RAIL, railConta);
    if (d.reenviar && d.valor !== null) void salvarVersionado(PREF_RAIL, CHAVE_RAIL, d.valor);
  }, [railConta?.valor, railConta?.em]); // eslint-disable-line react-hooks/exhaustive-deps
  // O padrão era `?? true`: em Mensagens e no TridiChat a navegação encolhia
  // sozinha pra faixa de ícones, sem ninguém pedir. Duas coisas erradas nisso.
  //
  // A primeira é de agência: o sistema decidia por conta própria, e a pessoa só
  // descobria que dava pra desfazer se achasse o botão. A segunda é pior — sem
  // rótulo, saber o que cada ícone é exige parar o mouse em cima e esperar a
  // dica. A tela ganhava uns 190px e cobrava um passo a mais em toda troca de
  // módulo, o dia inteiro.
  //
  // Agora nasce aberta e encolher é ESCOLHA, guardada. Quem quer a largura
  // extra clica uma vez e ela não volta; quem nunca pediu não perde os rótulos.
  const rail = !tridiApp && telaCheia && (railManual ?? false);
  const alternarRail = () => {
    const proximo = !rail;
    setRailManual(proximo);
    // Sem conta aqui (bancada /dev-*): só a cópia do aparelho.
    if (railConta === undefined) {
      try { localStorage.setItem(CHAVE_RAIL, JSON.stringify(proximo)); } catch { /* quota */ }
      return;
    }
    void salvarVersionado(PREF_RAIL, CHAVE_RAIL, proximo);
  };

  // Registra acessos recentes (p/ o bloco "Atividade recente" da Home).
  useEffect(() => {
    const m = modules.find((x) => pathname === x.href || pathname.startsWith(x.href + "/"));
    if (!m || m.href === "/central") return;
    try {
      const prev = JSON.parse(localStorage.getItem("gaius:recent") || "[]") as { href: string }[];
      const next = [{ href: m.href, label: m.label, icon: m.icon }, ...prev.filter((r) => r.href !== m.href)].slice(0, 8);
      localStorage.setItem("gaius:recent", JSON.stringify(next));
    } catch { /* ignore */ }
  }, [pathname, modules]);

  // Fecha as gavetas ao trocar de página.
  useEffect(() => { setMobileOpen(false); setFocoOpen(false); }, [pathname]);

  // Marca "a página saiu do topo" — o cabeçalho do celular só ganha a linha
  // divisória quando existe conteúdo passando por baixo dele (borda de rolagem,
  // não filete permanente).
  //
  // Sentinela + IntersectionObserver, NÃO um listener de `scroll`: o navegador
  // avisa só quando o estado vira, sem rodar código a cada quadro de rolagem, e
  // funciona igual se um dia o contêiner de rolagem deixar de ser a janela.
  useEffect(() => {
    const alvo = document.getElementById("topo-sentinela");
    if (!alvo) return;
    const obs = new IntersectionObserver(
      ([e]) => { document.body.dataset.rolado = e.isIntersecting ? "0" : "1"; },
      { threshold: 0 },
    );
    obs.observe(alvo);
    return () => { obs.disconnect(); delete document.body.dataset.rolado; };
  }, []);

  // ── Arrastar a gaveta pra fechar ──────────────────────────────────────────
  // Uma gaveta que só fecha por toque no "x" ou no véu é uma gaveta pela
  // metade: no celular a expectativa é empurrar de volta com o polegar. Ela
  // gruda no dedo 1:1 e a decisão de fechar sai da PROJEÇÃO do momento — um
  // peteleco curto e rápido fecha, um arrasto longo e lento volta.
  const refGaveta = useRef<HTMLElement>(null);
  const refVeu = useRef<HTMLDivElement>(null);
  const arrasto = useRef<{ x0: number; y0: number; larg: number; hist: ReturnType<typeof rastro>; arrastando: boolean } | null>(null);
  const cancelaMola = useRef<(() => void) | null>(null);

  const desenharGaveta = (dx: number, larg?: number) => {
    const el = refGaveta.current;
    if (el) el.style.transform = dx ? `translateX(${dx}px)` : "";
    const veu = refVeu.current;
    if (veu) {
      const L = larg ?? arrasto.current?.larg ?? el?.offsetWidth ?? 1;
      // O véu clareia junto: sem isso o fundo fica cravado no escuro enquanto a
      // gaveta desliza e "pisca" ao sumir. `--veu` só é lido pela COR — a
      // `opacity` pertence à transição de abrir/fechar e as duas brigariam.
      if (dx < 0) veu.style.setProperty("--veu", String(Math.max(0, 1 + (dx / L) * 0.9)));
      else veu.style.removeProperty("--veu");
    }
  };

  // TOQUE NÃO É ARRASTO. A primeira versão capturava o ponteiro já no
  // `pointerdown` da gaveta inteira — e com `setPointerCapture` ativo o `click`
  // é redirecionado pro <aside>, então NENHUM link do menu funcionava: a pessoa
  // tocava em "Central" e não acontecia nada.
  //
  // Agora o gesto começa só quando há intenção de arrastar: uns 10px percorridos
  // E predominantemente na horizontal. Enquanto isso não acontece, o toque segue
  // seu caminho normal (link navega, botão clica) e a rolagem vertical de dentro
  // da gaveta continua funcionando.
  const LIMIAR = 10;

  function gavetaPegar(e: React.PointerEvent) {
    if (!mobileOpen || !refGaveta.current) return;
    cancelaMola.current?.();
    const h = rastro();
    h.anota(e.clientX, e.timeStamp);
    // `arrastando: false` = ainda é um toque comum. Sem captura, sem marcar o
    // DOM, sem impedir nada.
    arrasto.current = { x0: e.clientX, y0: e.clientY, larg: refGaveta.current.offsetWidth, hist: h, arrastando: false };
  }

  function gavetaMover(e: React.PointerEvent) {
    const a = arrasto.current;
    if (!a) return;
    const dx = e.clientX - a.x0;
    const dy = e.clientY - a.y0;

    if (!a.arrastando) {
      // Vertical primeiro? É rolagem do menu — desiste do arrasto de vez, senão
      // um deslize pra baixo acabaria fechando a gaveta.
      if (Math.abs(dy) > LIMIAR && Math.abs(dy) > Math.abs(dx)) { arrasto.current = null; return; }
      if (Math.abs(dx) < LIMIAR) return;               // ainda indeciso: espera
      a.arrastando = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (refGaveta.current) refGaveta.current.dataset.arrastando = "1";
    }

    a.hist.anota(e.clientX, e.timeStamp);
    // Desconta o limiar: sem isso a gaveta "pula" 10px no instante em que o
    // arrasto é reconhecido, em vez de sair de onde o dedo está.
    const bruto = dx - Math.sign(dx) * LIMIAR;
    // Pra esquerda (fechar) segue o dedo; pra direita só resiste — a gaveta já
    // está aberta até o batente, não há pra onde ir.
    desenharGaveta(bruto <= 0 ? bruto : elastico(bruto, a.larg), a.larg);
  }

  function gavetaSoltar(e: React.PointerEvent) {
    const a = arrasto.current;
    if (!a || !refGaveta.current) return;
    arrasto.current = null;
    // Foi só um toque: deixa o clique seguir pro link/botão de dentro.
    if (!a.arrastando) return;
    delete refGaveta.current.dataset.arrastando;
    const atual = Math.min(0, e.clientX - a.x0 + LIMIAR);
    const vel = a.hist.velocidade();
    const destino = atual + projetar(vel);
    if (destino < -a.larg * 0.34) {
      cancelaMola.current = molar(atual, -a.larg, vel, (x) => desenharGaveta(x, a.larg));
      // O desmonte não pende da mola: sem quadros (aba de fundo, WebView
      // antigo) a gaveta ficaria parada no meio do caminho.
      setTimeout(() => { desenharGaveta(0, a.larg); setMobileOpen(false); }, 240);
    } else {
      cancelaMola.current = molar(atual, 0, vel, (x) => desenharGaveta(x, a.larg));
      setTimeout(() => { if (!arrasto.current) desenharGaveta(0, a.larg); }, 600);
    }
  }

  // Fechou por outro caminho (toque no véu, no "x", trocar de página): limpa o
  // transform, senão a próxima abertura nasce deslocada.
  useEffect(() => { if (!mobileOpen) { cancelaMola.current?.(); desenharGaveta(0); } }, [mobileOpen]);

  // Frase do momento (aniversário do sistema / virada do dia). Uma vez por data
  // e só isso: não é notificação, não fica no histórico, some sozinha.
  useEffect(() => {
    const agora = new Date();
    const egg = eggDoMomento(agora);
    if (!egg) return;
    const dia = agora.toISOString().slice(0, 10);
    if (!primeiraVez(`momento.${dia}`)) return;
    const t = setTimeout(() => sussurrar(egg), 1800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100dvh" }}>
      {/* PRIMEIRO elemento focável da página, antes de qualquer coisa da
          sidebar: sem ele, chegar no conteúdo por teclado custa mais de 30 Tabs
          em toda tela. Invisível até receber foco — o estilo mora em
          `.skip-link` no globals.css. */}
      <a className="skip-link" href="#conteudo-principal">Pular para o conteúdo</a>
      {/* Atmosfera de horizonte de eventos — grande arco + glow roxo, estático e
          discreto, atrás de tudo. Sutil nos dois temas. */}
      <div className="gaius-atmos" aria-hidden />
      {/* Burger do MODO FOCO (desktop): os 3 risquinhos que guardam a sidebar.
          No TridiFlow não aparece — a sidebar própria já tem a navegação/volta. */}
      {foco && !tridiApp && (
        <button className="foco-burger glass glass-spec" aria-label={focoOpen ? "Fechar menu" : "Menu"} onClick={() => setFocoOpen((v) => !v)}
          style={{ position: "fixed", top: 14, left: 14, zIndex: 140, width: 46, height: 46, borderRadius: "var(--r-md)", border: "1px solid var(--border)", cursor: "pointer", display: "grid", placeItems: "center", animation: "popIn .38s cubic-bezier(.2,.9,.3,1) both" }}>
          <TrocaIcone ligado={focoOpen} a="menu-2" b="x" size={21} corA="var(--text)" corB="var(--text)" />
        </button>
      )}
      {/* Fundo escuro ao abrir a gaveta (mobile) */}
      <div ref={refVeu} className={`app-scrim${mobileOpen ? " open" : ""}`} onClick={() => setMobileOpen(false)}
        style={{ position: "fixed", inset: 0, zIndex: 115, background: "rgb(0 0 0 / calc(0.5 * var(--veu, 1)))" }} />
      {/* Fundo escuro da gaveta do modo foco (desktop) */}
      {foco && focoOpen && (
        <div className="foco-scrim" onClick={() => setFocoOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 125, background: "rgba(0,0,0,.45)", animation: "fadeIn .25s ease both" }} />
      )}
      {/* Wrapper que anima a LARGURA — o conteúdo desliza pra ocupar o espaço */}
      <div className={`sidebar-wrap${foco ? " foco" : ""}${rail ? " rail" : ""}`} style={{ flex: "none" }}>
      <aside
        ref={refGaveta}
        onPointerDown={gavetaPegar}
        onPointerMove={gavetaMover}
        onPointerUp={gavetaSoltar}
        onPointerCancel={gavetaSoltar}
        className={`glass app-sidebar${mobileOpen ? " open" : ""}${foco ? " foco" : ""}${rail ? " rail" : ""}${foco && focoOpen ? " open-foco" : ""}`}
        style={{
          width: 248,
          flex: "none",
          margin: 14,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          borderRadius: "var(--r-lg)",
          position: "sticky",
          top: 14,
          height: "calc(100dvh - 28px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="rail-oculto" style={{ flex: 1, minWidth: 0 }}><GaiusWordmark /></div>
          <Notificacoes podeAvisar={podeAvisar} />
          {/* Fechar a gaveta sem ter que acertar a faixa de scrim (62px numa
              tela de 320px). Só existe no celular — ver .app-drawer-close. */}
          <button className="app-drawer-close" aria-label="Fechar menu" onClick={() => setMobileOpen(false)}
            style={{ flex: "none", width: 40, height: 40, borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", placeItems: "center" }}>
            <Icon name="x" size={18} color="var(--text)" />
          </button>
        </div>

        {/* Faixa vermelha de "algo caiu" (página de status), linha própria
            abaixo da marca. Só quem tem `administracao:status` (admin e TI);
            tudo verde = não desenha nada. */}
        {verStatus && <StatusAviso faixa />}

        {/* Expandir/encolher o rail. Só existe onde o rail existe — noutras
            telas a sidebar já está inteira e o botão seria ruído. */}
        {telaCheia && !tridiApp && (
          <button className="rail-botao" onClick={alternarRail} aria-expanded={!rail}
            title={rail ? "Expandir menu" : "Encolher menu"} aria-label={rail ? "Expandir menu" : "Encolher menu"}>
            <TrocaIcone ligado={rail} a="chevron-left" b="layout-columns" size={16} corA="var(--text-dim)" corB="var(--text-dim)" />
          </button>
        )}

        {/* Busca global (⌘K) — Spotlight do sistema */}
        <button className="rail-oculto" onClick={() => window.dispatchEvent(new Event("gaius:cmdk"))}
          style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-dim)", cursor: "pointer", fontSize: 13, fontWeight: 600, boxShadow: "none", marginBottom: 2 }}>
          <Icon name="search" size={15} color="var(--text-dim)" /> Buscar…
          {/* Atalho de teclado é ruído em quem não tem teclado — e ocupa a
              largura útil justamente na tela estreita. */}
          <span className="desk-only" style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, border: "1px solid var(--border)", borderRadius: "var(--r-xs)", padding: "1px 6px" }}>⌘K</span>
        </button>

        <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, overflowY: "auto", marginTop: 6 }}>
          {/* Mensagens é a tela que mais se abre no dia — é uma categoria do
              menu, não um atalho enfiado num canto. NÃO vira chave nova de
              RBAC: uma chave nova nasceria ausente do fallback por nível e do
              admin legado, e o item sumiria justamente para quem já usa o
              sistema. Herda a permissão da Central, que é básica para todos. */}
          {MENSAGENS_NAV && <NavLink m={MENSAGENS_NAV} pathname={pathname} />}
          {nav.map((item) =>
            item.type === "module"
              ? <NavLink key={item.module.key} m={item.module} pathname={pathname} />
              : <NavGroup
                  key={item.key} label={item.label} icon={item.icon} children={item.children} hub={item.hub}
                  pathname={pathname} rail={rail} aoExpandir={() => setRailManual(false)}
                  aberto={grupoAberto === undefined ? undefined : grupoAberto === item.key}
                  aoAlternar={(estavaAberto) => setGrupoAberto(estavaAberto ? null : item.key)}
                />,
          )}
        </nav>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 8 }}>
          <UserPanel name={name} role={role} photoUrl={photoUrl} aparenciaNaConta={aparenciaNaConta} />
        </div>
      </aside>
      </div>

      {/* ── Cabeçalho do celular ────────────────────────────────────────────
          Até aqui o celular não tinha topo NENHUM: sem título, sem botão de
          menu, sem contexto. A única porta pra navegação era a aba "Mais" lá
          embaixo, e rolar a página apagava qualquer pista de onde a pessoa
          estava. Quatro perguntas que toda tela deve responder — onde estou,
          pra onde posso ir, o que tem aqui, como saio — só a terceira tinha
          resposta.

          É camada translúcida com o conteúdo passando POR BAIXO (não uma faixa
          opaca que come 52px de tela), e some nos workspaces, que têm rail
          próprio. */}
      {!tridiApp && (
        <header className="app-topbar">
          <button className="app-topbar-menu" aria-label="Abrir menu" aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}>
            <Icon name="menu-2" size={21} color="var(--text)" />
          </button>
          <span className="app-topbar-titulo">{tituloDaRota(pathname, modules)}</span>
          {verStatus && <StatusAviso />}
          <Notificacoes podeAvisar={podeAvisar} />
        </header>
      )}

      {/* `tabIndex={-1}`: destino do "pular para o conteúdo". Sem ele o
          navegador só rola até aqui e o foco continua no menu — o Tab seguinte
          voltaria pro topo da sidebar, que é exatamente o que o atalho evita. */}
      <main id="conteudo-principal" tabIndex={-1} className={`app-main${tridiApp || telaCheia ? " app-main-ws" : ""}`} style={{ flex: 1, padding: tridiApp || telaCheia ? 0 : foco ? "20px 28px 24px 78px" : "28px 36px", minWidth: 0, transition: "padding .5s cubic-bezier(.2,.9,.3,1)" }}>
        {/* No TridiFlow o wrapper tem key ESTÁVEL: o layout/sidebar do workspace
            não remonta (nem "pisca") ao navegar entre as telas.

            `backwards`, NÃO `both` — e isto vale mais do que parece. Terminar o
            keyframe em `transform: none` não bastava: com `fill-mode: both` o
            Chrome mantém o valor ANIMADO aplicado depois de acabar, e "none"
            resolve como `matrix(1,0,0,1,0,0)`. Medido aqui: animação
            `finished`, `currentTime: 320`, e o computed ainda vinha matriz.
            Uma matriz identidade é transform do mesmo jeito — o wrapper vira
            bloco de contenção e TODO `position: fixed` não-portado passa a
            ancorar nesta coluna em vez da tela (o painel de detalhe da Central
            nascia flutuando no meio do conteúdo). `backwards` dá o estado de
            ANTES do início, que é o que a entrada precisa, e não deixa fill
            nenhum depois — acabou a animação, acabou o transform. */}
        {/* Sentinela da borda de rolagem do cabeçalho: enquanto ela estiver na
            tela, a página está no topo. Zero altura, invisível, sem custo. */}
        <div id="topo-sentinela" aria-hidden style={{ height: 1, marginBottom: -1 }} />
        {/* Fora do wrapper com key: a fileira não remonta ao trocar de aba, e a
            pílula do <Abas> VIAJA de uma área pra outra em vez de renascer. */}
        {!tridiApp && <OperacaoAbas pathname={pathname} nav={nav} />}
        <div data-pagina key={tridiApp ? "workspace" : pathname} style={{ animation: tridiApp || telaCheia ? undefined : "pageIn .32s cubic-bezier(.2,.9,.3,1) backwards" }}>{children}</div>
      </main>
      {/* Navegação do celular. Nos workspaces (TridiFlow/Tridify/TridiMarket)
          quem manda é o rail do próprio app — duas barras seria ruído. */}
      {!tridiApp && <MobileTabBar modules={modules} role={role} aberto={mobileOpen} onMais={() => setMobileOpen((v) => !v)} />}
      <UpdateBanner />
      <CommandPalette modules={modules} />
      <GlobalLightbox />
      <ToastHost />
      {/* Cartão fixo no canto quando uma queda NOVA chega (admin e TI). Mora
          aqui, fora da sidebar, pra valer também nos apps de tela cheia
          (TridiFlow, Tridify…), onde a sidebar e a barra do celular somem. */}
      {verStatus && <StatusAlerta />}
      <FilaDeSalvamento />
      <SussurroHost />
      <DicaHost />
    </div>
  );
}

// Item de navegação (módulo). `indent` para filhos de um grupo.
function NavLink({ m, pathname, indent = false, ativo }: { m: ModuleDef; pathname: string; indent?: boolean; ativo?: boolean }) {
  const active = ativo ?? rotaAtiva(pathname, m.href);
  return (
    <Link href={m.href} data-dica={m.label} style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: indent ? "9px 13px 9px 16px" : "11px 13px",
      // O item recuado media 40px — abaixo dos 44 do dedo. Passava despercebido
      // enquanto ele estava enterrado a três cliques; agora que os grupos têm um
      // nível só, é por AQUI que se chega no TridiChat e no Tráfego no celular.
      // `minHeight` em vez de mais padding: o recuo visual continua igual.
      minHeight: "var(--tap)",
      borderRadius: "var(--r-sm)", fontSize: indent ? 14 : 15, fontWeight: 600,
      color: active ? "var(--on-primary, #fff)" : "var(--text-dim)", background: active ? "var(--primary-acao, var(--primary))" : "transparent",
    }}>
      <span style={{ width: indent ? 22 : 26, height: indent ? 22 : 26, borderRadius: "var(--r-xs)", flex: "none", display: "grid", placeItems: "center", background: active ? "rgba(255,255,255,0.22)" : "var(--surface-2)" }}>
        <NavIcone nome={m.icon} tamanho={indent ? 15 : 17} ativo={active} />
      </span>
      <span className="nav-rotulo">{m.label}</span>
      {!m.ready && <span className="nav-rotulo" style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>em breve</span>}
    </Link>
  );
}

// O ícone do item — e, ENQUANTO A NAVEGAÇÃO ESTÁ EM VOO, um giro no lugar dele.
//
// Telas pesadas (Pessoas, a folha do Financeiro) levam segundos pra responder,
// e até aqui o clique não deixava rastro nenhum: o item continuava apagado, a
// tela anterior parada, e a pessoa clicava de novo achando que não pegou. O
// `loading.tsx` só entra quando o segmento começa a renderizar; este giro
// aparece no INSTANTE do clique, que é o intervalo que estava mudo.
//
// `useLinkStatus` do próprio Next: só funciona dentro de um `<Link>`, e volta a
// `false` sozinho quando a rota troca — não há estado nosso pra sincronizar.
function NavIcone({ nome, tamanho, ativo }: { nome: string; tamanho: number; ativo: boolean }) {
  const { pending } = useLinkStatus();
  if (pending) {
    return (
      <span
        className="spin"
        aria-label="Carregando"
        style={{
          width: tamanho, height: tamanho, borderRadius: "50%",
          border: `2px solid ${ativo ? "rgba(255,255,255,0.35)" : "var(--surface-3, var(--border))"}`,
          borderTopColor: ativo ? "#fff" : "var(--text)",
        }}
      />
    );
  }
  return <Icon name={nome} size={tamanho} color={ativo ? "#fff" : "var(--text)"} />;
}

/**
 * Grupo colapsável, em ACORDEÃO: abrir um fecha o outro.
 *
 * O estado de aberto NÃO mora aqui — mora na barra (`grupoAberto`), e é isso
 * que faz o acordeão existir. Com cada grupo guardando o próprio `open`, os
 * três podiam ficar abertos ao mesmo tempo e a barra virava uma lista de 14
 * itens com rolagem própria. Agora a altura máxima é a do MAIOR grupo, não a
 * soma de todos.
 *
 * O grupo do caminho atual abre sozinho e não fecha por clique em outro: quem
 * está dentro de Estoque continua vendo onde está.
 */
function NavGroup({ label, icon, children, hub, pathname, rail = false, aoExpandir, aberto, aoAlternar }: {
  label: string; icon: string; children: ModuleDef[]; pathname: string;
  /** O item-hub fica aceso também dentro das áreas dele (Estoque, Logística…). */
  hub?: { modulo: ModuleDef; areas: ModuleDef[] };
  rail?: boolean; aoExpandir?: () => void;
  /** `undefined` = automático: abre se a rota atual é de um filho. */
  aberto: boolean | undefined; aoAlternar: (estavaAberto: boolean) => void;
}) {
  const ativo = (c: ModuleDef) => rotaAtiva(pathname, c.href)
    || (c.key === hub?.modulo.key && hub.areas.some((a) => rotaAtiva(pathname, a.href)));
  const childActive = children.some(ativo);
  const open = aberto ?? childActive;
  return (
    <div>
      {/* No rail o submenu não cabe (a faixa tem 56px). Clicar no grupo
          EXPANDE a sidebar e já deixa o grupo aberto, em vez de abrir uma
          lista ilegível dentro da faixa. */}
      <button data-dica={label} onClick={() => { if (rail) { aoExpandir?.(); } aoAlternar(open && !rail); }} style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 13px", borderRadius: "var(--r-sm)",
        fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer", background: "transparent", color: "var(--text-dim)",
      }}>
        <span style={{ width: 26, height: 26, borderRadius: "var(--r-xs)", flex: "none", display: "grid", placeItems: "center", background: "var(--surface-2)" }}>
          <Icon name={icon} size={17} color="var(--text)" />
        </span>
        <span className="nav-rotulo">{label}</span>
        <span className="nav-rotulo" style={{ marginLeft: "auto", display: "flex" }}><TrocaIcone ligado={open} a="chevron-down" b="chevron-up" size={15} corA="var(--text-dim)" corB="var(--text-dim)" /></span>
      </button>
      {open && !rail && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 3, paddingLeft: 10, borderLeft: "1px solid var(--border)", marginLeft: 12 }}>
          {children.map((c) => <NavLink key={c.key} m={c} pathname={pathname} indent ativo={ativo(c)} />)}
        </div>
      )}
    </div>
  );
}


// Wordmark do sistema "Gaius". Easter egg: 7 cliques revelam o lema do casamento
// romano "Ubi tu Gaius, ego Gaia." (onde tu fores Gaius, eu serei Gaia).
function GaiusWordmark() {
  const [n, setN] = useState(0);
  const [egg, setEgg] = useState(false);
  function tap() {
    setN((c) => {
      const v = c + 1;
      if (v >= 7) { setEgg(true); setTimeout(() => setEgg(false), 4200); return 0; }
      return v;
    });
  }
  return (
    <div style={{ position: "relative" }}>
      {/* Logo navega pra home (convenção universal); o onClick continua contando
          toques pro easter egg — clicar 7x rápido dispara o lema E navega. */}
      <Link href="/inicio" onClick={tap} title="Gaius — voltar ao início" style={{ display: "flex", alignItems: "center", gap: 11, padding: "6px 8px 18px", userSelect: "none", color: "var(--text)", textDecoration: "none" }}>
        <GaiusMark size={32} style={{ flex: "none" }} />
        <span style={{ fontFamily: "var(--font-wordmark), var(--font)", fontSize: 14, fontWeight: 400, letterSpacing: "0.13em", textIndent: "0.13em", whiteSpace: "nowrap" }}>GAIUS</span>
      </Link>
      {egg && (
        <div className="glass glass-spec" style={{ position: "absolute", left: 6, top: 44, zIndex: 50, padding: "10px 14px", borderRadius: "var(--r-sm)", fontSize: 12.5, fontStyle: "italic", color: "var(--text)", whiteSpace: "nowrap", boxShadow: "0 10px 30px rgba(31,38,135,.25)", animation: "riseIn .4s ease both" }}>
          “Ubi tu Gaius, ego Gaia.”
        </div>
      )}
    </div>
  );
}

