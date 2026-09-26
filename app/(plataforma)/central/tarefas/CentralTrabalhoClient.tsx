"use client";

// ── Central · Tarefas ────────────────────────────────────────────────────────
// UMA lista com tudo que é trabalho SEU: tarefas pessoais, tarefas delegadas e
// atividades da empresa atribuídas a você.
//
// As SOLICITAÇÕES saíram daqui e voltaram pra `/central/solicitacoes`. Elas
// tinham sido fundidas nesta lista com o argumento de que um pedido é uma
// tarefa que alguém te mandou — verdade pra quem recebe, e só. Tarefa se
// CONCLUI (uma caixinha); solicitação se APROVA ou se RECUSA, com motivo, com
// imagem, com autor e com destinatário. Fundidas, esta tela carregava um item
// sem caixinha pra marcar, um filtro que só valia pra ele, um id com prefixo
// pra desviar toda escrita e um painel de detalhe paralelo ao de tarefa. Três
// mecanismos pra um item que nunca foi uma tarefa.
//
// 3 colunas: listas inteligentes | lista (por seção) | painel de detalhes.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../Icon";
import { toast } from "../../Toast";
import { GlassDate, GlassSelect } from "../../GlassPicker";
import { useSticky } from "../../useSticky";
import { useIsMobile } from "../../ui/useMediaQuery";
import type { Tarefa, TarefaStatus, TarefaPrioridade, OrigemTipo, Subtarefa } from "@/lib/tarefas";
import { SeletorVisao, MatrizEisenhower, KanbanTarefas, CalendarioTarefas, type Visao } from "./Visoes";
import { PRIORIDADE, STATUS, ORIGEM, fmtPrazo, hojeStr, diaDe, ativos, ehAtividade, ehVirtual, corDaLista } from "./comum";
import { atributosDe } from "../../ui/campos";
import { Fila } from "../../ui/micro";
import { TextoComCodigo } from "../../ui/TextoComCodigo";
import { motivoDaFalha, respostaConfiavel } from "../../ui/rede";
import { entender } from "@/lib/tarefas-linguagem";
import "./tarefas-micro.css";
import { Botao, Caixa } from "../../ui/controles";
import { Dropdown } from "../../ui/Dropdown";

/**
 * Marca a linha cuja escrita o servidor recusou (Kinetics 094). O `aplicar`
 * já repôs o valor antigo e o toast diz o motivo; isto só aponta QUAL linha
 * voltou, pra quem mexeu em três tarefas seguidas. Direto no DOM porque é um
 * piscar de meio segundo — um estado por linha remontaria a lista inteira.
 */
function piscarRecusa(id: string) {
  if (typeof document === "undefined") return;
  Array.from(document.querySelectorAll<HTMLElement>("[data-tarefa]")).forEach((el) => {
    if (el.dataset.tarefa !== id) return;
    el.classList.remove("ct-recusada");
    void el.offsetWidth;
    el.classList.add("ct-recusada");
    setTimeout(() => el.classList.remove("ct-recusada"), 700);
  });
}

const ORIGEM_CRIAR: { tipo: OrigemTipo; label: string }[] = [
  { tipo: "message", label: "Mensagem" }, { tipo: "order", label: "Pedido" },
  { tipo: "system_issue", label: "Problema do sistema" }, { tipo: "purchase", label: "Compra / Recebimento" },
  { tipo: "personal", label: "Tarefa pessoal" },
];

type View = "caixa" | "hoje" | "proximas" | "atrasadas" | "em_andamento" | "aguardando";

// ── Escopo ───────────────────────────────────────────────────────────────────
// A pergunta que separa a lista em três não é "que tipo de item é este?" e sim
// "de quem o sistema está esperando alguma coisa?". Por isso "Delegadas" e
// "Concluídas" saíram da coluna lateral: viraram estes botões, que valem tanto
// pra tarefa quanto pra solicitação.
type Escopo = "pendencias" | "enviados" | "concluidos";
const ESCOPOS: { key: Escopo; nome: string; curto: string; icon: string }[] = [
  { key: "pendencias", nome: "Minhas pendências", curto: "Pendências", icon: "inbox" },
  { key: "enviados", nome: "Enviados por mim", curto: "Enviados", icon: "send" },
  { key: "concluidos", nome: "Concluídos", curto: "Concluídos", icon: "circle-check" },
];

export function CentralTrabalhoClient({ userId, inicial }: {
  userId: string;
  inicial: Tarefa[];
}) {
  const [tarefas, setTarefas] = useState<Tarefa[]>(inicial);
  const [view, setView] = useSticky<View>("central.tarefas.view", "caixa");
  const [escopo, setEscopo] = useSticky<Escopo>("central.escopo", "pendencias");
  const [filtro, setFiltro] = useState<"todas" | "tarefas" | "message" | "order" | "system_issue">("todas");
  const [selId, setSelId] = useState<string | null>(null);
  const [quick, setQuick] = useState("");
  const [ausente, setAusente] = useState(false);
  const [busca, setBusca] = useState("");
  // Lista, Kanban, Calendário e Eisenhower são a MESMA tarefa em quatro
  // representações — nenhuma cria entidade nova, todas leem e escrevem o mesmo
  // registro. Por isso o filtro/busca acima delas vale para as quatro.
  const [visao, setVisao] = useState<Visao>("lista");
  const [ordem, setOrdem] = useState<"prazo" | "prioridade" | "criacao">("prazo");
  const [desfazer, setDesfazer] = useState<{ id: string; titulo: string } | null>(null);
  const [listaSel, setListaSel] = useState<string | null>(null);
  const [tagSel, setTagSel] = useState<string | null>(null);
  const [adiarAlvo, setAdiarAlvo] = useState<{ t: Tarefa; x: number; y: number } | null>(null);
  const quickRef = useRef<HTMLInputElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const celular = useIsMobile();
  const virtual = ehVirtual;   // atividade da empresa: não grava na tabela `tarefas`

  useEffect(() => {
    fetch("/api/tarefas", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (Array.isArray(j.tarefas)) setTarefas((v) => [...j.tarefas, ...v.filter((t) => ehAtividade(t.id))]);
    }).catch(() => {});
  }, []);

  // Atalhos: N nova · / busca · C concluir · E adiar · P prioridade. Nunca
  // enquanto digita num input/textarea/select.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "n") { e.preventDefault(); quickRef.current?.focus(); }
      else if (e.key === "/") { e.preventDefault(); buscaRef.current?.focus(); }
      else if (k === "c" && selRef.current) { e.preventDefault(); const t = tarefasRef.current.find((x) => x.id === selRef.current); if (t && !virtual(t.id)) concluirRef.current?.(t); }
      else if (k === "e" && selRef.current) {
        // Adiar pelo teclado abre no CENTRO, não onde o mouse está: quem usa
        // atalho não está com a mão no mouse, e um menu no canto da tela seria
        // um menu escondido.
        e.preventDefault();
        const t = tarefasRef.current.find((x) => x.id === selRef.current);
        if (t && !virtual(t.id)) setAdiarAlvo({ t, x: window.innerWidth / 2 - 108, y: window.innerHeight / 2 - 110 });
      }
      else if (k === "p" && selRef.current) {
        e.preventDefault(); const t = tarefasRef.current.find((x) => x.id === selRef.current);
        if (t && !virtual(t.id)) { const ciclo: TarefaPrioridade[] = ["baixa", "media", "alta", "urgente"]; aplicarRef.current?.(t.id, { prioridade: ciclo[(ciclo.indexOf(t.prioridade) + 1) % ciclo.length] }); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // refs estáveis pros atalhos (evita re-bind a cada render)
  const selRef = useRef<string | null>(null); const tarefasRef = useRef<Tarefa[]>([]);
  const concluirRef = useRef<((t: Tarefa) => void) | null>(null);
  const aplicarRef = useRef<((id: string, p: Partial<Tarefa>) => void) | null>(null);
  const adiarRef = useRef<((t: Tarefa, q: "hoje" | "amanha" | "semana" | "nenhum") => void) | null>(null);
  selRef.current = selId; tarefasRef.current = tarefas;

  const h = hojeStr();
  const isAtrasada = (t: Tarefa) => { const d = diaDe(t.prazo); return !!d && d < h && ativos(t); };
  const isHoje = (t: Tarefa) => { const d = diaDe(t.prazo); return ativos(t) && (d === h || isAtrasada(t) || t.prioridade === "urgente" || diaDe(t.lembrarEm) === h); };
  const isProxima = (t: Tarefa) => { const d = diaDe(t.prazo); return ativos(t) && !!d && d > h; };

  // ── A lista ────────────────────────────────────────────────────────────────
  const tudo = tarefas;

  // O escopo é a primeira pergunta: de quem se está esperando. Ele vem ANTES da
  // lista inteligente, senão "Hoje" misturaria o que você tem que fazer com o
  // que você só está aguardando resposta de outra pessoa.
  const pertence = useCallback((t: Tarefa, e: Escopo) => {
    if (e === "concluidos") return !ativos(t);
    if (!ativos(t)) return false;
    // Enviados: tarefa que deleguei — a bola está com outro.
    if (e === "enviados") return t.criadorId === userId && t.responsavelId !== userId;
    // Pendências: espera VOCÊ.
    return t.responsavelId === userId || !t.responsavelId;
  }, [userId]);

  const doEscopo = useMemo(() => tudo.filter((t) => pertence(t, escopo)), [tudo, escopo, pertence]);
  const cntEscopo = useMemo(() => ({
    pendencias: tudo.filter((t) => pertence(t, "pendencias")).length,
    enviados: tudo.filter((t) => pertence(t, "enviados")).length,
    concluidos: tudo.filter((t) => pertence(t, "concluidos")).length,
  } as Record<Escopo, number>), [tudo, pertence]);

  // As listas inteligentes recortam DENTRO do escopo (só faz sentido no que
  // ainda está vivo — em "Concluídos" a lista é plana).
  const daView = useMemo(() => {
    if (escopo === "concluidos") return doEscopo;
    switch (view) {
      case "hoje": return doEscopo.filter(isHoje);
      case "proximas": return doEscopo.filter(isProxima);
      case "atrasadas": return doEscopo.filter(isAtrasada);
      case "em_andamento": return doEscopo.filter((t) => t.status === "em_andamento");
      case "aguardando": return doEscopo.filter((t) => t.status === "aguardando" || t.status === "bloqueada");
      default: return doEscopo;   // caixa de entrada = tudo do escopo
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doEscopo, view, escopo]);

  const PRIOR_ORD: Record<TarefaPrioridade, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
  const q = busca.trim().toLowerCase();
  const porFiltro = daView
    .filter((t) => filtro === "todas" ? true
      : filtro === "tarefas" ? (t.origemTipo === "personal" || t.origemTipo === "activity")
      : t.origemTipo === filtro)
    .filter((t) => !listaSel || t.lista === listaSel)
    .filter((t) => !tagSel || t.tags.includes(tagSel))
    .filter((t) => !q || t.titulo.toLowerCase().includes(q) || (t.descricao ?? "").toLowerCase().includes(q) || (t.origemLabel ?? "").toLowerCase().includes(q) || (t.responsavelNome ?? "").toLowerCase().includes(q) || t.tags.some((tg) => tg.toLowerCase().includes(q)))
    .sort((a, b) => ordem === "prioridade" ? PRIOR_ORD[a.prioridade] - PRIOR_ORD[b.prioridade]
      : ordem === "criacao" ? (b.createdAt || "").localeCompare(a.createdAt || "")
      : (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"));

  // Contadores da sidebar — sempre DENTRO do escopo aberto, senão o número ao
  // lado de "Hoje" contaria coisa que a lista não vai mostrar.
  const cnt = {
    caixa: doEscopo.length, hoje: doEscopo.filter(isHoje).length, proximas: doEscopo.filter(isProxima).length,
    atrasadas: doEscopo.filter(isAtrasada).length, em_andamento: doEscopo.filter((t) => t.status === "em_andamento").length,
    aguardando: doEscopo.filter((t) => t.status === "aguardando" || t.status === "bloqueada").length,
  };
  const listas = [...new Set(tarefas.map((t) => t.lista).filter(Boolean) as string[])];
  const etiquetas = [...new Set(tarefas.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const sel = tudo.find((t) => t.id === selId) || null;

  // Otimista, mas honesto. Antes o `catch` era vazio: se a escrita falhava, o
  // check continuava marcado e a pessoa ia embora achando que tinha concluído.
  // Interface que mente é pior que interface lenta — a tarefa some da lista e
  // ninguém nunca mais olha pra ela. Agora o valor ANTERIOR volta e o toast diz
  // o que aconteceu.
  function aplicar(id: string, patch: Partial<Tarefa>) {
    // Atividade edita em Minhas atividades; solicitação se resolve pelo cartão.
    // Um PATCH em /api/tarefas com id `atv_`/`sol_` não acharia registro nenhum.
    if (virtual(id)) return;
    const antes = tarefasRef.current.find((t) => t.id === id);
    setTarefas((v) => v.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    fetch("/api/tarefas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) })
      // `respostaConfiavel` e não `r.ok`: sem sessão o middleware desvia pro
      // login, que responde 200 com HTML. Pro `r.ok` isso é sucesso — e a
      // tarefa ficava riscada na tela sem nunca ter sido concluída no banco.
      .then((r) => { if (!respostaConfiavel(r)) throw new Error(r.ok ? "sessao_expirada" : `http_${r.status}`); })
      .catch((e) => {
        if (antes) { setTarefas((v) => v.map((t) => (t.id === id ? antes : t))); piscarRecusa(id); }
        toast(motivoDaFalha(e, "salvar — a alteração foi desfeita"), "erro");
      });
  }
  async function concluir(t: Tarefa) {
    if (virtual(t.id)) return;   // sem navegação forçada (antes recarregava a página toda)
    const novo = t.status === "concluida" ? "pendente" : "concluida";
    aplicar(t.id, { status: novo as TarefaStatus, concluidaAt: novo === "concluida" ? new Date().toISOString() : null });
    if (novo === "concluida") { setDesfazer({ id: t.id, titulo: t.titulo }); setTimeout(() => setDesfazer((d) => (d?.id === t.id ? null : d)), 6000); }
  }
  concluirRef.current = concluir; aplicarRef.current = aplicar;
  // A frase inteira vira tarefa: prazo, prioridade, lista e etiquetas saem do que
  // foi digitado (ver lib/tarefas-linguagem.ts). O que a pessoa não escreveu
  // continua vindo do contexto — a lista aberta na barra lateral.
  async function criar(frase: string, origemTipo: OrigemTipo = "personal", lista?: string) {
    if (!frase.trim()) return;
    const e = entender(frase);
    const corpo = {
      titulo: e.titulo, origemTipo,
      lista: lista ?? e.lista ?? listaSel ?? undefined,
      prazo: e.prazo ?? undefined,
      prioridade: e.prioridade ?? undefined,
      tags: e.tags.length ? e.tags : undefined,
    };
    const r = await fetch("/api/tarefas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await r.json();
    if (j.ok) { setTarefas((v) => [j.tarefa, ...v]); setQuick(""); setSelId(j.tarefa.id); }
    else if (j.error === "tabela_ausente") setAusente(true);
    else toast("Não deu pra criar a tarefa.", "erro");
  }

  // ── Adiar ──────────────────────────────────────────────────────────────────
  // A lista de atrasadas só crescia porque mover um prazo custava abrir o
  // detalhe e navegar num calendário — quatro interações por tarefa. Adiar é a
  // resposta mais comum a "isso está atrasado", e agora é UMA.
  function adiar(t: Tarefa, quando: "hoje" | "amanha" | "semana" | "nenhum") {
    if (quando === "nenhum") return aplicar(t.id, { prazo: null });
    const base = new Date(Date.now() + (quando === "hoje" ? 0 : quando === "amanha" ? 24 * 3600e3 : 7 * 24 * 3600e3));
    // Conserva a HORA que já estava marcada: adiar "amanhã" uma reunião das 14h
    // não pode transformá-la em meia-noite.
    const horaAtual = t.prazo ? new Date(new Date(t.prazo).getTime() - 3 * 3600e3).toISOString().slice(11, 16) : "09:00";
    aplicar(t.id, { prazo: new Date(Date.parse(`${diaDe(base.toISOString())}T${horaAtual}:00Z`) + 3 * 3600e3).toISOString() });
  }
  adiarRef.current = adiar;
  const abrirAdiar = (t: Tarefa, x: number, y: number) => setAdiarAlvo({ t, x, y });
  async function remover(id: string) {
    const idx = tarefas.findIndex((t) => t.id === id);
    const antes = tarefas[idx];
    setTarefas((v) => v.filter((t) => t.id !== id)); setSelId(null);
    try {
      const r = await fetch(`/api/tarefas?id=${id}`, { method: "DELETE" });
      if (!respostaConfiavel(r)) throw new Error(r.ok ? "sessao_expirada" : `http_${r.status}`);
    } catch (e) {
      // Não saiu do banco: a tarefa volta pro lugar e o toast diz por quê.
      if (antes) setTarefas((v) => (v.some((t) => t.id === id) ? v : [...v.slice(0, idx), antes, ...v.slice(idx)]));
      toast.erro(motivoDaFalha(e, "excluir a tarefa"));
    }
  }

  const VIEWS: { key: View; nome: string; icon: string; n: number }[] = [
    { key: "caixa", nome: "Caixa de entrada", icon: "inbox", n: cnt.caixa },
    { key: "hoje", nome: "Hoje", icon: "calendar", n: cnt.hoje },
    { key: "proximas", nome: "Próximas", icon: "calendar-event", n: cnt.proximas },
    { key: "atrasadas", nome: "Atrasadas", icon: "alert-triangle", n: cnt.atrasadas },
    { key: "em_andamento", nome: "Em andamento", icon: "activity", n: cnt.em_andamento },
    { key: "aguardando", nome: "Aguardando", icon: "clock", n: cnt.aguardando },
  ];
  // Em "Concluídos" a lista é plana: recortar histórico por "Hoje"/"Atrasadas"
  // não responde a nenhuma pergunta que alguém faça olhando pro que já acabou.
  const comListas = escopo !== "concluidos";
  const viewNome = comListas
    ? (VIEWS.find((v) => v.key === view)?.nome ?? "Caixa de entrada")
    : (ESCOPOS.find((e) => e.key === escopo)?.nome ?? "");

  return (
    <div className={`ct-grid${sel ? " ct-com-detalhe" : ""}`}>
      {/* ── Coluna 1 · Listas ───────────────────────────────────────────── */}
      <aside className="ct-sidebar" style={{ position: "sticky", top: 8, display: "flex", flexDirection: "column", gap: 2 }}>
        {/* "Nova tarefa" NÃO abre menu: foca a barra de criação, que é onde a
            tarefa nasce mesmo. O menu de "criar a partir de" era um passo entre
            o clique e o cursor — e o item mais usado dele só fazia esse foco.
            Os cinco tipos de origem continuam alcançáveis pelo chevron ao lado. */}
        <div className="ct-topo" style={{ display: "flex", alignItems: "center", gap: 6, position: "relative", marginBottom: 10 }}>
          <Botao variante="primario" icone="plus" onClick={() => quickRef.current?.focus()} className="ct-btn-novo" style={{ flex: 1 }}>
            Nova tarefa
          </Botao>
          {/* Menu do sistema: portal pro body (a sidebar vira faixa com rolagem
              no celular e recortaria um menu absoluto) e folha embaixo no celular. */}
          <Dropdown
            titulo="Criar a partir de outra origem"
            alinhar="fim"
            secoes={[{
              titulo: "Criar a partir de",
              itens: ORIGEM_CRIAR.map((o) => ({
                id: o.tipo, rotulo: o.label, icone: ORIGEM[o.tipo].icon, cor: ORIGEM[o.tipo].cor,
                onSelect: () => criar(o.label === "Tarefa pessoal" ? "Nova tarefa" : `Nova (${o.label.toLowerCase()})`, o.tipo),
              })),
            }]}
            gatilho={(p) => (
              <button type="button" {...p} aria-label="Criar a partir de outra origem" title="Criar a partir de…"
                style={{ flex: "none", width: "var(--tap)", minHeight: "var(--tap)", display: "grid", placeItems: "center", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer" }}>
                <Icon name="chevron-down" size={15} color="var(--text-dim)" />
              </button>
            )}
          />
        </div>

        {/* A busca mora no topo da coluna de navegação, não na fileira de
            filtros da lista: procurar é como se CHEGA numa tarefa, do mesmo
            jeito que clicar em "Hoje" — e na fileira ela disputava espaço com
            os chips justo em 320px, onde o espaço não existe. */}
        <div className="ct-busca" style={{ position: "relative", marginBottom: 10 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", lineHeight: 0, pointerEvents: "none" }}>
            <Icon name="search" size={14} color="var(--text-dim)" />
          </span>
          <input {...atributosDe("busca")} ref={buscaRef} value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar (/)" aria-label="Buscar tarefa"
            style={{ width: "100%", boxSizing: "border-box", minHeight: "var(--tap)", padding: "8px 30px 8px 32px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }} />
          {busca && (
            <button onClick={() => { setBusca(""); buscaRef.current?.focus(); }} aria-label="Limpar busca"
              style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", padding: 8, border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center", lineHeight: 0 }}>
              <Icon name="x" size={13} color="var(--text-dim)" />
            </button>
          )}
        </div>

        {comListas && <>
          <div className="ct-secao">Tarefas</div>
          {VIEWS.map((v) => {
            const on = view === v.key;
            const alerta = v.key === "atrasadas" && v.n > 0;
            return (
              <button key={v.key} onClick={() => { setView(v.key); setSelId(null); }} className="ct-nav" aria-current={on ? "page" : undefined}
                style={{ background: on ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent", color: on ? "var(--text)" : "var(--text-dim)", fontWeight: on ? 700 : 600 }}>
                <Icon name={v.icon} size={16} color={on ? "var(--primary-texto)" : (alerta ? "var(--perigo)" : "var(--text-dim)")} />
                <span className="ct-nav-txt">{v.nome}</span>
                {v.n > 0 && <span className="ct-nav-n" style={{ color: alerta ? "var(--perigo)" : "var(--text-dim)" }}>{v.n}</span>}
              </button>
            );
          })}
        </>}

        <div className="ct-secao">Listas</div>
        {listas.map((l) => {
          const on = listaSel === l;
          const n = tudo.filter((t) => t.lista === l && ativos(t)).length;
          return (
            <button key={l} onClick={() => { setListaSel(on ? null : l); setSelId(null); }} className="ct-nav" aria-pressed={on}
              style={{ background: on ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent", color: on ? "var(--text)" : "var(--text-dim)", fontWeight: on ? 700 : 600 }}>
              <span style={{ width: 10, height: 10, flex: "none", borderRadius: 3, background: corDaLista(l) }} />
              <span className="ct-nav-txt">{l}</span>
              {n > 0 && <span className="ct-nav-n">{n}</span>}
            </button>
          );
        })}
        {/* Antes isto era um `prompt()` do navegador que criava uma tarefa
            FANTASMA ("Primeira tarefa de X") só pra a lista passar a existir —
            lixo que a pessoa tinha que apagar depois. Uma lista não precisa ser
            criada: ela é o nome que você digita com `#` na próxima tarefa. Aqui
            o botão só arma a barra de criação com o `#` já escrito. */}
        <button onClick={() => { setQuick((v) => (v.includes("#") ? v : `${v}${v && !v.endsWith(" ") ? " " : ""}#`)); quickRef.current?.focus(); }}
          className="ct-nav" style={{ background: "transparent", color: "var(--text-dim)", fontWeight: 600 }}>
          <Icon name="plus" size={14} color="var(--text-dim)" />
          <span className="ct-nav-txt">Nova lista</span>
        </button>

        {/* ── Etiquetas ─────────────────────────────────────────────────────
            Lista é ONDE a tarefa mora (uma só); etiqueta é COMO ela é (várias).
            Por isso a lista é uma fileira com contador e a etiqueta é uma ficha
            que liga/desliga — a diferença de forma é a diferença de cardinalidade,
            e não uma escolha estética. Mesma regra da criação: `#lista @etiqueta`. */}
        <div className="ct-secao">Etiquetas</div>
        <div className="ct-tags">
          {etiquetas.map((tg) => {
            const on = tagSel === tg;
            return (
              <button key={tg} onClick={() => { setTagSel(on ? null : tg); setSelId(null); }} aria-pressed={on} className="ct-tag"
                style={{ background: on ? "var(--primary-acao, var(--primary))" : "var(--surface-2)", color: on ? "var(--on-primary, #fff)" : "var(--text-dim)", borderColor: on ? "transparent" : "var(--border)" }}>
                {tg}
              </button>
            );
          })}
          <button onClick={() => { setQuick((v) => (v.includes("@") ? v : `${v}${v && !v.endsWith(" ") ? " " : ""}@`)); quickRef.current?.focus(); }}
            className="ct-tag" style={{ background: "transparent", color: "var(--text-dim)", borderColor: "var(--border)", borderStyle: "dashed" }}>
            + Etiqueta
          </button>
        </div>
      </aside>

      {/* ── Coluna 2 · Lista ────────────────────────────────────────────── */}
      <main style={{ minWidth: 0 }}>
        <div className="page-head" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ fontWeight: 800, color: "var(--text)", margin: 0, letterSpacing: "-0.02em" }}>{viewNome}</h1>
            {/* O número numa ficha, e não solto ao lado do título: tamanho de
                título com peso de título fazia "Hoje 5" ler como uma frase. Na
                ficha ele vira o que é — a contagem do que está logo abaixo. */}
            <span className="ct-contagem">{porFiltro.length}</span>
            {/* Recorte ativo: sem isto, "Hoje" com uma etiqueta ligada mostra 2
                de 14 e a tela parece vazia sem dizer por quê. */}
            {(listaSel || tagSel) && (
              <button onClick={() => { setListaSel(null); setTagSel(null); }} className="ct-tag"
                title="Limpar recorte" style={{ background: "var(--surface-2)", color: "var(--text-dim)", borderColor: "var(--border)" }}>
                {listaSel && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: corDaLista(listaSel) }} />{listaSel}</span>}
                {listaSel && tagSel && <span style={{ opacity: 0.5 }}> · </span>}
                {tagSel && <span>@{tagSel}</span>}
                <Icon name="x" size={12} color="var(--text-dim)" />
              </button>
            )}
          </div>
          {/* A explicação some no celular: quem abre a caixa de entrada já sabe
              o que ela é, e a frase custava 40px da única dobra que existe. */}
          {/* A frase acompanha o escopo: em "Enviados" e "Concluídos" dizer que
              "precisa de uma ação sua" seria simplesmente falso. */}
          <div className="desk-only sub" style={{ fontSize: 13.5, color: "var(--text-dim)", marginTop: 2 }}>
            {escopo === "pendencias" ? "O que precisa de uma ação sua."
              : escopo === "enviados" ? "O que você delegou e ainda não voltou."
              : "Histórico do que já foi concluído ou cancelado."}
          </div>
        </div>

        {/* ── Escopo ────────────────────────────────────────────────────────
            A primeira decisão da tela, acima de tudo: é comigo, mandei pra
            alguém, ou já acabou. Rola de lado em 320px como as outras fileiras. */}
        <div className="ct-filtros" role="tablist" aria-label="Escopo" style={{ display: "flex", flexWrap: "wrap", gap: 6, minWidth: 0, marginBottom: 12 }}>
          {ESCOPOS.map((e) => {
            const on = escopo === e.key;
            const n = cntEscopo[e.key];
            return (
              <button key={e.key} role="tab" aria-selected={on} onClick={() => { setEscopo(e.key); setSelId(null); }}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, minHeight: "var(--tap)", padding: "8px 14px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", flex: "none",
                  border: on ? "none" : "1px solid var(--border)", boxShadow: "none",
                  background: on ? "var(--primary-acao, var(--primary))" : "var(--surface)",
                  color: on ? "var(--on-primary, #fff)" : "var(--text-dim)", fontSize: 13, fontWeight: 700 }}>
                <Icon name={e.icon} size={15} color={on ? "var(--on-primary, #fff)" : "var(--text-dim)"} />
                <span className="desk-only">{e.nome}</span><span className="mob-only">{e.curto}</span>
                {n > 0 && <span style={{ fontSize: 11.5, fontWeight: 800, fontVariantNumeric: "tabular-nums", padding: "1px 6px", borderRadius: "var(--r-xs)", background: on ? "rgba(255,255,255,.22)" : "var(--surface-2)", color: on ? "var(--on-primary, #fff)" : "var(--text-dim)" }}>{n}</span>}
              </button>
            );
          })}
        </div>

        {/* Filtros por origem.
            `.ct-filtros`: no computador é uma linha que quebra; no celular
            quebrar significava TRÊS fileiras empilhadas (chips, busca, ordenar,
            visões) e a primeira tarefa nascia abaixo da dobra — a tela inteira
            virava painel de controle. Rolando de lado, tudo cabe em duas. */}
        <div className="ct-filtros" style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {/* "De mensagens" e não "Mensagens": aqui é a tarefa que NASCEU de uma
              conversa, não o módulo de chat — que saiu da Central de vez.
              "Solicitações" saiu da fileira junto com a fila: um filtro que
              nunca mais casa com nada é um botão que só ensina que a tela
              está quebrada. */}
          {([["todas", "Todas"], ["tarefas", "Tarefas"], ["order", "Pedidos"], ["system_issue", "Problemas"], ["message", "De mensagens"]] as const).map(([k, l]) => {
            const on = filtro === k;
            const n = k === "todas" ? daView.length : daView.filter((t) => k === "tarefas" ? (t.origemTipo === "personal" || t.origemTipo === "activity") : t.origemTipo === k).length;
            // Filtro que não casa com nada some da fileira — em vez de virar um
            // botão que leva a uma lista vazia. "Todas" fica sempre.
            if (k !== "todas" && n === 0 && !on) return null;
            return <button key={k} onClick={() => setFiltro(k)} style={{ minHeight: "var(--tap)", padding: "7px 14px", borderRadius: 999, border: on ? "none" : "1px solid var(--border)", cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: on ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: on ? "var(--on-primary, #fff)" : "var(--text-dim)" }}>{l} {n > 0 && <span style={{ opacity: 0.75 }}>{n}</span>}</button>;
          })}
          <span style={{ flex: 1 }} />
          <GlassSelect value={ordem} onChange={(v) => setOrdem(v as typeof ordem)} title="Ordenar" style={{ width: 150, borderRadius: 999 }}
            options={[{ value: "prazo", label: "Ordenar: Prazo" }, { value: "prioridade", label: "Ordenar: Prioridade" }, { value: "criacao", label: "Ordenar: Criação" }]} />
          <SeletorVisao visao={visao} onVisao={setVisao} />
        </div>

        {desfazer && (
          <div key={desfazer.id} className="ct-desfazer" role="status" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", marginBottom: 12 }}>
            <span className="ct-desfazer-relogio" aria-hidden />
            <Icon name="circle-check" size={16} color="var(--ok)" />
            <span style={{ flex: 1, fontSize: 13, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Tarefa concluída: {desfazer.titulo}</span>
            <Botao variante="sutil" tamanho="sm" onClick={() => { aplicar(desfazer.id, { status: "pendente", concluidaAt: null }); setDesfazer(null); }}>Desfazer</Botao>
          </div>
        )}

        {/* Criação rápida — a frase inteira vira a tarefa.
            O `+` cresce e ganha cor quando há texto: o campo mostra que virou
            uma ação armada antes de você procurar o botão. */}
        <div className="ct-compor" data-armado={quick.trim() ? "1" : undefined}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
            <span className="ct-compor-mais"><Icon name="plus" size={18} color="currentColor" /></span>
            <input ref={quickRef} value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") criar(quick); if (e.key === "Escape") setQuick(""); }}
              placeholder="Adicionar tarefa — ex.: ligar pro fornecedor amanhã às 14h !urgente #compras" style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: "var(--text)", fontSize: 14 }} />
            {quick.trim() && <Botao variante="primario" tamanho="sm" onClick={() => criar(quick)} style={{ flex: "none" }}>Criar</Botao>}
          </div>
          <Previa frase={quick} />
        </div>

        {ausente && <div className="glass" style={{ padding: 16, borderRadius: "var(--r-sm)", color: "var(--atencao)", fontSize: 13, marginBottom: 12 }}>Rode o <b>supabase/tarefas.sql</b> no servidor para ativar a Central de Trabalho.</div>}

        {visao === "matriz" ? (
          <MatrizEisenhower
            tarefas={porFiltro} sel={selId} onSel={setSelId} estreito={celular}
            onClassificar={(id, importancia, urgencia) => aplicar(id, { importancia, urgencia })}
          />
        ) : visao === "kanban" ? (
          <KanbanTarefas tarefas={porFiltro} sel={selId} onSel={setSelId}
            onStatus={(id, status) => aplicar(id, { status })} />
        ) : visao === "calendario" ? (
          <CalendarioTarefas tarefas={porFiltro} sel={selId} onSel={setSelId} celular={celular} />
        ) : !comListas
          ? <Secao titulo="" itens={porFiltro} {...{ sel: selId, onSel: setSelId, onConcluir: concluir, onAdiar: abrirAdiar }} />
          : (() => {
            const atr = porFiltro.filter(isAtrasada);
            const hj = porFiltro.filter((t) => isHoje(t) && !isAtrasada(t));
            const prox = porFiltro.filter(isProxima);
            const resto = porFiltro.filter((t) => !isAtrasada(t) && !isHoje(t) && !isProxima(t));
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {atr.length > 0 && <Secao titulo="ATRASADAS" cor="var(--perigo)" itens={atr} sel={selId} onSel={setSelId} onConcluir={concluir} onAdiar={abrirAdiar} />}
                {hj.length > 0 && <Secao titulo="HOJE" itens={hj} sel={selId} onSel={setSelId} onConcluir={concluir} onAdiar={abrirAdiar} />}
                {prox.length > 0 && <Secao titulo="PRÓXIMAS" itens={prox} sel={selId} onSel={setSelId} onConcluir={concluir} onAdiar={abrirAdiar} />}
                {resto.length > 0 && <Secao titulo="SEM PRAZO" itens={resto} sel={selId} onSel={setSelId} onConcluir={concluir} onAdiar={abrirAdiar} />}
                {porFiltro.length === 0 && (
                  <div style={{ padding: "28px 16px", textAlign: "center" }}>
                    <Icon name={escopo === "enviados" ? "send" : "circle-check"} size={26} color="var(--text-dim)" />
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text)", marginTop: 8 }}>
                      {(listaSel || tagSel || busca.trim()) ? "Nada com esse recorte."
                        : escopo === "enviados" ? "Nada esperando resposta." : "Tudo em dia por aqui."}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 3 }}>
                      {(listaSel || tagSel || busca.trim())
                        ? "Tem tarefa nesta visão, só não com o filtro que está ligado."
                        : escopo === "enviados"
                        ? "O que você delegar aparece aqui até a pessoa concluir."
                        : "Nenhuma tarefa precisa da sua atenção agora."}
                    </div>
                    {(listaSel || tagSel || busca.trim()) ? (
                      <Botao onClick={() => { setListaSel(null); setTagSel(null); setBusca(""); }} style={{ marginTop: 12 }}>Limpar filtros</Botao>
                    ) : (
                      <Botao icone="plus" onClick={() => quickRef.current?.focus()} style={{ marginTop: 12 }}>Criar nova tarefa</Botao>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
      </main>

      {/* Um menu de adiar pra tela inteira, e não um por linha: 300 linhas
          renderizariam 300 popovers adormecidos. Ancorado onde a pessoa clicou. */}
      {adiarAlvo && <MenuAdiar alvo={adiarAlvo} celular={celular} onFechar={() => setAdiarAlvo(null)}
        onEscolher={(q) => { adiar(adiarAlvo.t, q); setAdiarAlvo(null); }} />}

      {/* ── Coluna 3 · Detalhes ─────────────────────────────────────────── */}
      {sel && <Detalhe t={sel} onAplicar={aplicar} onFechar={() => setSelId(null)} onRemover={remover} onConcluir={concluir} />}
    </div>
  );
}

// ── Adiar ────────────────────────────────────────────────────────────────────
type QuandoAdiar = "hoje" | "amanha" | "semana" | "nenhum";
const ADIAR_OPCOES: { q: QuandoAdiar; label: string; icone: string }[] = [
  { q: "hoje", label: "Hoje", icone: "calendar" },
  { q: "amanha", label: "Amanhã", icone: "calendar-event" },
  { q: "semana", label: "Semana que vem", icone: "calendar-plus" },
  { q: "nenhum", label: "Sem prazo", icone: "calendar-off" },
];

function MenuAdiar({ alvo, celular, onEscolher, onFechar }: {
  alvo: { t: Tarefa; x: number; y: number }; celular: boolean;
  onEscolher: (q: QuandoAdiar) => void; onFechar: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  const itens = (
    <>
      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)", padding: "6px 10px 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 240 }}>{alvo.t.titulo}</div>
      {ADIAR_OPCOES.map((o) => (
        <button key={o.q} onClick={() => onEscolher(o.q)}
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: "var(--tap)", padding: "9px 10px", borderRadius: "var(--r-xs)", border: "none", cursor: "pointer", background: "transparent", color: "var(--text)", fontSize: 13.5, textAlign: "left" }}>
          <Icon name={o.icone} size={15} color="var(--text-dim)" /> {o.label}
        </button>
      ))}
    </>
  );

  // No celular vira folha presa embaixo: um menu de 200px ancorado num toque
  // perto da borda nasceria metade fora da tela.
  if (celular) {
    return createPortal(
      <div className="sheet-host" onClick={onFechar} style={{ position: "fixed", inset: 0, zIndex: 1300, display: "grid", placeItems: "end center", background: "rgba(0,0,0,.35)" }}>
        <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, borderRadius: "var(--r-lg)", border: "1px solid var(--border)", background: "var(--pop-bg, var(--surface))", padding: 8 }}>{itens}</div>
      </div>, document.body);
  }
  // Preso ao ponto do clique, com folga pra não vazar pela direita/embaixo.
  const x = Math.min(alvo.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 230);
  const y = Math.min(alvo.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 240);
  return createPortal(
    <>
      <div onClick={onFechar} style={{ position: "fixed", inset: 0, zIndex: 1290 }} />
      <div style={{ position: "fixed", left: x, top: y, zIndex: 1300, width: 216, padding: 6, borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "0 18px 46px -18px rgba(0,0,0,.45)" }}>{itens}</div>
    </>, document.body);
}

// ── Pré-visualização do que foi entendido ────────────────────────────────────
// A regra que torna a interpretação aceitável: ela aparece ANTES do Enter. Quem
// digita vê o prazo e a prioridade que vão ser gravados enquanto ainda pode
// apagar uma letra. Sem isto, o sistema estaria decidindo pela pessoa às
// escondidas — e uma decisão que você só descobre depois não é conveniência.
function Previa({ frase }: { frase: string }) {
  const e = useMemo(() => entender(frase), [frase]);
  const fichas: { icone: string; texto: string; cor: string }[] = [];
  const pr = fmtPrazo(e.prazo);
  if (pr) fichas.push({ icone: "calendar", texto: pr.txt, cor: pr.cor });
  if (e.prioridade) fichas.push({ icone: "flag", texto: PRIORIDADE[e.prioridade].label, cor: PRIORIDADE[e.prioridade].cor });
  if (e.lista) fichas.push({ icone: "list", texto: e.lista, cor: "var(--text-dim)" });
  for (const tg of e.tags) fichas.push({ icone: "tag", texto: tg, cor: "var(--text-dim)" });
  if (!fichas.length) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", padding: "0 14px 11px", marginTop: -2 }}>
      <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{e.titulo}</span>
      {fichas.map((f, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: f.cor, padding: "3px 9px", borderRadius: 999, background: "color-mix(in srgb, currentColor 12%, transparent)" }}>
          <Icon name={f.icone} size={11} color={f.cor} />{f.texto}
        </span>
      ))}
    </div>
  );
}

// ── Linha da lista ───────────────────────────────────────────────────────────
// A linha deixou de ser um CARTÃO (borda de 1px + 8px de vão, um por tarefa) e
// virou uma FILEIRA separada por fio. Com 40 tarefas, 40 molduras competiam
// entre si e nenhuma delas era informação: o que separa uma tarefa da seguinte
// é o próprio texto. Sem as bordas a mesma dobra mostra ~40% mais tarefas, e a
// única moldura que sobrou — a da linha selecionada — passou a significar algo.
function Linha({ t, sel, onSel, onConcluir, onAdiar, style }: { t: Tarefa; sel: string | null; onSel: (id: string) => void; onConcluir: (t: Tarefa) => void; onAdiar: (t: Tarefa, x: number, y: number) => void; style?: CSSProperties }) {
  const feita = t.status === "concluida";
  const pr = fmtPrazo(t.prazo);
  const org = ORIGEM[t.origemTipo] ?? ORIGEM.personal;
  const subs = t.subtarefas.length;
  const subsFeitas = t.subtarefas.filter((s) => s.feita).length;
  const prio = PRIORIDADE[t.prioridade];
  // A prioridade vive NA caixinha, não numa etiqueta ao lado. Era a informação
  // mais repetida da lista ("Média" em toda linha) ocupando a mesma largura da
  // que interessa. Como cor do círculo ela não custa linha nenhuma, e "Média"
  // — que é o padrão de toda tarefa — deixa de ser dita em voz alta.
  const corCheck = t.prioridade === "media" ? "var(--border-forte, var(--border))" : prio.cor;
  return (
    // A linha NÃO é `role="button"`: ela já contém botões (concluir, adiar), e
    // controle dentro de controle não tem nome acessível nem ordem de foco que
    // funcione. O clique no corpo continua abrindo (mouse), e quem chega pelo
    // teclado abre pelo chevron — que é um botão de verdade, com rótulo.
    <div onClick={() => onSel(t.id)} className="ct-linha" data-tarefa={t.id} data-sel={sel === t.id ? "1" : undefined} style={style}>
      {ehVirtual(t.id) ? (
        // Atividade da empresa não tem caixinha: ela conclui em Minhas
        // atividades. Um check que não faz nada é pior que nenhum check.
        <span title="Atividade da empresa — abra os detalhes pra ir até ela"
          style={{ marginTop: 1, width: 20, height: 20, flex: "none", display: "grid", placeItems: "center" }}>
          <Icon name={org.icon} size={15} color={org.cor} />
        </span>
      ) : (
        // Concluir é a ação principal da linha: o círculo continua com 20px, mas
        // o padding + margem negativa fazem o alvo de toque virar 44x44 sem mexer
        // no layout (a fundação sozinha esticaria a caixa pra 20x44).
        <button onClick={(e) => { e.stopPropagation(); onConcluir(t); }} aria-label={feita ? "Reabrir tarefa" : "Concluir tarefa"}
          title={feita ? "Reabrir" : `Concluir · prioridade ${prio.label.toLowerCase()}`}
          className="ct-check-alvo"
          style={{ padding: 12, margin: "-11px -12px -12px", flex: "none", cursor: "pointer", display: "grid", placeItems: "center", border: "none", background: "none", lineHeight: 0 }}>
          <span className="ct-check" data-feita={feita ? "1" : undefined}
            style={{ borderColor: corCheck, background: feita ? "var(--ok)" : "transparent", color: corCheck }}>
            <Icon name="check" size={12} color={feita ? "var(--on-primary, #fff)" : "currentColor"} />
          </span>
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ct-titulo" style={{ color: feita ? "var(--text-dim)" : "var(--text)", textDecoration: feita ? "line-through" : "none" }}>{t.titulo}</div>
        {/* Metadados como FICHAS, não como texto separado por "·". Cada ficha é
            um dado de um tipo (quando, onde, quanto), e a de prazo carrega a cor
            do estado — atrasada em vermelho é a única coisa da linha que precisa
            gritar. A origem só aparece quando NÃO é tarefa pessoal: dizer
            "Tarefa pessoal" em toda linha de uma lista de tarefas é ruído. */}
        <div className="ct-fichas">
          {/* O prazo é o campo que mais muda depois de a tarefa existir — então
              ele é um BOTÃO, não um rótulo. Sem prazo aparece um "Prazo"
              discreto: a ação tem que existir antes de haver o que adiar, senão
              a tarefa sem data é a que nunca ganha uma. */}
          {!feita && !ehVirtual(t.id) ? (
            <button onClick={(e) => { e.stopPropagation(); onAdiar(t, e.clientX, e.clientY); }}
              title="Adiar (E)" aria-label={pr ? `Prazo ${pr.txt} — adiar` : "Definir prazo"}
              className="ct-ficha ct-ficha-btn" style={{ color: pr ? pr.cor : "var(--text-dim)" }}>
              <Icon name={pr ? "calendar" : "calendar-plus"} size={11} color="currentColor" />{pr ? pr.txt : "Prazo"}
            </button>
          ) : pr && (
            <span className="ct-ficha" style={{ color: pr.cor }}><Icon name="calendar" size={11} color="currentColor" />{pr.txt}</span>
          )}
          {subs > 0 && (
            <span className="ct-ficha" title={`${subsFeitas} de ${subs} subtarefas`}>
              <Icon name="checklist" size={11} color="currentColor" />{subsFeitas}/{subs}
            </span>
          )}
          {t.lista && (
            <span className="ct-ficha" title={`Lista ${t.lista}`}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: corDaLista(t.lista) }} />{t.lista}
            </span>
          )}
          {/* `ct-ficha-sec` = some no celular. Não é "menos importante", é MENOS
              URGENTE de saber sem abrir: em 320px sete fichas empilhavam e uma
              tarefa passava de 250px de altura — a lista virava um cartão por
              dobra. Quando/quantas/onde ficam; quem e de onde veio estão a um
              toque, no painel. */}
          {t.tags.map((tg) => <span key={tg} className="ct-ficha ct-ficha-sec">@{tg}</span>)}
          {t.origemTipo !== "personal" && (
            <span className="ct-ficha ct-ficha-sec" style={{ color: org.cor }}>
              <Icon name={org.icon} size={11} color="currentColor" />{t.origemLabel || org.label}
            </span>
          )}
          {t.responsavelNome && <span className="ct-ficha ct-ficha-sec"><Icon name="user" size={11} color="currentColor" />{t.responsavelNome.split(" ")[0]}</span>}
        </div>
      </div>
      {/* O chevron não é decoração: ele é o que promete que a linha ABRE (o
          painel de detalhe era um segredo — a linha parecia só um item com uma
          caixinha) E é o caminho de teclado pra abrir. Fica opaco de leve e
          firma no hover/foco. */}
      <button onClick={(e) => { e.stopPropagation(); onSel(t.id); }} className="ct-abrir"
        aria-label={`Abrir detalhes: ${t.titulo}`} aria-expanded={sel === t.id}>
        <Icon name="chevron-right" size={16} color="var(--text-dim)" />
      </button>
    </div>
  );
}

function Secao({ titulo, cor, itens, sel, onSel, onConcluir, onAdiar }: { titulo: string; cor?: string; itens: Tarefa[]; sel: string | null; onSel: (id: string) => void; onConcluir: (t: Tarefa) => void; onAdiar: (t: Tarefa, x: number, y: number) => void }) {
  return (
    <div>
      {titulo && <div className="ct-secao-lista" style={{ color: cor || "var(--text-dim)" }}>{titulo} <span style={{ opacity: 0.6 }}>{itens.length}</span></div>}
      <Fila className="ct-lista">
        {itens.map((t) => <Linha key={t.id} t={t} sel={sel} onSel={onSel} onConcluir={onConcluir} onAdiar={onAdiar} />)}
      </Fila>
    </div>
  );
}

// A gaveta "Concluídas" no pé da caixa de entrada saiu: agora é uma das três
// pílulas do topo, e um recolhível repetindo a mesma lista no rodapé era o tipo
// de duplicata que fazia a tela parecer maior do que é.

// ── Painel de detalhes ───────────────────────────────────────────────────────
interface Comentario { id: string; autorNome: string | null; texto: string; createdAt: string }
interface Evento { id: string; acao: string; detalhe: string | null; autorNome: string | null; createdAt: string }
const ACAO_LBL: Record<string, string> = { criou: "criou a tarefa", status: "alterou o status", prioridade: "alterou a prioridade", prazo: "alterou o prazo", responsavel: "alterou o responsável", comentou: "comentou", concluiu: "concluiu a tarefa", reabriu: "reabriu a tarefa" };

function Detalhe({ t, onAplicar, onFechar, onRemover, onConcluir }: { t: Tarefa; onAplicar: (id: string, p: Partial<Tarefa>) => void; onFechar: () => void; onRemover: (id: string) => void; onConcluir: (t: Tarefa) => void }) {
  const [novaSub, setNovaSub] = useState("");
  const [aba, setAba] = useState<"detalhes" | "comentarios" | "atividade">("detalhes");
  const [coments, setComents] = useState<Comentario[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [novoComent, setNovoComent] = useState("");
  // Excluir pede confirmação NO LUGAR do botão, e não num modal: a pergunta
  // aparece onde a mão já está, e trocar de tarefa a cancela sozinha.
  const [confirmar, setConfirmar] = useState(false);
  const virtual = ehVirtual(t.id);
  useEffect(() => {
    setAba("detalhes"); setComents([]); setEventos([]); setConfirmar(false);
    if (virtual) return;
    // Resposta atrasada de outra tarefa é descartada: trocar de tarefa antes
    // de a busca voltar não pode encher o painel novo com o que era da antiga.
    let atual = true;
    fetch(`/api/tarefas/detalhe?id=${t.id}`, { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (!atual) return; setComents(j.comentarios ?? []); setEventos(j.historico ?? []); }).catch(() => {});
    return () => { atual = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id]);
  async function comentar() {
    if (!novoComent.trim()) return;
    const r = await fetch("/api/tarefas/detalhe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, texto: novoComent }) });
    const j = await r.json();
    if (j.ok) { setComents((v) => [...v, j.comentario]); setNovoComent(""); }
  }
  const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const org = ORIGEM[t.origemTipo] ?? ORIGEM.personal;
  const subsFeitas = t.subtarefas.filter((s) => s.feita).length;
  const pct = t.subtarefas.length ? Math.round((subsFeitas / t.subtarefas.length) * 100) : 0;
  const feita = t.status === "concluida";
  // Mesma regra da linha: a prioridade é a cor do círculo, e "Média" (o padrão)
  // não pinta nada — senão toda tarefa nasceria com um aviso amarelo.
  const corCheck = t.prioridade === "media" ? "var(--border-forte, var(--border))" : PRIORIDADE[t.prioridade].cor;

  function setSub(subtarefas: Subtarefa[]) { onAplicar(t.id, { subtarefas }); }
  function addSub() { if (!novaSub.trim()) return; setSub([...t.subtarefas, { id: crypto.randomUUID(), titulo: novaSub.trim(), feita: false }]); setNovaSub(""); }
  function toggleSub(id: string) { setSub(t.subtarefas.map((s) => (s.id === id ? { ...s, feita: !s.feita } : s))); }

  // Rótulo + valor: no painel largo ficam lado a lado (130px + resto, como antes);
  // quando o painel é a tela toda do celular o valor não cabe em ~144px e cai pra
  // linha de baixo sozinho. É flex-wrap, não media query — desktop idêntico.
  const campo = (icon: string, label: string, valor: React.ReactNode) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", alignItems: "center", padding: "7px 0" }}>
      <span style={{ flex: "0 0 130px", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-dim)" }}><Icon name={icon} size={15} color="var(--text-dim)" />{label}</span>
      <span style={{ flex: "1 1 150px", minWidth: 0, fontSize: 13, color: "var(--text)" }}>{valor}</span>
    </div>
  );

  return (
    <aside className="ct-detalhe" style={{ position: "sticky", top: 8, alignSelf: "start", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface)", maxHeight: "calc(100dvh - 96px)", overflowY: "auto" }}>
      {/* Cabeçalho GRUDADO no topo do painel: com comentários longos, fechar e
          concluir sumiam pra cima e só voltavam rolando de volta. Translúcido
          pra o conteúdo passar por baixo em vez de bater num degrau opaco. */}
      <div className="ct-detalhe-topo">
        <button onClick={() => onConcluir(t)} aria-label={feita ? "Reabrir tarefa" : "Concluir tarefa"} disabled={virtual}
          className="ct-check-alvo"
          style={{ padding: 12, margin: -12, cursor: virtual ? "default" : "pointer", display: "grid", placeItems: "center", border: "none", background: "none", lineHeight: 0, opacity: virtual ? 0.4 : 1 }}>
          <span className="ct-check" data-feita={feita ? "1" : undefined}
            style={{ borderColor: corCheck, background: feita ? "var(--ok)" : "transparent", color: corCheck }}>
            <Icon name="check" size={12} color={feita ? "var(--on-primary, #fff)" : "currentColor"} />
          </span>
        </button>
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em" }}>
          {feita ? "Concluída" : "Tarefa"}
        </span>
        <button onClick={onFechar} title="Fechar" aria-label="Fechar detalhes"
          style={{ padding: 12, margin: -12, border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center" }}>
          <Icon name="x" size={17} color="var(--text-dim)" />
        </button>
      </div>

      {!virtual && (
        // .tab-strip: as três abas não cabem em 320px — passam a rolar de lado em
        // vez de serem cortadas. borderRadius 0 mantém o desktop igual.
        <div className="tab-strip" style={{ display: "flex", gap: 2, padding: "8px 14px 0", borderRadius: 0, borderBottom: "1px solid var(--border)" }}>
          {([["detalhes", "Detalhes"], ["comentarios", `Comentários${coments.length ? ` ${coments.length}` : ""}`], ["atividade", "Atividade"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setAba(k)} aria-current={aba === k ? "page" : undefined} style={{ padding: "8px 12px", border: "none", cursor: "pointer", background: "transparent", fontSize: 13, fontWeight: 700, color: aba === k ? "var(--text)" : "var(--text-dim)", borderBottom: aba === k ? "2px solid var(--primary)" : "2px solid transparent" }}>{l}</button>
          ))}
        </div>
      )}

      {aba === "comentarios" && (
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          {coments.length === 0 && <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Sem comentários ainda.</div>}
          {coments.map((c) => (
            <div key={c.id} style={{ borderLeft: "2px solid var(--border)", paddingLeft: 10 }}>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}><b style={{ color: "var(--text)" }}>{c.autorNome || "Alguém"}</b> · {quando(c.createdAt)}</div>
              <div style={{ fontSize: 13.5, color: "var(--text)", marginTop: 2, lineHeight: 1.45 }}>
                <TextoComCodigo texto={c.texto} />
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <input value={novoComent} onChange={(e) => setNovoComent(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") comentar(); }} placeholder="Escrever comentário…" style={{ flex: 1, padding: "9px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface-2, transparent)", color: "var(--text)", fontSize: 13 }} />
            <Botao variante="primario" onClick={comentar} disabled={!novoComent.trim()}>Enviar</Botao>
          </div>
        </div>
      )}

      {aba === "atividade" && (
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          {eventos.length === 0 && <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Sem eventos registrados.</div>}
          {eventos.map((e) => (
            <div key={e.id} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
              <Icon name="history" size={14} color="var(--text-dim)" />
              <div style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.4 }}>
                <b>{e.autorNome || "Alguém"}</b> {ACAO_LBL[e.acao] ?? e.acao}{e.detalhe ? ` ${e.detalhe}` : ""}
                <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{quando(e.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {aba === "detalhes" && <div style={{ padding: 18 }}>
        <input value={t.titulo} onChange={(e) => onAplicar(t.id, { titulo: e.target.value })}
          style={{ width: "100%", boxSizing: "border-box", border: "none", outline: "none", background: "transparent", color: "var(--text)", fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em", marginBottom: 4 }} />
        {t.origemLabel && <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 14 }}>Criada a partir de {t.origemLabel}</div>}

        <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "6px 0", marginBottom: 16 }}>
          {campo("circle-check", "Status", (
            <GlassSelect value={t.status} onChange={(v) => onAplicar(t.id, { status: v as TarefaStatus })} style={{ maxWidth: 190 }}
              options={(Object.keys(STATUS) as TarefaStatus[]).map((s) => ({ value: s, label: STATUS[s].label }))} />
          ))}
          {campo("flag", "Prioridade", (
            <GlassSelect value={t.prioridade} onChange={(v) => onAplicar(t.id, { prioridade: v as TarefaPrioridade })} style={{ maxWidth: 190 }}
              options={(Object.keys(PRIORIDADE) as TarefaPrioridade[]).map((p) => ({ value: p, label: PRIORIDADE[p].label }))} />
          ))}
          {campo("user", "Responsável", t.responsavelNome || "—")}
          {campo("calendar", "Prazo", (
            <GlassDate withTime value={t.prazo ? new Date(new Date(t.prazo).getTime() - 3 * 3600e3).toISOString().slice(0, 16) : ""}
              onChange={(v) => onAplicar(t.id, { prazo: v ? new Date(new Date(v).getTime() + 3 * 3600e3).toISOString() : null })}
              placeholder="Sem prazo" style={{ minHeight: 32, padding: "5px 9px", fontSize: 12.5 }} />
          ))}
          {campo("target", "Origem", <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name={org.icon} size={14} color={org.cor} />{t.origemLabel || org.label}</span>)}
          {t.setor && campo("building-warehouse", "Setor", t.setor)}
          {t.tags.length > 0 && campo("tag", "Tags", <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>{t.tags.map((tg) => <span key={tg} style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary-texto, var(--primary))" }}>{tg}</span>)}</span>)}
        </div>

        {/* Descrição */}
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text-dim)", marginBottom: 6 }}>Descrição</div>
        <textarea value={t.descricao ?? ""} onChange={(e) => onAplicar(t.id, { descricao: e.target.value })} placeholder="Adicione detalhes…" rows={3}
          style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "9px 11px", background: "var(--surface-2, transparent)", color: "var(--text)", fontSize: 13, resize: "vertical", marginBottom: 16 }} />

        {/* Subtarefas */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text-dim)" }}>Subtarefas</span>
          {t.subtarefas.length > 0 && <>
            <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{subsFeitas}/{t.subtarefas.length}</span>
            <div style={{ flex: 1, height: 6, borderRadius: 4, background: "var(--surface-2, var(--border))", overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: "var(--primary)", borderRadius: 4 }} /></div>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)" }}>{pct}%</span>
          </>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
          {t.subtarefas.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0" }}>
              <button onClick={() => toggleSub(s.id)} aria-label={s.feita ? "Desmarcar subtarefa" : "Marcar subtarefa"}
                className="ct-check-alvo"
                style={{ padding: 13, margin: -13, flex: "none", cursor: "pointer", display: "grid", placeItems: "center", border: "none", background: "none", lineHeight: 0 }}>
                <span className="ct-check ct-check-sub" data-feita={s.feita ? "1" : undefined}
                  style={{ borderColor: "var(--border-forte, var(--border))", background: s.feita ? "var(--primary)" : "transparent", color: "var(--border-forte, var(--border))" }}>
                  <Icon name="check" size={10} color={s.feita ? "var(--on-primary, #fff)" : "currentColor"} />
                </span>
              </button>
              <span style={{ fontSize: 13, color: s.feita ? "var(--text-dim)" : "var(--text)", textDecoration: s.feita ? "line-through" : "none" }}>{s.titulo}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name="plus" size={14} color="var(--text-dim)" />
          <input value={novaSub} onChange={(e) => setNovaSub(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addSub(); }} placeholder="Adicionar subtarefa" style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--text)", fontSize: 13 }} />
        </div>

        {/* Delegada: avisar o criador quando concluir */}
        {t.criadorId !== t.responsavelId && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 12.5, color: "var(--text-dim)", cursor: "pointer" }}>
            <Caixa marcado={t.avisarConclusao} onChange={(marc) => onAplicar(t.id, { avisarConclusao: marc })} />
            Avisar quando for concluída
          </label>
        )}
        {virtual && (
          <a href="/minhas-atividades" style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 14, fontSize: 13, fontWeight: 700, color: "var(--primary-texto, var(--primary))", textDecoration: "none" }}>
            Abrir em Minhas atividades <Icon name="chevron-right" size={14} color="var(--primary-texto)" />
          </a>
        )}
      </div>}

      {/* Rodapé grudado embaixo. Não existe "Salvar": o painel escreve a cada
          alteração e o erro volta pelo toast — um botão de salvar aqui só
          criaria a dúvida de se o que já apareceu na lista foi ou não gravado.
          Sobra a ação que PRECISA de um lugar fixo: excluir. Ela fica longe do
          check de concluir (a outra ponta do painel) porque as duas tiram a
          tarefa da lista, e só uma tem volta. */}
      {!virtual && aba === "detalhes" && (
        <div className="ct-detalhe-pe">
          <span style={{ flex: 1, fontSize: 11.5, color: "var(--text-dim)" }}>Salvo automaticamente</span>
          {confirmar ? (
            <>
              <Botao tamanho="sm" onClick={() => setConfirmar(false)}>Cancelar</Botao>
              <Botao variante="perigo" tamanho="sm" onClick={() => onRemover(t.id)}>Excluir mesmo</Botao>
            </>
          ) : (
            <Botao variante="perigo" tamanho="sm" icone="trash" onClick={() => setConfirmar(true)} title="Excluir tarefa">Excluir</Botao>
          )}
        </div>
      )}
    </aside>
  );
}
