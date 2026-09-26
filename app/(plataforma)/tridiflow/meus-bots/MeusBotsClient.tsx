"use client";

// Meus Bots — gerenciador completo: pastas, filtros (status/domínio), busca,
// ordenação, grade/lista, paginação e ações por card. Reusa /api/tridiflow/bots.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "../../Icon";
import { useIsEstreito } from "../../ui/useMediaQuery";
import { confirmar, toast } from "../../Toast";
import { FUNIL_TEMPLATES } from "@/lib/tridiflow-templates";
import { TEMPLATES_PAGINA } from "@/lib/tridiflow-pagina-templates";
import { QUIZ_TEMPLATES } from "@/lib/tridiflow-quiz-templates";
import { TIPOS_PAGINA, tipoPaginaPorId } from "@/lib/tridiflow-pagina-tipos";
import type { Miniatura } from "@/lib/tridiflow-pagina-miniatura";
import { GlassSelect } from "../../GlassPicker";
import { exportarProjeto } from "../_shared/transfer-cliente";
import { TrocaIcone } from "../../ui/micro";
import { Dropdown, type PropsDoGatilho } from "../../ui/Dropdown";
import { Botao, BotaoIcone } from "../../ui/controles";

type AbaLista = "flow" | "quiz" | "page" | "iframe" | "linktridi" | "rascunho" | "publicado" | "arquivado";
interface Stats { sessoes: number; concluidas: number; leads: number }
interface StatsPagina { visualizacoes: number; cliques: number; conversoes: number }
type TipoProjeto = "flow" | "quiz" | "page" | "iframe" | "linktridi";
interface Bot {
  id: string; nome: string; slug: string; dominioId: string | null; dominioHost: string | null;
  status: "rascunho" | "publicado"; pasta: string | null; updatedAt: string; publishedAt: string | null;
  tipo?: TipoProjeto; arquivado?: boolean; templatePagina?: string;
  miniatura?: Miniatura;                       // só página
  responsavel?: { id: string; nome: string };  // quem mexeu por último
  capa?: { corHeader: string; corFundo: string; corBolhaUser: string };
  stats?: Stats;
}
interface Dominio { id: string; host: string; verificado: boolean }

const DOMINIO_PADRAO = "gedux.com.br";
const PER_PAGE = 12;
// Fluxo e quiz moram em /f/<slug>; página em /p/<slug>. Os três dividem o mesmo
// cadastro de domínio e o mesmo espaço de nomes de caminho.
//
// O quiz tem EDITOR próprio mas não endereço público próprio: quem responde vê
// um funil publicado em /f/ igual ao chat, com os mesmos pixels e o mesmo
// destino de lead. Separar o player criaria dois caminhos pro mesmo lead.
const ehPagina = (b: Bot) => b.tipo === "page";
const linkDe = (b: Bot) => `https://${b.dominioHost || DOMINIO_PADRAO}/${ehPagina(b) ? "p" : "f"}/${b.slug}`;
// A Central de Tutoriais é uma página por baixo, mas tem editor próprio: aberta
// no editor de páginas ela aparecia vazia (sem seções) e um auto-save ali
// gravaria por cima do documento dos tutoriais.
const editorDe = (b: Bot) =>
  b.tipo === "page" && b.templatePagina === "central_tutoriais" ? `/marketing/tutoriais/${b.id}` :
  b.tipo === "page" ? `/tridiflow/p/${b.id}` : b.tipo === "quiz" ? `/tridiflow/q/${b.id}` : b.tipo === "linktridi" ? `/marketing/linktridi/${b.id}` : `/tridiflow/${b.id}`;
const taxaDe = (s?: Stats) => (s && s.sessoes > 0 ? Math.round((s.concluidas / s.sessoes) * 100) : null);
const corTaxa = (t: number | null) => (t == null ? "var(--text-dim)" : t >= 40 ? "var(--ok)" : t >= 25 ? "var(--atencao)" : "var(--perigo)");
const fmt = (n: number) => n.toLocaleString("pt-BR");
const fmtData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

// Cor do glifo sobre o ícone da marca: branco em fundo escuro, quase-preto em
// fundo claro (senão o símbolo some em temas claros — amarelo, rosa-claro, etc.).
function corGlifo(hex: string): string {
  const h = (hex || "").replace("#", "").trim();
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (n.length < 6) return "#fff";
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return "#fff";
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);   // luminância perceptual
  return L > 0.55 ? "#1c1c1e" : "#ffffff";
}

// ── Miniatura da página ──────────────────────────────────────────────────────
// Silhueta desenhada a partir do esqueleto que o servidor manda (ver
// lib/tridiflow-pagina-miniatura.ts). Não é um print: é o suficiente pra bater o
// olho e saber qual página é ("a que abre com vídeo e tem formulário no fim"),
// nas cores da própria página. Sem screenshot, sem cache pra ficar velho.
function MiniaturaPagina({ mini, tamanho, raio }: { mini: Miniatura; tamanho: number; raio: number }) {
  const u = tamanho / 52;                                  // tudo abaixo é medido no tile de 52px
  const tinta = corGlifo(mini.corFundo);                   // escuro em página clara, claro em escura
  const cor = (a: number) => `color-mix(in srgb, ${tinta} ${Math.round(a * 100)}%, transparent)`;
  const barra = (largura: string, altura: number, opacidade: number, r = 1) =>
    ({ width: largura, height: Math.max(1, altura * u), borderRadius: r * u, background: cor(opacidade), flex: "none" as const });

  const traco = (t: Miniatura["tracos"][number], i: number) => {
    const k = `t${i}`;
    switch (t) {
      case "titulo": return <div key={k} style={barra("74%", 3.5, 0.8, 1.5)} />;
      case "texto": return <div key={k} style={{ display: "grid", gap: 1.5 * u, width: "100%" }}>
        <div style={barra("100%", 1.8, 0.3)} /><div style={barra("64%", 1.8, 0.3)} /></div>;
      case "midia": return <div key={k} style={{ ...barra("100%", 13, 0.16, 2), display: "grid", placeItems: "center" }}>
        <div style={{ width: 0, height: 0, borderLeft: `${3 * u}px solid ${cor(0.45)}`, borderTop: `${2 * u}px solid transparent`, borderBottom: `${2 * u}px solid transparent` }} /></div>;
      case "acao": return <div key={k} style={{ width: "60%", height: Math.max(2, 5 * u), borderRadius: 99, background: mini.corPrimaria, flex: "none" }} />;
      case "campos": return <div key={k} style={{ display: "grid", gap: 1.5 * u, width: "100%" }}>
        <div style={barra("100%", 4, 0.12, 1.5)} /><div style={barra("100%", 4, 0.12, 1.5)} /></div>;
      case "lista": return <div key={k} style={{ display: "grid", gap: 1.5 * u, width: "100%" }}>
        {["86%", "72%", "80%"].map((w, j) => <div key={j} style={barra(w, 1.8, 0.26)} />)}</div>;
      case "faixa": return <div key={k} style={{ width: "100%", height: Math.max(1, 3 * u), borderRadius: 1 * u,
        background: `color-mix(in srgb, ${mini.corPrimaria} 34%, transparent)`, flex: "none" }} />;
      default: return <div key={k} style={{ height: Math.max(1, 3 * u), flex: "none" }} />;
    }
  };

  return (
    <div aria-hidden style={{
      width: tamanho, height: tamanho, borderRadius: raio, flex: "none", overflow: "hidden",
      background: mini.corFundo, border: "1px solid var(--border)",
      padding: `${4 * u}px ${5 * u}px`, display: "flex", flexDirection: "column", gap: 2.5 * u, alignItems: "center",
    }}>
      {mini.tracos.map(traco)}
    </div>
  );
}

export function MeusBotsClient({ podeLinkTridi = true }: { podeLinkTridi?: boolean }) {
  const [bots, setBots] = useState<Bot[] | null>(null);
  const [dominios, setDominios] = useState<Dominio[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [busy, setBusy] = useState(false);
  const [pastaSel, setPastaSel] = useState<string | null>(null);   // null = todas
  const [fStatus, setFStatus] = useState<"" | "publicado" | "rascunho">("");
  const [fDominio, setFDominio] = useState<string>("");            // "" = todos, "__padrao" = sem domínio
  const [ordenar, setOrdenar] = useState<"recentes" | "sessoes" | "nome" | "visualizacoes" | "conversao">("recentes");
  // Tipo de página (vsl/captura/venda/obrigado/branco) — vazio = todas.
  const [fTemplate, setFTemplate] = useState("");
  const [view, setView] = useState<"grade" | "lista">("grade");
  const [page, setPage] = useState(1);
  const [movendo, setMovendo] = useState<Bot | null>(null);   // modal "mover para pasta"
  // Abas do topo: o TridiFlow agora tem dois tipos de projeto. A aba vem da URL
  // (?tipo=page) para o menu lateral conseguir apontar direto pra ela e o link
  // ser compartilhável — e volta pra URL quando o usuário troca de aba.
  const tipoDaUrl = useSearchParams().get("tipo");
  const abaValida = (v: string | null): v is AbaLista =>
    v === "flow" || v === "quiz" || v === "page" || v === "linktridi" || v === "rascunho" || v === "publicado" || v === "arquivado";
  const [fTipo, setFTipo] = useState<AbaLista | "">(abaValida(tipoDaUrl) ? tipoDaUrl : "");
  // Clicar em "Páginas" no menu com a tela já aberta só muda a query: o
  // componente não remonta, então o estado precisa acompanhar.
  useEffect(() => { setFTipo(abaValida(tipoDaUrl) ? tipoDaUrl : ""); }, [tipoDaUrl]);

  const trocarAba = (v: AbaLista | "") => {
    setFTipo(v);
    const url = v ? `/tridiflow/meus-bots?tipo=${v}` : "/tridiflow/meus-bots";
    window.history.replaceState(null, "", url);
  };
  const [renomeando, setRenomeando] = useState<Bot | null>(null);
  const [statsPag, setStatsPag] = useState<Record<string, StatsPagina>>({});
  const [criando, setCriando] = useState(false);   // "o que você deseja criar?"

  const load = useCallback(() => {
    fetch("/api/tridiflow/bots", { cache: "no-store" }).then((r) => r.json())
      .then((d) => {
        if (d.error) setErro(d.error);
        // LinkTridi e Central de Tutoriais moram no Marketing · Geral (aba
        // Páginas): a lista do TridiFlow não os mostra.
        else { setBots(((d.bots ?? []) as Bot[]).filter((b) => b.tipo !== "linktridi" && b.templatePagina !== "central_tutoriais")); setStatsPag(d.statsPaginas ?? {}); }
      })
      .catch(() => setErro("Sem conexão."));
    fetch("/api/tridiflow/dominios", { cache: "no-store" }).then((r) => r.json())
      .then((d) => setDominios(d.dominios ?? [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function criar(template?: string, tipo: TipoProjeto = "flow") {
    if (tipo === "linktridi" && semLT({ tipo: "linktridi" } as Bot)) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { tipo };
      if (template) body.template = template;
      else body.nome = tipo === "page" ? "Nova página" : tipo === "quiz" ? "Novo quiz" : tipo === "iframe" ? "Novo iframe" : tipo === "linktridi" ? "Meu LinkTridi" : "Novo bot";
      const r = await fetch("/api/tridiflow/bots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { toast.erro(d.error || "Falha ao criar."); return; }
      window.location.href = editorDe(d.bot as Bot);
    } finally { setBusy(false); }
  }
  // Escrita em LinkTridi tem chave própria (`tridiflow:linktridi`): a API
  // recusa com 403, então a tela avisa antes em vez de deixar a pessoa
  // descobrir por um "Falha." genérico. Todas as ações passam por aqui —
  // guardar handler por handler é o que evita esquecer uma no menu do card.
  const semLT = (b?: Bot | null) => {
    if (podeLinkTridi || (b?.tipo ?? "flow") !== "linktridi") return false;
    toast.erro("Você não tem permissão para editar o LinkTridi.");
    return true;
  };
  const botDe = (id: string) => (bots ?? []).find((x) => x.id === id) ?? null;

  async function acao(id: string, acao: "duplicar" | "publicar" | "despublicar") {
    if (semLT(botDe(id))) return;
    setBusy(true);
    try {
      const r = await fetch("/api/tridiflow/bots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao, id }) });
      const d = await r.json();
      if (!r.ok) { toast.erro(d.error || "Falha."); return; }
      toast.ok(acao === "publicar" ? "Publicado! Link ativo." : acao === "despublicar" ? "Despublicado." : "Duplicado.");
      load();
    } finally { setBusy(false); }
  }
  async function excluir(b: Bot) {
    if (semLT(b)) return;
    const oQue = ehPagina(b) ? "a página" : "o bot";
    const detalhe = ehPagina(b)
      ? "Blocos, publicação e métricas coletadas serão apagados. Não dá pra desfazer — para só tirar da lista, use Arquivar."
      : "Fluxo, tema e sessões coletadas serão apagados. Não dá pra desfazer — para só tirar da lista, use Arquivar.";
    if (!(await confirmar(`Excluir ${oQue} "${b.nome}"?`, { detalhe, perigo: true }))) return;
    await fetch(`/api/tridiflow/bots?id=${b.id}`, { method: "DELETE" });
    load();
  }
  function abrirMover(b: Bot) { setMovendo(b); }
  function abrirRenome(b: Bot) { setRenomeando(b); }

  async function renomear(b: Bot, nome: string) {
    setRenomeando(null);
    if (semLT(b)) return;
    const limpo = nome.trim();
    if (!limpo || limpo === b.nome) return;
    await fetch("/api/tridiflow/bots", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, nome: limpo }) });
    toast.ok("Nome atualizado.");
    load();
  }

  // Arquivar tira da lista sem excluir. Não despublica: um link no ar continua
  // no ar — arquivar é organização, não desativação. O aviso deixa isso claro.
  async function arquivar(b: Bot, valor: boolean) {
    if (semLT(b)) return;
    if (valor && b.status === "publicado") {
      const ok = await confirmar(`Arquivar "${b.nome}"?`, {
        detalhe: "Ele sai da lista, mas continua PUBLICADO e acessível pelo link. Para tirar do ar, use Despublicar.",
      });
      if (!ok) return;
    }
    const r = await fetch("/api/tridiflow/bots", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, arquivado: valor }) });
    if (!r.ok) { toast.erro("Não foi possível arquivar."); return; }
    toast.ok(valor ? "Arquivado." : "Restaurado.");
    load();
  }
  async function aplicarPasta(b: Bot, pasta: string | null) {
    setMovendo(null);
    if (semLT(b)) return;
    await fetch("/api/tridiflow/bots", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, pasta }) });
    toast.ok(pasta ? `Movido para “${pasta}”.` : "Removido da pasta.");
    load();
  }

  const pastas = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bots ?? []) if (b.pasta) m.set(b.pasta, (m.get(b.pasta) ?? 0) + 1);
    return [...m.entries()].map(([nome, n]) => ({ nome, n })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [bots]);

  const filtrados = useMemo(() => {
    let l = bots ?? [];
    const q = busca.trim().toLowerCase();
    if (q) l = l.filter((b) => b.nome.toLowerCase().includes(q) || b.slug.includes(q) || (b.dominioHost ?? "").includes(q));
    if (pastaSel) l = l.filter((b) => b.pasta === pastaSel);
    if (fStatus) l = l.filter((b) => b.status === fStatus);
    // Aba do topo: tipo de projeto OU situação — as entradas pedidas
    // (Todos · Fluxos · Quizzes · Páginas · Rascunhos · Publicados) num controle só.
    // Arquivado NÃO aparece em nenhuma aba além da própria: é o sentido de arquivar.
    if (fTipo === "arquivado") l = l.filter((b) => b.arquivado);
    else {
      l = l.filter((b) => !b.arquivado);
      if (fTipo === "flow" || fTipo === "quiz" || fTipo === "page" || fTipo === "iframe" || fTipo === "linktridi") l = l.filter((b) => (b.tipo ?? "flow") === fTipo);
      else if (fTipo === "rascunho" || fTipo === "publicado") l = l.filter((b) => b.status === fTipo);
    }
    if (fDominio === "__padrao") l = l.filter((b) => !b.dominioId);
    else if (fDominio) l = l.filter((b) => b.dominioId === fDominio);
    // Filtro por TIPO DE PÁGINA — só existe na aba Páginas. Fluxo nunca passa
    // por aqui, então o comportamento da lista de fluxos é o mesmo de antes.
    if (fTipo === "page" && fTemplate) l = l.filter((b) => (b.templatePagina ?? "") === fTemplate);
    return [...l].sort((a, b) =>
      ordenar === "nome" ? a.nome.localeCompare(b.nome)
      : ordenar === "sessoes" ? (b.stats?.sessoes ?? 0) - (a.stats?.sessoes ?? 0)
      // Ordenações de PÁGINA: usam os números da própria página.
      : ordenar === "visualizacoes" ? (statsPag[b.id]?.visualizacoes ?? 0) - (statsPag[a.id]?.visualizacoes ?? 0)
      : ordenar === "conversao" ? (statsPag[b.id]?.conversoes ?? 0) - (statsPag[a.id]?.conversoes ?? 0)
      : +new Date(b.updatedAt) - +new Date(a.updatedAt));
  }, [bots, busca, pastaSel, fStatus, fTipo, fDominio, fTemplate, ordenar, statsPag]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PER_PAGE));
  const pageClamped = Math.min(page, totalPages);
  const pageItens = filtrados.slice((pageClamped - 1) * PER_PAGE, pageClamped * PER_PAGE);
  useEffect(() => { setPage(1); }, [busca, pastaSel, fStatus, fTipo, fDominio, fTemplate, ordenar]);
  // Sair da aba Páginas limpa o filtro de tipo e a ordenação que só existe lá —
  // senão a lista de fluxos ficaria filtrada por algo invisível.
  useEffect(() => {
    if (fTipo !== "page") {
      setFTemplate("");
      setOrdenar((o) => (o === "visualizacoes" || o === "conversao" ? "recentes" : o));
    }
  }, [fTipo]);

  const ativos = (bots ?? []).filter((b) => !b.arquivado);
  const contarTipo = (t: TipoProjeto) => ativos.filter((b) => (b.tipo ?? "flow") === t).length;
  const contarStatus = (s: "rascunho" | "publicado") => ativos.filter((b) => b.status === s).length;
  const nArquivados = (bots ?? []).filter((b) => b.arquivado).length;
  const ABAS: { chave: typeof fTipo; label: string; n: number }[] = [
    { chave: "", label: "Todos", n: ativos.length },
    { chave: "flow", label: "Fluxos", n: contarTipo("flow") },
    { chave: "quiz", label: "Quizzes", n: contarTipo("quiz") },
    { chave: "page", label: "Páginas", n: contarTipo("page") },
    // Iframes só ganham aba quando existe algum — projeto raro não vira ruído fixo.
    ...(contarTipo("iframe") ? [{ chave: "iframe" as const, label: "Iframes", n: contarTipo("iframe") }] : []),
    { chave: "rascunho", label: "Rascunhos", n: contarStatus("rascunho") },
    { chave: "publicado", label: "Publicados", n: contarStatus("publicado") },
    // A aba de arquivados só existe quando há o que mostrar — senão é ruído.
    ...(nArquivados ? [{ chave: "arquivado" as const, label: "Arquivados", n: nArquivados }] : []),
  ];

  const filtrosAtivos = (fStatus ? 1 : 0) + (fDominio ? 1 : 0) + (pastaSel ? 1 : 0);
  const limpar = () => { setFStatus(""); setFDominio(""); setPastaSel(null); setBusca(""); };

  // Abaixo de 900px o rail de pastas (210px fixos) comeria 2/3 da tela: vira
  // uma fileira de chips que rola de lado, acima do conteúdo.
  const estreito = useIsEstreito();
  const abasRef = useRef<HTMLDivElement>(null);
  // Aba ativa sempre à vista quando a fileira rola de lado.
  useEffect(() => {
    abasRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [fTipo]);

  return (
    <div style={{ maxWidth: 1240 }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: "clamp(22px, 6vw, 32px)", fontWeight: 800, letterSpacing: "-0.02em" }}>Projetos</h1>
          <p style={{ color: "var(--text-dim)", marginTop: 4, fontSize: 14 }}>Fluxos conversacionais e páginas, no mesmo lugar.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", width: 260 }}>
            <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", display: "flex" }}><Icon name="search" size={15} color="var(--text-dim)" /></span>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, domínio ou slug…"
              style={{ width: "100%", boxSizing: "border-box", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 11, padding: "10px 12px 10px 34px", color: "var(--text)", fontSize: 13.5, outline: "none" }} />
          </div>
          <Botao variante="primario" icone="plus" onClick={() => setCriando(true)} disabled={busy}>
            Criar
          </Botao>
        </div>
      </div>

      {/* Abas: Todos · Fluxos · Páginas · Rascunhos · Publicados */}
      <div ref={abasRef} className="tab-strip" style={{ display: "flex", gap: 4, marginBottom: 16, padding: 0, width: "100%" }}>
        {ABAS.map((a) => {
          const ativo = fTipo === a.chave;
          return (
            <button key={a.chave || "todos"} onClick={() => trocarAba(a.chave)} aria-current={ativo ? "page" : undefined}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 10,
                border: `1px solid ${ativo ? "transparent" : "var(--border)"}`, cursor: "pointer",
                background: ativo ? "var(--primary)" : "var(--surface)",
                color: ativo ? "#fff" : "var(--text-dim)", fontSize: 13, fontWeight: 700,
              }}>
              {a.label}
              <span style={{
                fontSize: 11, fontWeight: 800, padding: "1px 7px", borderRadius: 999,
                background: ativo ? "rgba(255,255,255,.22)" : "var(--surface-2)",
                color: ativo ? "#fff" : "var(--text-dim)",
              }}>{a.n}</span>
            </button>
          );
        })}
      </div>

      {/* Em coluna o alinhamento precisa ser stretch: com flex-start os filhos
          encolheriam pra largura do conteúdo em vez de ocupar a linha. */}
      <div style={{ display: "flex", gap: 18, alignItems: estreito ? "stretch" : "flex-start", flexDirection: estreito ? "column" : "row" }}>
        {/* Rail de pastas — coluna no computador, chips que rolam de lado no celular */}
        {estreito ? (
          pastas.length > 0 && (
            <div className="tab-strip" style={{ display: "flex", gap: 6, padding: 0, width: "100%" }}>
              <FolderItem label="Todas" n={bots?.length ?? 0} ativo={pastaSel === null} onClick={() => setPastaSel(null)} icone="layout-grid" chip />
              {pastas.map((p) => (
                <FolderItem key={p.nome} label={p.nome} n={p.n} ativo={pastaSel === p.nome} onClick={() => setPastaSel(p.nome)} icone="folder" chip />
              ))}
            </div>
          )
        ) : (
          <aside style={{ width: 210, flex: "none" }} className="glass" >
            <div style={{ padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em" }}>Pastas</span>
              </div>
              <FolderItem label="Todos os projetos" n={bots?.length ?? 0} ativo={pastaSel === null} onClick={() => setPastaSel(null)} icone="layout-grid" />
              {pastas.map((p) => (
                <FolderItem key={p.nome} label={p.nome} n={p.n} ativo={pastaSel === p.nome} onClick={() => setPastaSel(p.nome)} icone="folder" />
              ))}
              {pastas.length === 0 && <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "8px 2px 0", lineHeight: 1.4 }}>Crie pastas movendo um projeto (menu <strong>Mais → Mover para pasta</strong>).</p>}
            </div>
          </aside>
        )}

        {/* Conteúdo — em coluna `flex:1` teria base 0 na vertical; `none` deixa
            a altura vir do conteúdo e a largura vem do stretch. */}
        <div style={{ flex: estreito ? "none" : 1, minWidth: 0 }}>
          {/* Barra de filtros */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <Select value={fStatus} onChange={(v) => setFStatus(v as typeof fStatus)} opts={[["", "Status: todos"], ["publicado", "Publicados"], ["rascunho", "Rascunhos"]]} />
            <Select value={fDominio} onChange={setFDominio} opts={[["", "Domínio: todos"], ["__padrao", "Domínio padrão"], ...dominios.map((d) => [d.id, d.host] as [string, string])]} />
            {/* Tipo de página: só na aba Páginas — a lista de fluxos nem vê. */}
            {fTipo === "page" && (
              <Select value={fTemplate} onChange={setFTemplate}
                opts={[["", "Tipo: todos"], ...TIPOS_PAGINA.map((t) => [t.id, t.label] as [string, string])]} />
            )}
            {filtrosAtivos > 0 && <Botao variante="sutil" tamanho="sm" onClick={limpar}>Limpar filtros</Botao>}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{filtrados.length} {filtrados.length === 1 ? "projeto" : "projetos"}</span>
              {/* Página ordena pelos números DELA (visualizações/conversões);
                  fluxo continua com starts, exatamente como era. */}
              <Select value={ordenar} onChange={(v) => setOrdenar(v as typeof ordenar)}
                opts={fTipo === "page"
                  ? [["recentes", "Mais recentes"], ["visualizacoes", "Mais visualizações"], ["conversao", "Mais conversões"], ["nome", "Nome (A-Z)"]]
                  : [["recentes", "Mais recentes"], ["sessoes", "Mais starts"], ["nome", "Nome (A-Z)"]]} />
              <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                {(["grade", "lista"] as const).map((v) => (
                  <button key={v} onClick={() => setView(v)} title={v === "grade" ? "Grade" : "Lista"}
                    style={{ padding: "8px 10px", border: "none", cursor: "pointer", background: view === v ? "var(--primary)" : "var(--surface)", display: "flex" }}>
                    <Icon name={v === "grade" ? "layout-grid" : "menu-2"} size={16} color={view === v ? "#fff" : "var(--text-dim)"} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {erro && <div className="glass" style={{ padding: 22, borderRadius: 16, color: "var(--text-dim)" }}>{erro}</div>}
          {!bots && !erro && <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Carregando…</p>}
          {bots && filtrados.length === 0 && !erro && (
            // O vazio muda com a aba: quem clicou em "Páginas" e não tem
            // nenhuma precisa do caminho pra criar UMA PÁGINA ali mesmo — mandar
            // "crie seu primeiro bot" seria o texto errado na hora errada.
            (() => {
              const soPaginas = fTipo === "page";
              const soFluxos = fTipo === "flow";
              const vazioDeVerdade = (bots ?? []).filter((b) => !b.arquivado)
                .filter((b) => (soPaginas ? b.tipo === "page" : soFluxos ? (b.tipo ?? "flow") === "flow" : true)).length === 0;
              const titulo = !vazioDeVerdade ? "Nada com esses filtros"
                : soPaginas ? "Crie sua primeira página"
                : soFluxos ? "Crie seu primeiro fluxo"
                : "Crie seu primeiro projeto";
              const texto = !vazioDeVerdade ? "Ajuste a busca ou os filtros."
                : soPaginas ? "Escolha um modelo (VSL, captura, obrigado) e publique no seu domínio."
                : soFluxos ? "Monte a conversa, teste no preview e publique o link."
                : "Um fluxo conversacional ou uma landing page — os dois moram aqui.";
              return (
                <div className="glass" style={{ padding: 40, borderRadius: 18, textAlign: "center" }}>
                  <TrocaIcone ligado={soPaginas} a="message-chatbot" b="file-text" size={36} corA="var(--primary-texto)" corB="var(--primary-texto)" />
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 10 }}>{titulo}</div>
                  <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "6px 0 14px" }}>{texto}</p>
                  {vazioDeVerdade && (
                    <Botao variante="primario" onClick={() => setCriando(true)}>
                      {soPaginas ? "Criar página" : soFluxos ? "Criar fluxo" : "Criar"}
                    </Botao>
                  )}
                </div>
              );
            })()
          )}

          {/* Grade */}
          {view === "grade" && pageItens.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 14 }}>
              {pageItens.map((b) => <CardBot key={b.id} b={b} statsPagina={statsPag[b.id]} onAcao={acao} onExcluir={excluir} onMover={abrirMover} onRenomear={abrirRenome} onArquivar={arquivar} />)}
            </div>
          )}
          {/* Lista */}
          {view === "lista" && pageItens.length > 0 && (
            <div className="glass" style={{ borderRadius: 16, overflow: "hidden" }}>
              {pageItens.map((b, i) => <LinhaBot key={b.id} b={b} primeiro={i === 0} statsPagina={statsPag[b.id]} onAcao={acao} onExcluir={excluir} onMover={abrirMover} onRenomear={abrirRenome} onArquivar={arquivar} />)}
            </div>
          )}

          {/* Paginação */}
          {filtrados.length > PER_PAGE && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, flexWrap: "wrap", gap: 10 }}>
              <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
                Mostrando {(pageClamped - 1) * PER_PAGE + 1}–{Math.min(pageClamped * PER_PAGE, filtrados.length)} de {filtrados.length}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <PgBtn icone="chevron-left" titulo="Página anterior" onClick={() => setPage((p) => Math.max(1, p - 1))} desab={pageClamped <= 1} />
                {Array.from({ length: totalPages }, (_, i) => i + 1).filter((n) => n === 1 || n === totalPages || Math.abs(n - pageClamped) <= 1).map((n, idx, arr) => (
                  <span key={n} style={{ display: "flex" }}>
                    {idx > 0 && arr[idx - 1] !== n - 1 && <span style={{ padding: "0 6px", color: "var(--text-dim)" }}>…</span>}
                    <button onClick={() => setPage(n)} style={{ minWidth: 34, height: 34, borderRadius: 9, border: "1px solid var(--border)", cursor: "pointer", background: n === pageClamped ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: n === pageClamped ? "var(--on-primary, #fff)" : "var(--text)", fontSize: 13, fontWeight: 700 }}>{n}</button>
                  </span>
                ))}
                <PgBtn icone="chevron-right" titulo="Próxima página" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} desab={pageClamped >= totalPages} />
              </div>
            </div>
          )}
        </div>
      </div>

      {movendo && <ModalPasta b={movendo} pastas={pastas.map((p) => p.nome)} onClose={() => setMovendo(null)} onAplicar={aplicarPasta} />}
      {criando && <ModalCriar busy={busy} podeLinkTridi={false} onFechar={() => setCriando(false)} onCriar={(tpl, tipo) => { setCriando(false); void criar(tpl, tipo); }} />}
      {renomeando && <ModalRenomear b={renomeando} onFechar={() => setRenomeando(null)} onSalvar={renomear} />}
    </div>
  );
}

function ModalRenomear({ b, onFechar, onSalvar }: { b: Bot; onFechar: () => void; onSalvar: (b: Bot, nome: string) => void }) {
  const [nome, setNome] = useState(b.nome);
  return (
    <div onClick={onFechar} className="sheet-host" style={{
      position: "fixed", inset: 0, zIndex: 5000, background: "rgba(16,24,40,.55)", backdropFilter: "blur(3px)",
      display: "grid", placeItems: "center", padding: 20,
    }}>
      <form
        onClick={(e) => e.stopPropagation()} className="sheet"
        onSubmit={(e) => { e.preventDefault(); onSalvar(b, nome); }}
        style={{ width: "min(420px, 100%)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 16, padding: 20 }}
      >
        <strong style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", display: "block" }}>Renomear</strong>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "5px 0 14px" }}>
          Só muda o nome interno. O endereço público continua o mesmo.
        </p>
        <input
          value={nome} onChange={(e) => setNome(e.target.value)} autoFocus
          onFocus={(e) => e.currentTarget.select()}
          style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14, outline: "none" }}
        />
        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 16 }}>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" type="submit" disabled={!nome.trim()}>Salvar</Botao>
        </div>
      </form>
    </div>
  );
}

// "O que você deseja criar?" — a bifurcação entre os três tipos de projeto.
// Os atalhos de página e de quiz são só MODELOS do mesmo tipo; não existe
// sistema separado por trás de cada um.
function ModalCriar({ busy, onFechar, onCriar, podeLinkTridi = true }: {
  busy: boolean; onFechar: () => void; onCriar: (template: string | undefined, tipo: TipoProjeto) => void;
  /** Sem a chave do LinkTridi o cartão some: oferecer o que a API recusa é
   *  prometer uma tela que volta 403 na primeira tecla. */
  podeLinkTridi?: boolean;
}) {
  const [ramo, setRamo] = useState<null | "flow" | "quiz" | "page">(null);

  return (
    <div onClick={onFechar} className="sheet-host" style={{
      position: "fixed", inset: 0, zIndex: 5000, background: "rgba(16,24,40,.55)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "8dvh 16px", overflowY: "auto",
    }}>
      {/* overflowY auto depois de overflow hidden: sem isso a folha do celular
          (max-height do .sheet) cortaria o conteúdo sem deixar rolar. */}
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{
        width: "min(620px, 100%)", background: "var(--bg)", border: "1px solid var(--border)",
        borderRadius: 18, boxShadow: "0 24px 70px rgba(0,0,0,.4)", overflow: "hidden", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>O que você deseja criar?</div>
            <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
              {ramo === "page" ? "Escolha um modelo de página para começar." : "Escolha o tipo de projeto."}
            </div>
          </div>
          <BotaoIcone icone="x" titulo="Fechar" onClick={onFechar} />
        </div>

        <div style={{ padding: 18 }}>
          {!ramo ? (
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))" }}>
              <EscolhaTipo
                icone="message-chatbot" titulo="Fluxo conversacional"
                texto="Cria uma experiência no formato Typebot, utilizando o editor atual."
                onClick={() => setRamo("flow")}
              />
              <EscolhaTipo
                icone="list-numbers" titulo="Quiz"
                texto="Uma pergunta por tela, com barra de progresso, análise e oferta no fim."
                onClick={() => setRamo("quiz")}
              />
              <EscolhaTipo
                icone="template" titulo="Página"
                texto="Cria uma landing page ou página de venda utilizando blocos visuais."
                onClick={() => setRamo("page")}
              />
              {podeLinkTridi && (
                <EscolhaTipo
                  icone="link" titulo="LinkTridi"
                  texto="Página de bio link: sua marca no topo e uma vitrine de cartões que levam pro checkout."
                  onClick={() => onCriar(undefined, "linktridi")}
                />
              )}
              <EscolhaTipo
                icone="world-www" titulo="Iframe"
                texto="Publica uma página externa em tela cheia no seu link — cole a URL e pronto."
                onClick={() => onCriar(undefined, "iframe")}
              />
            </div>
          ) : ramo === "flow" ? (
            <div style={{ display: "grid", gap: 6 }}>
              <ItemModelo icone="plus" nome="Começar em branco" descricao="Um fluxo vazio, do jeito que você quiser."
                onClick={() => onCriar(undefined, "flow")} busy={busy} />
              {FUNIL_TEMPLATES.map((t) => (
                <ItemModelo key={t.id} icone="template" nome={t.nome} descricao={t.descricao}
                  onClick={() => onCriar(t.id, "flow")} busy={busy} />
              ))}
            </div>
          ) : ramo === "quiz" ? (
            <div style={{ display: "grid", gap: 6 }}>
              {QUIZ_TEMPLATES.map((t) => (
                <ItemModelo key={t.id} icone={t.icone} nome={t.nome} descricao={t.descricao}
                  onClick={() => onCriar(t.id, "quiz")} busy={busy} />
              ))}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {TEMPLATES_PAGINA.map((t) => (
                <ItemModelo key={t.id} icone={t.icone} nome={t.nome} descricao={t.descricao}
                  onClick={() => onCriar(t.id, "page")} busy={busy} />
              ))}
            </div>
          )}

          {ramo && (
            <Botao variante="sutil" tamanho="sm" icone="chevron-left" onClick={() => setRamo(null)} style={{ marginTop: 14 }}>
              Voltar
            </Botao>
          )}
        </div>
      </div>
    </div>
  );
}

function EscolhaTipo({ icone, titulo, texto, onClick }: { icone: string; titulo: string; texto: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        display: "grid", gap: 8, textAlign: "left", padding: 18, borderRadius: 14, cursor: "pointer",
        border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--primary)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}>
      <span style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 14%, transparent)" }}>
        <Icon name={icone} size={19} color="var(--primary-texto)" />
      </span>
      <strong style={{ fontSize: 15, fontWeight: 800 }}>{titulo}</strong>
      <span style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.45 }}>{texto}</span>
    </button>
  );
}

function Metrica({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>{rotulo}</div>
      <div className="stat" style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-0.01em", color: cor ?? "var(--text)", marginTop: 1 }}>{valor}</div>
    </div>
  );
}

function ItemModelo({ icone, nome, descricao, onClick, busy }: {
  icone: string; nome: string; descricao: string; onClick: () => void; busy: boolean;
}) {
  return (
    <button onClick={onClick} disabled={busy}
      style={{
        display: "flex", alignItems: "flex-start", gap: 11, width: "100%", textAlign: "left",
        padding: "11px 12px", borderRadius: 11, border: "1px solid transparent", background: "transparent",
        color: "var(--text)", cursor: busy ? "wait" : "pointer",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface)"; e.currentTarget.style.borderColor = "var(--border)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 14%, transparent)" }}>
        <Icon name={icone} size={16} color="var(--primary-texto)" />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>{nome}</span>
        <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.4, marginTop: 2 }}>{descricao}</span>
      </span>
    </button>
  );
}

function ModalPasta({ b, pastas, onClose, onAplicar }: { b: Bot; pastas: string[]; onClose: () => void; onAplicar: (b: Bot, pasta: string | null) => void }) {
  const [nova, setNova] = useState("");
  return (
    <div onClick={onClose} className="sheet-host" style={{ position: "fixed", inset: 0, zIndex: 5000, background: "rgba(16,24,40,.5)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "10dvh 16px" }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "min(420px,100%)", background: "#fff", borderRadius: 18, border: "1px solid var(--border)", boxShadow: "0 24px 70px rgba(16,24,40,.35)", overflow: "hidden", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid var(--border)" }}>
          <div><div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>Mover para pasta</div><div style={{ fontSize: 12.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>{b.nome}</div></div>
          <BotaoIcone icone="x" titulo="Fechar" onClick={onClose} />
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
          <OpcaoPasta label="Sem pasta" icone="ban" ativa={!b.pasta} onClick={() => onAplicar(b, null)} />
          {pastas.map((p) => <OpcaoPasta key={p} label={p} icone="folder" ativa={b.pasta === p} onClick={() => onAplicar(b, p)} />)}
        </div>
        <div style={{ padding: "12px 16px 16px", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", marginBottom: 6 }}>Nova pasta</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={nova} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && nova.trim()) onAplicar(b, nova.trim()); }} placeholder="Ex.: Carimbos"
              style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 11px", color: "var(--text)", fontSize: 13, outline: "none" }} />
            <Botao variante="primario" onClick={() => nova.trim() && onAplicar(b, nova.trim())} disabled={!nova.trim()}>Criar</Botao>
          </div>
        </div>
      </div>
    </div>
  );
}
function OpcaoPasta({ label, icone, ativa, onClick }: { label: string; icone: string; ativa: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid " + (ativa ? "var(--primary)" : "var(--border)"), background: ativa ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "var(--surface)", color: "var(--text)", fontSize: 13.5, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
      <Icon name={icone} size={16} color={ativa ? "var(--primary-texto)" : "var(--text-dim)"} />
      <span style={{ flex: 1 }}>{label}</span>
      {ativa && <Icon name="check" size={15} color="var(--primary-texto)" />}
    </button>
  );
}

// `chip` = versão do celular: em vez de item de lista vertical, vira pastilha
// numa fileira que rola de lado (mesmo estado, mesma ação).
function FolderItem({ label, n, ativo, onClick, icone, chip }: { label: string; n: number; ativo: boolean; onClick: () => void; icone: string; chip?: boolean }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 9, width: chip ? "auto" : "100%", padding: chip ? "8px 13px" : "8px 10px",
      borderRadius: chip ? 999 : 10, border: chip ? "1px solid var(--border)" : "none", cursor: "pointer",
      background: ativo ? "color-mix(in srgb, var(--primary) 12%, transparent)" : chip ? "var(--surface)" : "transparent",
      color: ativo ? "var(--primary-texto)" : "var(--text)", fontSize: 13, fontWeight: ativo ? 700 : 600, textAlign: "left",
    }}>
      <Icon name={icone} size={15} color={ativo ? "var(--primary-texto)" : "var(--text-dim)"} />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 700 }}>{n}</span>
    </button>
  );
}

function Select({ value, onChange, opts }: { value: string; onChange: (v: string) => void; opts: [string, string][] }) {
  return (
    <GlassSelect value={value} onChange={onChange} style={{ width: "auto", maxWidth: 200, fontSize: 12.5 }}
      options={opts.map(([v, l]) => ({ value: v, label: l }))} />
  );
}

function PgBtn({ icone, titulo, onClick, desab }: { icone: string; titulo: string; onClick: () => void; desab?: boolean }) {
  return <BotaoIcone icone={icone} titulo={titulo} variante="secundario" onClick={() => !desab && onClick()} disabled={desab} />;
}

// "Mais" do card e da linha: o menu do sistema (portal pro body, folha no
// celular). Antes era um absoluto dentro do rodapé do card — recortado por
// qualquer `overflow` e sem teclado.
function MenuMais({ b, onAcao, onExcluir, onMover, onRenomear, onArquivar, gatilho }: { b: Bot; onAcao: (id: string, a: "duplicar" | "publicar" | "despublicar") => void; onExcluir: (b: Bot) => void; onMover: (b: Bot) => void; onRenomear: (b: Bot) => void; onArquivar: (b: Bot, valor: boolean) => void; gatilho: (p: PropsDoGatilho) => React.ReactNode }) {
  const pub = b.status === "publicado";
  return (
    <Dropdown
      titulo={`Mais ações de ${b.nome}`}
      alinhar="fim"
      largura={200}
      gatilho={gatilho}
      itens={[
        { id: "metricas", rotulo: ehPagina(b) ? "Métricas da página" : "Resultados e leads", icone: "chart-line",
          onSelect: () => { window.location.href = ehPagina(b) ? `/tridiflow/p/${b.id}/metricas` : `/tridiflow/${b.id}/resultados`; } },
        { id: "renomear", rotulo: "Renomear", icone: "edit", onSelect: () => onRenomear(b) },
        { id: "mover", rotulo: "Mover para pasta", icone: "folder", onSelect: () => onMover(b) },
        // Baixa o projeto como .tridiflow.json — o par do "Importar template"
        // da Biblioteca. Leva conteúdo e tema; endereço/status ficam pra trás.
        { id: "exportar", rotulo: "Exportar arquivo", icone: "download", onSelect: () => { void exportarProjeto(b.id); } },
        { id: "arquivar", rotulo: b.arquivado ? "Restaurar" : "Arquivar", icone: b.arquivado ? "player-play" : "archive", onSelect: () => onArquivar(b, !b.arquivado) },
        { id: "publicar", rotulo: pub ? "Despublicar" : "Publicar", icone: pub ? "player-pause" : "rocket", onSelect: () => onAcao(b.id, pub ? "despublicar" : "publicar") },
        { id: "excluir", rotulo: "Excluir", icone: "trash", perigo: true, onSelect: () => onExcluir(b) },
      ]}
    />
  );
}

export function CardBot({ b, onAcao, onExcluir, onMover, onRenomear, onArquivar, statsPagina }: { b: Bot; onAcao: (id: string, a: "duplicar" | "publicar" | "despublicar") => void; onExcluir: (b: Bot) => void; onMover: (b: Bot) => void; onRenomear: (b: Bot) => void; onArquivar: (b: Bot, v: boolean) => void; statsPagina?: StatsPagina }) {
  const taxa = taxaDe(b.stats);
  const cor = (b.capa ?? { corHeader: "#6D1192" }).corHeader;
  const pub = b.status === "publicado";
  const pagina = ehPagina(b);
  const editor = editorDe(b);
  const prefixo = pagina ? "p" : "f";
  return (
    <div className="tf-botcard" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "16px 16px 6px", display: "flex", flexDirection: "column", height: "100%", boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 12px 30px -16px rgba(0,0,0,.4)" }}>
      {/* Cabeçalho: ícone squircle (cor da marca) + nome/link + status — estilo App Store */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
        {/* Página mostra a SILHUETA dela (nas cores dela); fluxo mantém o ícone
            da marca. Página sem bloco nenhum cai no ícone — silhueta vazia não
            informa nada. */}
        {pagina && b.miniatura && b.miniatura.blocos > 0 ? (
          <Link href={editor} title={`Abrir editor · ${b.miniatura.blocos} bloco${b.miniatura.blocos === 1 ? "" : "s"}`} style={{ textDecoration: "none", flex: "none" }}>
            <MiniaturaPagina mini={b.miniatura} tamanho={52} raio={12} />
          </Link>
        ) : (
          <Link href={editor} title="Abrir editor" style={{ width: 52, height: 52, borderRadius: 15, flex: "none", display: "grid", placeItems: "center", textDecoration: "none",
            background: `linear-gradient(160deg, color-mix(in srgb, ${cor} 72%, #fff), ${cor} 52%, color-mix(in srgb, ${cor} 84%, #000))`,
            boxShadow: `0 6px 15px -5px color-mix(in srgb, ${cor} 60%, transparent), inset 0 1px 0 rgba(255,255,255,.42)` }}>
            <Icon name={pagina ? "template" : "message-chatbot"} size={26} color={corGlifo(cor)} />
          </Link>
        )}
        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          {/* Nome INTEIRO: nada de cortar em 2 linhas com "…". Os nomes aqui
              carregam o que diferencia um bot do outro (pixel novo, TikTok,
              teste A/B) — justamente o pedaço que sumia no corte. */}
          <Link href={editor} title={b.nome} style={{ display: "block", fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.25, color: "var(--text)", textDecoration: "none", wordBreak: "break-word" }}>{b.nome}</Link>
          {/* Que TIPO de página é (VSL, captura, venda…). Só página tem. */}
          {pagina && tipoPaginaPorId(b.templatePagina) && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 10.5, fontWeight: 700,
              padding: "2px 8px", borderRadius: 999,
              background: `color-mix(in srgb, ${tipoPaginaPorId(b.templatePagina)!.cor} 14%, transparent)`,
              color: tipoPaginaPorId(b.templatePagina)!.cor }}>
              <Icon name={tipoPaginaPorId(b.templatePagina)!.icone} size={11} color={tipoPaginaPorId(b.templatePagina)!.cor} />
              {tipoPaginaPorId(b.templatePagina)!.label}
            </span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4, maxWidth: "100%" }}>
            <span title={`${b.dominioHost || DOMINIO_PADRAO}/${prefixo}/${b.slug}`} style={{ flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-dim)", fontSize: 12.5 }}>{(b.dominioHost || DOMINIO_PADRAO)}/{prefixo}/{b.slug}</span>
            <BotaoIcone icone="copy" titulo="Copiar link" tamanho="sm" onClick={() => { navigator.clipboard.writeText(linkDe(b)); toast.ok("Link copiado."); }} style={{ flex: "none" }} />
          </div>
        </div>
        <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: pub ? "3px 9px 3px 8px" : "3px 10px", borderRadius: 999,
          background: pub ? "color-mix(in srgb, #30B14E 15%, transparent)" : "var(--surface-2)", color: pub ? "#2AA247" : "var(--text-dim)" }}>
          {pub && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2AA247" }} />}
          {pub ? "Publicado" : "Rascunho"}
        </span>
      </div>

      {/* Métricas — a pergunta muda com o tipo: fluxo mede conversa, página
          mede visita e clique. */}
      <div style={{ display: "grid", gridTemplateColumns: pagina ? "1fr 1fr 1fr" : "1fr 1fr", gap: 12, margin: "15px 2px 0" }}>
        {pagina ? (
          <>
            <Metrica rotulo="Visualizações" valor={fmt(statsPagina?.visualizacoes ?? 0)} />
            <Metrica rotulo="Cliques no CTA" valor={fmt(statsPagina?.cliques ?? 0)} />
            <Metrica rotulo="Conversões" valor={fmt(statsPagina?.conversoes ?? 0)} cor="#2AA247" />
          </>
        ) : (
          <>
            <Metrica rotulo="Starts" valor={fmt(b.stats?.sessoes ?? 0)} />
            <Metrica rotulo="Taxa de conclusão" valor={taxa == null ? "—" : `${taxa}%`} cor={corTaxa(taxa)} />
          </>
        )}
      </div>

      {/* Quem mexeu por último — a pergunta que a equipe faz antes de editar
          uma página que não é dela. Sem responsável gravado, mostra só a data. */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 12, fontSize: 11.5, color: "var(--text-dim)", minWidth: 0 }}>
        <Icon name="history" size={13} color="var(--text-dim)" />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {fmtData(b.updatedAt)}{b.responsavel ? ` · por ${b.responsavel.nome}` : ""}
        </span>
      </div>

      {/* Ações */}
      <div style={{ display: "flex", gap: 2, borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 4, position: "relative" }}>
        <AcaoCard icone="external-link" label="Abrir" onClick={() => window.open(linkDe(b), "_blank")} desabilitado={!pub} />
        <AcaoCard icone="edit" label="Editar" onClick={() => { window.location.href = editor; }} />
        <AcaoCard icone="copy-plus" label="Duplicar" onClick={() => onAcao(b.id, "duplicar")} />
        <MenuMais b={b} onAcao={onAcao} onExcluir={onExcluir} onMover={onMover} onRenomear={onRenomear} onArquivar={onArquivar}
          gatilho={(p) => (
            <button type="button" className="tf-botact" {...p} title="Mais" aria-label={`Mais ações de ${b.nome}`}
              style={{ flex: "0 0 44px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 4px", background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", borderRadius: 10, fontSize: 12, fontWeight: 600 }}>
              <Icon name="dots" size={15} />
            </button>
          )} />
      </div>
    </div>
  );
}

function LinhaBot({ b, primeiro, onAcao, onExcluir, onMover, onRenomear, onArquivar, statsPagina }: { b: Bot; primeiro: boolean; onAcao: (id: string, a: "duplicar" | "publicar" | "despublicar") => void; onExcluir: (b: Bot) => void; onMover: (b: Bot) => void; onRenomear: (b: Bot) => void; onArquivar: (b: Bot, v: boolean) => void; statsPagina?: StatsPagina }) {
  const taxa = taxaDe(b.stats);
  const capa = b.capa ?? { corHeader: "#6D1192", corBolhaUser: "#6D1192", corFundo: "#F2F2F7" };
  const pagina = ehPagina(b);
  const editor = editorDe(b);
  return (
    // flexWrap + grupo com marginLeft:auto: no computador tudo cabe numa linha
    // (layout idêntico); no celular métricas e ações descem pra segunda linha
    // em vez de empurrar a lista pra fora da tela.
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderTop: primeiro ? "none" : "1px solid var(--border)", position: "relative", flexWrap: "wrap" }}>
      {pagina && b.miniatura && b.miniatura.blocos > 0 ? (
        <Link href={editor} style={{ textDecoration: "none", flex: "none" }}><MiniaturaPagina mini={b.miniatura} tamanho={44} raio={10} /></Link>
      ) : (
        <Link href={editor} style={{ width: 44, height: 44, borderRadius: 12, flex: "none", background: `linear-gradient(145deg, color-mix(in srgb, ${capa.corHeader} 82%, #fff), ${capa.corHeader} 52%, color-mix(in srgb, ${capa.corHeader} 76%, #000))`, display: "grid", placeItems: "center", boxShadow: "inset 0 1px 0 rgba(255,255,255,.25)" }}><Icon name={pagina ? "template" : "message-chatbot"} size={20} color={corGlifo(capa.corHeader)} /></Link>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href={editor} title={b.nome} style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text)", textDecoration: "none", minWidth: 0, wordBreak: "break-word" }}>{b.nome}</Link>
          <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: b.status === "publicado" ? "color-mix(in srgb,var(--ok) 16%,transparent)" : "var(--surface-2)", color: b.status === "publicado" ? "var(--ok)" : "var(--text-dim)" }}>{b.status === "publicado" ? "Publicado" : "Rascunho"}</span>
          <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "var(--surface-2)", color: "var(--text-dim)" }}>{pagina ? "Página" : "Fluxo"}</span>
          {b.pasta && <span style={{ fontSize: 10.5, color: "var(--text-dim)", display: "inline-flex", alignItems: "center", gap: 3 }}><Icon name="folder" size={11} color="var(--text-dim)" />{b.pasta}</span>}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(b.dominioHost || DOMINIO_PADRAO)}/{pagina ? "p" : "f"}/{b.slug} · editado {fmtData(b.updatedAt)}{b.responsavel ? ` por ${b.responsavel.nome}` : ""}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
        <div style={{ width: 90, textAlign: "right", flex: "none" }}><div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700 }}>{pagina ? "Visitas" : "Starts"}</div><div className="stat" style={{ fontSize: 15, fontWeight: 800 }}>{fmt(pagina ? (statsPagina?.visualizacoes ?? 0) : (b.stats?.sessoes ?? 0))}</div></div>
        <div style={{ width: 90, textAlign: "right", flex: "none" }}><div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700 }}>{pagina ? "Conversões" : "Conclusão"}</div><div className="stat" style={{ fontSize: 15, fontWeight: 800, color: pagina ? "var(--text)" : corTaxa(taxa) }}>{pagina ? fmt(statsPagina?.conversoes ?? 0) : (taxa == null ? "—" : `${taxa}%`)}</div></div>
        <div style={{ display: "flex", gap: 2, flex: "none", position: "relative" }}>
          <IconBtn icone="edit" title="Editar" onClick={() => { window.location.href = editor; }} />
          <IconBtn icone="copy-plus" title="Duplicar" onClick={() => onAcao(b.id, "duplicar")} />
          <MenuMais b={b} onAcao={onAcao} onExcluir={onExcluir} onMover={onMover} onRenomear={onRenomear} onArquivar={onArquivar}
            gatilho={(p) => (
              <BotaoIcone {...p} icone="dots" titulo="Mais" variante="secundario" aria-label={`Mais ações de ${b.nome}`} />
            )} />
        </div>
      </div>
    </div>
  );
}

function IconBtn({ icone, title, onClick }: { icone: string; title: string; onClick: (e?: React.MouseEvent) => void }) {
  return <BotaoIcone icone={icone} titulo={title} variante="secundario" onClick={(e) => onClick(e)} />;
}
function AcaoCard({ icone, label, onClick, desabilitado }: { icone: string; label?: string; onClick: (e?: React.MouseEvent) => void; desabilitado?: boolean }) {
  return (
    <button className="tf-botact" onClick={(e) => !desabilitado && onClick(e)} disabled={desabilitado} title={label ?? "Mais"}
      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 4px", background: "none", border: "none", cursor: desabilitado ? "default" : "pointer", color: "var(--text-dim)", opacity: desabilitado ? 0.4 : 1, borderRadius: 10, fontSize: 12, fontWeight: 600 }}>
      <Icon name={icone} size={15} />{label && <span>{label}</span>}
    </button>
  );
}
