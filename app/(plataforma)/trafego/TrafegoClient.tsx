"use client";

import { tfSet, sincronizarComConta } from "./ajustes-na-conta";
import { Tecla } from "@/app/(plataforma)/ui/exibicao";
import Link from "next/link";
import { avisarAtualizacao, avisarVendaNova, useGastoManual } from "./atualizacao";
import { Icon } from "../Icon";
import { useSticky } from "../useSticky";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePollComRecuo } from "../ui/usePoll";
import { useComImposto } from "./imposto";
import { comImposto, fatorImposto, snapshotSemImposto } from "@/lib/trafego-imposto";
import { TrocaIcone } from "../ui/micro";
import { MarketingX1 } from "../comercial/MarketingX1";
import { PeriodPicker, periodQuery, type PeriodState } from "../PeriodPicker";
import type { VendasSnapshot } from "@/lib/trafego-vendas";
import { useAdsOverview, CampanhasView, TagsView, FunilView, CarregandoAds, SemAds } from "./TrafegoOverview";
import { CriativosStudio } from "./CriativosStudio";
import { RastreamentoTrack } from "./RastreamentoTrack";
import { RegrasView } from "./RegrasView";
import { RelatoriosView } from "./RelatoriosView";
import { IntegracoesCentral } from "./IntegracoesCentral";
import { CriativosView } from "./CriativosView";
import { PainelPersonalizavel } from "./PainelPersonalizavel";
import { PrevisaoFaturamento } from "../ui/PrevisaoFaturamento";
import { CampanhasPro } from "./CampanhasPro";
import { ComandoRapido } from "./ComandoRapido";
import { FonteSelector } from "./FonteSelector";
import { FunilPro } from "./FunilPro";
import { useSyncWarehouse } from "./useSyncWarehouse";
import { SyncStatus, FilterChip } from "./TfKit";
import { VisualizacoesSalvas } from "./VisualizacoesSalvas";
import { FontesView } from "./FontesView";
import { useIsMobile } from "../ui/useMediaQuery";
import { Botao, BotaoIcone, Interruptor } from "../ui/controles";

// ── Tráfego Pago — workspace com SIDEBAR (categorias agrupadas), estilo TridiFlow.
type Tab = "painel" | "campanhas" | "anuncios" | "criativos" | "funil" | "tags" | "rastreamento" | "x1" | "regras" | "relatorios" | "integracoes" | "fontes";
const ANALITICAS: Tab[] = ["painel", "funil", "campanhas", "anuncios", "criativos", "tags"];   // usam o overview do Meta
const COM_PERIODO: Tab[] = [...ANALITICAS, "regras", "relatorios", "fontes"];
// Saíram da Tridify em 14/09/26. Quem tinha uma delas salva (ou clica num card
// que ainda aponta pra ela) cai no Meu painel em vez de numa tela vazia.
const REMOVIDAS = ["geral", "hierarquico", "lucro", "atribuicao", "utmbuilder", "testeab", "eventos"];

const GRUPOS: { titulo: string; itens: { key: Tab; nome: string; icon: string }[] }[] = [
  { titulo: "Painel", itens: [
    { key: "painel", nome: "Meu painel", icon: "layout-grid" },
  ] },
  { titulo: "Desempenho", itens: [
    { key: "campanhas", nome: "Campanhas", icon: "checklist" },
    { key: "anuncios", nome: "Anúncios & criativos", icon: "sparkles" },
    { key: "funil", nome: "Funil", icon: "filter" },
    { key: "tags", nome: "Origens (UTM)", icon: "target" },
  ] },
  { titulo: "Automação", itens: [
    { key: "regras", nome: "Regras & alertas", icon: "bolt" },
  ] },
  { titulo: "Financeiro", itens: [
    { key: "relatorios", nome: "Relatórios", icon: "file-text" },
  ] },
  // Integrações (com as contas de anúncio dentro) saiu da barra: abre pelo
  // botão "Integrações" do Meu painel.
  { titulo: "Configuração", itens: [
    { key: "fontes", nome: "Fontes de venda", icon: "shopping-bag" },
    { key: "x1", nome: "Marketing X1", icon: "target" },
  ] },
];

const PERIODO_LABEL: Record<string, string> = { hoje: "Hoje", ontem: "Ontem", "7d": "7 dias", "30d": "30 dias", mes: "Este mês", custom: "Personalizado" };

// A Tridify abre em HOJE, não no DEFAULT_PERIOD do app ("Este mês"). Quem cuida
// de tráfego olha a tela pra decidir o que fazer AGORA — gasto de hoje, campanha
// que virou hoje. O mês inteiro dilui o dia e escondia justamente o que importa.
// As outras telas do Gaius (comercial, analytics) continuam no mês de propósito.
const PERIODO_PADRAO: PeriodState = { key: "hoje", from: "", to: "" };

// Nome amigável do tab atual (pro título do topo).
const TAB_META: Record<string, { nome: string; sub: string }> = {
  ...Object.fromEntries(GRUPOS.flatMap((g) => g.itens.map((i) => [i.key, { nome: i.nome, sub: g.titulo }]))),
  integracoes: { nome: "Integrações", sub: "Meu painel" },
};

export function TrafegoClient({ userId, podeGerenciar = false }: { userId: string; podeGerenciar?: boolean }) {
  const [tabRaw, setTab] = useSticky<Tab>("trafego.tab", "painel");
  const tab: Tab = REMOVIDAS.includes(tabRaw as string) ? "painel" : tabRaw;
  const [period, setPeriod] = useState<PeriodState>(PERIODO_PADRAO);
  // Fonte dos dados (contas selecionadas) — persistente por usuário; filtra as
  // views que têm dado por conta (Campanhas Pro). Vazio = todas as contas.
  const [contasSel, setContasSel] = useState<string[]>([]);
  // Personalização segue a conta (ajustes-na-conta.ts): até a conta responder
  // (teto 2,5 s) o conteúdo espera, pra não pintar o layout do aparelho e
  // trocar pelo da conta logo depois. Mudou → `versao` remonta as telas.
  const [versao, setVersao] = useState(0);
  const [sincronizado, setSincronizado] = useState(false);
  useEffect(() => {
    let vivo = true;
    const teto = setTimeout(() => { if (vivo) setSincronizado(true); }, 2500);
    sincronizarComConta(userId).then((mudou) => {
      if (!vivo) return;
      if (mudou) {
        setVersao((v) => v + 1);
        try { const s = localStorage.getItem(`trafego.fontes.sel.${userId}`); setContasSel(s ? JSON.parse(s) : []); } catch { /* */ }
        window.dispatchEvent(new Event("tridify:com-imposto"));
      }
      setSincronizado(true);
    }).catch(() => { if (vivo) setSincronizado(true); });
    return () => { vivo = false; clearTimeout(teto); };
  }, [userId]);
  useEffect(() => { try { const s = localStorage.getItem(`trafego.fontes.sel.${userId}`); if (s) setContasSel(JSON.parse(s)); } catch { /* */ } }, [userId]);
  const mudarContas = (ids: string[]) => { setContasSel(ids); try { tfSet(`trafego.fontes.sel.${userId}`, JSON.stringify(ids)); } catch { /* */ } };
  const analitica = ANALITICAS.includes(tab);
  const { d: dMeta, err, loading, revalidating, sincronizando, atualizando, erroAtualizar, refresh } = useAdsOverview(period, analitica, contasSel);
  // Vendas REAIS (Yampi/ERP) do Meu painel — buscadas EM PARALELO com o Meta
  // (não depois que `d` chega): antes, o Painel personalizável só disparava
  // essa busca ao montar, o que só acontecia DEPOIS do Meta já estar na tela,
  // então os cards do ERP (Faturamento total, Comissão do gestor...) sempre
  // apareciam bem depois dos cards do Meta mesmo quando o ERP responde rápido.
  const [vendasBrutas, setVendas] = useState<VendasSnapshot | null>(null);
  // "Com imposto" × "sem": o panorama do Meta nasce com a fatura crua e o
  // snapshot nasce com imposto — os dois passam pela mesma chave aqui, e toda
  // aba recebe a versão já convertida (lib/trafego-imposto.ts).
  const [comImp, setComImp] = useComImposto();
  const d = useMemo(() => (dMeta && comImp ? comImposto(dMeta, fatorImposto(vendasBrutas)) : dMeta), [dMeta, comImp, vendasBrutas]);
  const vendas = useMemo(() => (vendasBrutas && !comImp ? snapshotSemImposto(vendasBrutas) : vendasBrutas), [vendasBrutas, comImp]);
  const vendasReq = useRef(0);
  /**
   * Busca o snapshot do ERP. `fresh` ignora o cache de 3 min do servidor.
   *
   * É uma função, e não só um efeito, porque o botão "Atualizar" precisa
   * chamá-la. Enquanto ela vivia presa a `[tab, period]`, clicar em Atualizar
   * refazia o panorama do Meta e deixava os cards de DINHEIRO congelados na
   * primeira leitura da sessão — faturamento, lucro e comissão do gestor. Num
   * painel onde metade dos números anda e a outra metade não, o que a pessoa vê
   * é "não atualizou".
   */
  const carregarVendas = useCallback(async (fresh = false) => {
    if (period.key === "custom" && (!period.from || !period.to)) return;
    const meu = ++vendasReq.current;
    try {
      const r = await fetch(`/api/trafego/vendas?${periodQuery(period)}${fresh ? "&fresh=1" : ""}`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (meu === vendasReq.current) setVendas(j?.faturamento === undefined ? null : j);
    } catch {
      if (meu === vendasReq.current) setVendas(null);
    }
  }, [period]);

  useEffect(() => {
    if (tab !== "painel") return;
    void carregarVendas();
  }, [tab, carregarVendas]);
  // Venda nova chega SOZINHA: antes o snapshot era lido uma vez ao abrir a aba
  // e a venda que caía na Yampi só aparecia no Atualizar/recarregar ("tem 1
  // venda a mais na Yampi"). O tick pergunta só a CONTAGEM de pagas do espelho
  // (o webhook grava na hora) e refaz o snapshot quando ela muda. Ritmo com
  // recuo: 30 s com gente mexendo, até 5 min com a aba parada.
  const pagasVistas = useRef<{ chave: string; n: number } | null>(null);
  usePollComRecuo(async () => {
    if (tab !== "painel" || (period.key === "custom" && (!period.from || !period.to))) return;
    const chave = periodQuery(period);
    try {
      const r = await fetch(`/api/trafego/vendas/assinatura?${chave}`, { cache: "no-store" });
      const n = r.ok ? ((await r.json()) as { n: number | null }).n : null;
      if (n == null) return;
      const antes = pagasVistas.current;
      pagasVistas.current = { chave, n };
      if (antes && antes.chave === chave && antes.n !== n) { avisarVendaNova(); await carregarVendas(true); return true; }
    } catch { /* sem rede: o próximo tick tenta de novo */ }
  }, 30_000, 300_000);
  // Gasto manual lançado no widget: o snapshot soma ele no gasto (e no imposto,
  // ROAS, lucro), então relê sem o cache de 3 min.
  useGastoManual(() => { void carregarVendas(true); });

  /**
   * O que o botão "Atualizar" de fato faz: refaz TUDO o que a aba mostra.
   * O `refresh` do hook cuida do panorama do Meta; os cards do ERP vêm de outra
   * rota e precisam ser pedidos junto, senão o botão conserta metade da tela.
   */
  const atualizarTudo = useCallback(async () => {
    // Os widgets com rota própria (Vega, Yampi) não veem nem `refresh` nem
    // `carregarVendas` — o aviso é o que faz eles recarregarem junto.
    avisarAtualizacao();
    pediuAtualizar.current = true;
    await Promise.all([refresh(), carregarVendas(true)]);
  }, [refresh, carregarVendas]);

  // Kinetics 063/072 · Status Pill: o botão passa por ocioso → atualizando →
  // "Atualizado" (check verde) por um instante, e só então volta. Só depois de
  // um CLIQUE: a carga automática ao trocar de período não merece festa.
  // Com erro não há check — o aviso vermelho ao lado é a resposta.
  const pediuAtualizar = useRef(false);
  const [atualizadoOk, setAtualizadoOk] = useState(false);
  const ocupado = loading || atualizando;
  const ocupadoAntes = useRef(ocupado);
  useEffect(() => {
    const terminou = ocupadoAntes.current && !ocupado;
    ocupadoAntes.current = ocupado;
    if (!terminou || !pediuAtualizar.current) return;
    pediuAtualizar.current = false;
    if (erroAtualizar) return;
    setAtualizadoOk(true);
    const t = setTimeout(() => setAtualizadoOk(false), 1600);
    return () => clearTimeout(t);
  }, [ocupado, erroAtualizar]);
  // Sidebar vira drawer em tela estreita (§18). Fecha ao trocar de aba.
  const [sideOpen, setSideOpen] = useState(false);
  useEffect(() => { setSideOpen(false); }, [tab]);

  // Kinetics 005 · Tab Pill Glide: UMA pílula na barra lateral, que desliza até
  // a aba escolhida. Medida por offsetTop/offsetHeight (layout, não o rect com
  // transform) e antes da pintura, pra não nascer um quadro no lugar errado.
  // Até a primeira medida o botão ativo pinta o próprio fundo — sem JS (ou
  // antes da hidratação) a aba atual continua marcada.
  const navRef = useRef<HTMLElement | null>(null);
  const [pilula, setPilula] = useState<{ y: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const medir = () => {
      const alvo = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
      setPilula(alvo ? { y: alvo.offsetTop, h: alvo.offsetHeight } : null);
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [tab, sideOpen]);
  // Dreno do warehouse pra Tridify inteira (um só, compartilhado via módulo).
  const sync = useSyncWarehouse();

  const comPeriodo = COM_PERIODO.includes(tab);
  const meta = TAB_META[tab] ?? { nome: "Tridify", sub: "" };
  // 28px de recuo em cada lado comem 17% de uma tela de 320px — no celular o
  // conteúdo respira com 14 e as tabelas/cartões ganham a largura de volta.
  const celular = useIsMobile();

  // Paleta da sidebar. Ela NÃO tem cor própria: o material é o mesmo `.ws-rail`
  // do TridiChat/TridiFlow/TridiMarket (vem do globals.css, nos dois temas) e o
  // texto vem dos tokens do app. A identidade da Tridify continua na marca, no
  // ícone e no acento — não no chão da navegação, que é estrutura e precisa
  // significar a mesma coisa em toda tela.
  const S = {
    border: "var(--border)",
    label: "var(--text-dim)", text: "var(--text-dim)", textOn: "var(--text)",
    icon: "var(--text-dim)", iconOn: "var(--primary-texto)",
    onBg: "color-mix(in srgb, var(--primary) 12%, transparent)",
    onRing: "inset 0 0 0 1px color-mix(in srgb, var(--primary) 30%, transparent)",
    hover: "color-mix(in srgb, var(--text) 7%, transparent)",
  };

  return (
    <div style={{ display: "flex", height: "100dvh", background: "var(--bg)", overflow: "hidden" }}>
      {/* Overlay do drawer (só aparece ≤820px via CSS, quando aberto). */}
      {sideOpen && <div className="tf-side-overlay" onClick={() => setSideOpen(false)} />}
      {/* ── Sidebar Tridify (própria) ─────────────────────────────────────── */}
      <aside className={`tf-side${sideOpen ? " tf-side-open" : ""}`} style={{ width: 244, flex: "none", background: "var(--surface)", borderRight: `1px solid ${S.border}`, display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "18px 18px 14px" }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, flex: "none", display: "grid", placeItems: "center", background: "linear-gradient(135deg,color-mix(in srgb, var(--primary) 72%, #fff),var(--primary))", boxShadow: "0 6px 16px -6px color-mix(in srgb, var(--primary) 70%, transparent)" }}>
            <Icon name="activity" size={21} color="#fff" />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: S.textOn, letterSpacing: "-0.02em", lineHeight: 1 }}>Tridify</div>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: S.label, marginTop: 2 }}>Tráfego pago · Gaius</div>
          </div>
        </div>

        <nav ref={navRef} className="tf-nav" style={{ flex: 1, overflowY: "auto", padding: "4px 12px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
          {pilula && <span aria-hidden className="tf-nav-pilula" style={{ height: pilula.h, transform: `translateY(${pilula.y}px)` }} />}
          {GRUPOS.map((g) => (
            <div key={g.titulo}>
              <div style={{ fontSize: 10, fontWeight: 800, color: S.label, textTransform: "uppercase", letterSpacing: ".07em", padding: "2px 8px 6px" }}>{g.titulo}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {g.itens.map((t) => {
                  const on = tab === t.key;
                  return (
                    <button key={t.key} onClick={() => setTab(t.key)} className="tf-nav-item" aria-current={on ? "page" : undefined}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", minHeight: "var(--tap)", borderRadius: 10, border: "none", cursor: "pointer", width: "100%", textAlign: "left",
                        // Com a pílula medida, é ELA que pinta o fundo da aba ativa.
                        background: on && !pilula ? S.onBg : "transparent", boxShadow: on && !pilula ? S.onRing : "none", color: on ? S.textOn : S.text, fontSize: 13, fontWeight: on ? 700 : 600 }}>
                      <Icon name={t.icon} size={16} color={on ? S.iconOn : S.icon} /> {t.nome}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div style={{ padding: 12, borderTop: `1px solid ${S.border}` }}>
          <Link href="/central" style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", borderRadius: 10, textDecoration: "none", color: S.text, fontSize: 12.5, fontWeight: 700, border: `1px solid ${S.border}` }}>
            <Icon name="logout" size={15} color={S.icon} /> Voltar ao Gaius
          </Link>
        </div>
      </aside>

      {/* ── Conteúdo ──────────────────────────────────────────────────────── */}
      <ComandoRapido d={d} onNavigate={(t) => setTab(t as Tab)} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Topbar */}
        <header style={{ position: "relative", display: "flex", alignItems: "center", gap: 14, padding: celular ? "12px 14px" : "16px 28px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <BotaoIcone className="tf-hamburger" icone="menu-2" titulo="Abrir menu" variante="secundario" onClick={() => setSideOpen(true)}
            style={{ flex: "none" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)", lineHeight: 1.15 }}>{meta.nome}</div>
            {meta.sub && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Tridify · {meta.sub}</div>}
          </div>
          {/* Evento próprio, não um ⌘K forjado: o KeyboardEvent sintético era
              ouvido também pela paleta global do app e abria as duas janelas. */}
          <Botao variante="secundario" icone="search" onClick={() => window.dispatchEvent(new Event("tridify:busca"))}
            title="Busca rápida (⌘K)">
            Buscar ou comandar
            {/* Atalho de teclado não serve a quem não tem teclado — e come a
                largura útil justamente na tela estreita. Mesma regra da busca
                da sidebar e do rodapé da paleta de comandos. */}
            <Tecla mods={["command"]}>K</Tecla>
          </Botao>
          {comPeriodo && (
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <FonteSelector userId={userId} value={contasSel} onChange={mudarContas} />
              <VisualizacoesSalvas userId={userId} period={period} contas={contasSel} onApply={(p, c) => { setPeriod(p); mudarContas(c); }} />
              <PeriodPicker value={period} onChange={setPeriod} />
              {analitica && <Interruptor ligado={comImp} onChange={setComImp} rotulo="Com imposto"
                titulo="Mostrar gasto, CPA, CPM, CPC e ROAS com o imposto de importação da fatura do Meta" />}
              {analitica && <>
                {/* Desabilita só enquanto a carga cheia ou o próprio clique
                    estão em voo. A revalidação de fundo NÃO trava o botão: foi
                    ela, pendurada, que já o deixou "Atualizando…" pra sempre. */}
                <button onClick={atualizarTudo} disabled={ocupado} title="Recalcula agora com os dados da Meta e sincroniza as campanhas em segundo plano"
                  className="tf-atualizar ui-toque" data-estado={ocupado ? "carregando" : atualizadoOk ? "ok" : "ocioso"} aria-live="polite"
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 13px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12.5, fontWeight: 700, cursor: ocupado ? "default" : "pointer", color: "var(--text)", opacity: ocupado ? 0.65 : 1 }}>
                  <span className={ocupado || revalidating ? "spin" : ""} style={{ display: "inline-flex" }}>
                    <TrocaIcone ligado={atualizadoOk && !ocupado} a="refresh" b="check" size={14} corA="currentColor" corB="currentColor" />
                  </span>
                  <span key={ocupado ? "c" : atualizadoOk ? "k" : "o"} className="tf-rotulo">{ocupado ? "Atualizando…" : atualizadoOk ? "Atualizado" : "Atualizar"}</span>
                </button>
                {d && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{d.contasAtivas} conta(s) · {d.periodLabel}{d.updatedAt ? <> · <AtualizadoHa iso={d.updatedAt} /></> : null}</span>}
                {/* O que deu errado fica ESCRITO ao lado do botão: antes o erro
                    do "Atualizar" era engolido quando já havia dado na tela, e
                    a pessoa via um spinner de 60 s terminar em nada. */}
                {erroAtualizar && (
                  <span role="alert" className="tf-aviso" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--perigo)", maxWidth: 360, minWidth: 0 }}>
                    <Icon name="alert-triangle" size={13} color="var(--perigo)" /> {erroAtualizar}
                  </span>
                )}
              </>}

              {/* Aviso do sync de fundo. Fica FORA do `analitica` de propósito:
                  o warehouse alimenta a Tridify inteira, então o aviso vale em
                  qualquer aba. Não bloqueia nada — a tela já está renderizada. */}
              <SyncStatus rodando={sync.rodando} restantes={sync.restantes} />
            </div>
          )}
          {/* Kinetics 076/100 · stale-while-revalidate: o número velho continua
              na tela e esta faixa fina diz que o novo vem vindo. */}
          <span aria-hidden className="tf-revalida" data-on={analitica && d && (revalidating || atualizando) ? "1" : "0"} />
        </header>

        {/* Chips de filtro ATIVO (§8): resumem o estado corrente e cada um remove
            o seu. Só aparece quando há filtro diferente do padrão — sem poluir. */}
        {comPeriodo && (contasSel.length > 0 || period.key !== PERIODO_PADRAO.key) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: celular ? "9px 14px" : "9px 28px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em" }}>Filtros</span>
            {period.key !== PERIODO_PADRAO.key && (
              <FilterChip label="Período" valor={PERIODO_LABEL[period.key] ?? (period.key === "custom" ? `${period.from}–${period.to}` : period.key)} onClear={() => setPeriod(PERIODO_PADRAO)} />
            )}
            {contasSel.length > 0 && (
              <FilterChip label="Contas" valor={`${contasSel.length} selecionada(s)`} onClear={() => mudarContas([])} />
            )}
            <button onClick={() => { setPeriod(PERIODO_PADRAO); mudarContas([]); }}
              style={{ marginLeft: 4, background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: 12, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>
              Limpar todos
            </button>
          </div>
        )}

        {/* Área rolável */}
        {/* Abas densas (tabelas largas) usam a tela TODA e padding lateral menor
            pra caber mais colunas; as demais ficam legíveis num maxWidth de leitura. */}
        {(() => { const largo = tab === "campanhas" || tab === "painel" || tab === "anuncios"; return (
        <div key={versao} style={{ flex: 1, overflowY: "auto", padding: celular ? (largo ? "16px 10px 40px" : "18px 14px 40px") : (largo ? "20px 16px 40px" : "22px 28px 40px"), maxWidth: largo ? "100%" : 1360, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          {tab === "fontes" && <FontesView period={period} />}
          {tab === "regras" && <RegrasView period={period} />}
          {tab === "relatorios" && <RelatoriosView period={period} />}
          {tab === "integracoes" && <IntegracoesCentral onNavigate={(t) => setTab(t as Tab)} />}
          {tab === "rastreamento" && <RastreamentoTrack />}
          {tab === "x1" && <MarketingX1 />}

          {analitica && (
            (loading || sincronizando) && !d ? <CarregandoAds sincronizando={sincronizando} /> :
            !d ? <SemAds err={err} /> :
            <div>
              {tab === "painel" && sincronizado && <div className="tf-scope"><div style={{ marginBottom: 14 }}><PrevisaoFaturamento id="tf-previsao" /></div><PainelPersonalizavel d={d} userId={userId} period={period} vendasPreview={vendas} onIntegracoes={() => setTab("integracoes")} /></div>}
              {tab === "funil" && sincronizado && <div className="tf-scope"><FunilPro d={d} userId={userId} period={period} /></div>}
              {tab === "campanhas" && sincronizado && <div className="tf-scope"><CampanhasPro d={d} userId={userId} contas={contasSel} podeGerenciar={podeGerenciar} /></div>}
              {tab === "anuncios" && <div className="tf-scope"><CriativosStudio d={d} /></div>}
              {tab === "criativos" && <CriativosView d={d} />}
              {tab === "tags" && <TagsView d={d} />}
            </div>
          )}
        </div>
        ); })()}
      </div>
    </div>
  );
}

// "atualizado há X min" — reconta sozinho a cada minuto enquanto a página fica aberta.
function AtualizadoHa({ iso }: { iso: string }) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 60_000); return () => clearInterval(id); }, []);
  return <>atualizado {agoLabel(iso)}</>;
}
function agoLabel(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return "agora mesmo";
  const m = Math.floor(s / 60);
  if (m < 1) return "há menos de 1 min";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}
