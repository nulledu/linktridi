"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LogisticaSnapshot, LogiPedido, Check } from "@/lib/logistica";
import type { TimelinePedido } from "@/lib/logistica-pedido";
import { Icon } from "../Icon";
import { BotaoIcone, Chip } from "../ui/controles";
import { Abas } from "../ui/Abas";
import { DataList, type Coluna } from "../ui/DataList";
import { Selo } from "../ui/primitives";
import { CartaoPainel } from "../ui/CartaoPainel";
import { SkeletonDashboard } from "../Skeleton";
import { GlassSelect } from "../GlassPicker";
import { CaixaBusca } from "./CaixaBusca";
import { Ritmo } from "./Ritmo";
import { CopyId } from "../CopyId";
import { grade } from "../ui/grade";
import { agendarComRecuo } from "../ui/usePoll";
import { PageHead } from "../ui/mobile";
import { montarVisaoLogistica, DIAS_ATRASO } from "@/lib/logistica-visao";
import { PainelLogistica } from "./PainelLogistica";
import { Fila, TrocaIcone, useAbrirFechar } from "../ui/micro";

// Três estados, três cores. "Indefinido" é vermelho de propósito: dado que o
// ERP não respondeu é motivo para conferir, não para liberar o pedido.
const COR_CHECK: Record<Check["estado"], string> = {
  ok: "var(--ok)", bloqueio: "var(--perigo)", indefinido: "var(--perigo)",
};
const ICONE_CHECK: Record<Check["estado"], string> = {
  ok: "circle-check", bloqueio: "circle-x", indefinido: "help-circle",
};

// Logística: cards por categoria (Entrada, Status Almofada, Etiqueta Pendente,
// Pronto p/ Envio) com Δ antes→agora e detalhamento de sub-status. Ao vivo do ERP.
export function LogisticaClient() {
  const [snap, setSnap] = useState<LogisticaSnapshot | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const r = await fetch("/api/logistica", { cache: "no-store" });
        const d = await r.json();
        if (!active) return;
        if (d?.updatedAt) { setSnap(d); setErr(false); } else setErr(true);
      } catch { /* mantém */ }
    }
    load();
    // Aba em segundo plano não recarrega (ver CLAUDE.md, "o tick comum tem que
    // voltar VAZIO"); ao voltar pra aba, atualiza na hora.
    // 1min pra quem está mexendo; recua até 5min na tela aberta e esquecida
    // (o `document.hidden` não pega o monitor secundário — ver `usePoll.ts`).
    const parar = agendarComRecuo(load, 60_000, 300_000);
    return () => { active = false; parar(); };
  }, []);

  if (!snap) {
    if (err) return (
      <div>
        <PageHead title="Logística" />
        <div className="glass" style={{ padding: 40, borderRadius: 22, textAlign: "center", color: "var(--text-dim)" }}>
          Não foi possível carregar os dados de logística do ERP.
        </div>
      </div>
    );
    return <SkeletonDashboard title="Logística" />;
  }

  return <LogisticaTela snap={snap} />;
}

/** O painel do topo (desenho da Operação) + a fila completa embaixo. Separado
 *  do carregamento pra poder ser montado com dados de prova no /dev-mobile. */
export function LogisticaTela({ snap }: { snap: LogisticaSnapshot }) {
  const visao = useMemo(() => montarVisaoLogistica(snap), [snap]);
  const [aberto, setAberto] = useState<LogiPedido | null>(null);
  const ficha = useAbrirFechar(!!aberto, "--modal-close-dur");
  const ultimo = useRef<LogiPedido | null>(null);
  if (aberto) ultimo.current = aberto;
  const filaRef = useRef<HTMLElement>(null);
  const buscaRef = useRef<HTMLDivElement>(null);
  const irPraFila = () => filaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const irPraBusca = () => {
    buscaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    buscaRef.current?.querySelector("input")?.focus({ preventScroll: true });
  };

  return (
    <div>
      <PainelLogistica visao={visao} falta={snap.faltaProducao} hoje={snap.updatedAt}
        onAbrir={setAberto} onFila={irPraFila} onBusca={irPraBusca} />

      {/* A fila completa: o painel responde "como está"; aqui se trabalha
          pedido por pedido. A busca de caixa fica no topo dela porque é
          pergunta de urgência — alguém está com um pedido sumido na mão. */}
      <section ref={filaRef} id="fila" className="lg-fila og-grade">
        <FilaPedidos entrada={snap.entradaPedidos} logistica={snap.logisticaPedidos} />
        <div ref={buscaRef} className="og-lado"><CaixaBusca /></div>
      </section>
      {/* Ritmo do setor — começa fechado porque a leitura de chegadas é cara */}
      <Ritmo />

      {ficha.montado && ultimo.current && (
        <PedidoModal p={ultimo.current} cor="var(--primary)" classe={ficha.classe} onClose={() => setAberto(null)} />
      )}
    </div>
  );
}

type Etapa = "entrada" | "logistica";
const FILTRO_TODOS = "", FILTRO_PRONTO = "__pronto__", FILTRO_INDEF = "__indefinido__";

/**
 * A fila de trabalho: um cartão só, com as duas etapas em abas (antes eram
 * dois painéis empilhados com a mesma cara). Filtro por pendência em chips do
 * kit, busca por caixa/pedido/cliente e ordem; a lista é o `DataList` — no
 * celular vira card sozinha. Tocar no pedido abre a ficha.
 */
export function FilaPedidos({ entrada, logistica }: { entrada: LogiPedido[]; logistica: LogiPedido[] }) {
  const [etapa, setEtapa] = useState<Etapa>(entrada.length || !logistica.length ? "entrada" : "logistica");
  const [pend, setPend] = useState(FILTRO_TODOS);
  const [ordem, setOrdem] = useState("antigo");
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState<LogiPedido | null>(null);
  const ficha = useAbrirFechar(!!aberto, "--modal-close-dur");
  const ultimo = useRef<LogiPedido | null>(null);
  if (aberto) ultimo.current = aberto;

  const pedidos = etapa === "entrada" ? entrada : logistica;
  const trocar = (e: Etapa) => { setEtapa(e); setPend(FILTRO_TODOS); };

  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pedidos) for (const x of p.pendencias) m.set(x, (m.get(x) || 0) + 1);
    return {
      lista: [...m.entries()].sort((a, b) => b[1] - a[1]),
      prontos: pedidos.filter((p) => p.pronto).length,
      indefinidos: pedidos.filter((p) => p.indefinido).length,
    };
  }, [pedidos]);

  const lista = useMemo(() => {
    let l = pedidos;
    if (pend === FILTRO_PRONTO) l = l.filter((p) => p.pronto);
    else if (pend === FILTRO_INDEF) l = l.filter((p) => p.indefinido);
    else if (pend) l = l.filter((p) => p.pendencias.includes(pend));
    const t = q.trim().toLowerCase();
    if (t) l = l.filter((p) => [p.caixa, p.idProprio, String(p.id), p.nome, p.cliente, p.responsavel].some((x) => x?.toLowerCase().includes(t)));
    const caixaNum = (p: LogiPedido) => (p.caixa && /^\d+$/.test(p.caixa) ? parseInt(p.caixa) : Infinity);
    return [...l].sort((a, b) =>
      ordem === "caixa" ? caixaNum(a) - caixaNum(b)
        : ordem === "recente" ? (b.dataAprovado || "").localeCompare(a.dataAprovado || "")
          : (a.dataAprovado || "9999").localeCompare(b.dataAprovado || ""));
  }, [pedidos, pend, q, ordem]);

  const colunas: Coluna<LogiPedido>[] = [
    { chave: "caixa", titulo: "Caixa", largura: 76, render: (p) => <span className="lg-caixa" data-vazia={p.caixa ? undefined : "1"}>{p.caixa ? `#${p.caixa}` : "s/cx"}</span> },
    { chave: "pedido", titulo: "Pedido", papel: "titulo", render: (p) => (
      <span style={{ display: "grid", minWidth: 0 }}>
        <b className="lg-corta">{p.nome ?? p.cliente}</b>
        <span className="og-linha-sub">#{p.idProprio ?? p.id}{p.responsavel ? ` · ${p.responsavel.split(" ")[0]}` : ""}</span>
      </span>
    ) },
    { chave: "itens", titulo: "Itens", render: (p) => (
      <span className="lg-itens" title={`${p.feitos} de ${p.itens.length || p.feitos + p.faltam} feitos`}>
        <span className="lg-barra"><span style={{ width: `${Math.round((p.feitos / Math.max(1, p.feitos + p.faltam)) * 100)}%` }} /></span>
        <span className="mt-num">{p.feitos}/{p.feitos + p.faltam}</span>
      </span>
    ) },
    { chave: "pend", titulo: "Situação", render: (p) => (
      <span className="lg-selos">
        {p.urgente && <Selo tom="perigo">Urgente</Selo>}
        {p.pronto ? <Selo tom="ok">Pronto p/ avançar</Selo>
          : p.pendencias.length ? p.pendencias.slice(0, 2).map((x) => <Selo key={x} tom={p.indefinido ? "atencao" : "neutro"}>{x}</Selo>)
            : <Selo tom="atencao">Conferir</Selo>}
        {p.pendencias.length > 2 && <Selo tom="neutro">+{p.pendencias.length - 2}</Selo>}
      </span>
    ) },
    { chave: "dias", titulo: "Na fila", alinhar: "right", largura: 80, ordenar: (p) => p.dias,
      render: (p) => <span className="lg-num" data-atraso={p.dias >= DIAS_ATRASO ? "1" : undefined}>{p.dias} d</span> },
  ];

  const filtros = [
    { v: FILTRO_TODOS, rotulo: "Todos", conta: pedidos.length },
    ...(contagem.prontos ? [{ v: FILTRO_PRONTO, rotulo: "Pronto p/ avançar", conta: contagem.prontos }] : []),
    ...(contagem.indefinidos ? [{ v: FILTRO_INDEF, rotulo: "Motivo não identificado", conta: contagem.indefinidos }] : []),
    ...contagem.lista.map(([rotulo, conta]) => ({ v: rotulo, rotulo, conta })),
  ];

  return (
    <CartaoPainel icone="list-details" titulo="Fila de pedidos" sub={`${lista.length} de ${pedidos.length} pedidos nesta etapa`}>
      <Abas ariaLabel="Etapa da fila" valor={etapa} onMuda={trocar} itens={[
        { valor: "entrada", rotulo: "Entrada Logística", badge: <span className="ui-chip-conta mt-num lg-aba-conta">{entrada.length}</span> },
        { valor: "logistica", rotulo: "Em Logística", badge: <span className="ui-chip-conta mt-num lg-aba-conta">{logistica.length}</span> },
      ]} />
      <div className="lg-ferramentas">
        <label className="cx-campo">
          <Icon name="search" size={16} color="var(--text-dim)" />
          <input className="ui-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caixa, pedido, cliente ou vendedora" aria-label="Buscar na fila" />
        </label>
        <GlassSelect value={ordem} onChange={setOrdem} style={{ width: "auto", minWidth: 190 }} options={[
          { value: "antigo", label: "Aprovação mais antiga" },
          { value: "recente", label: "Aprovação mais recente" },
          { value: "caixa", label: "Número da caixa" },
        ]} />
      </div>
      {/* Seleção única de pendência: chip do kit, marcado só no ativo. */}
      <div role="group" aria-label="Filtrar por situação" className="ui-chips tab-strip">
        {filtros.map((f) => (
          <Chip key={f.v || "todos"} ativo={pend === f.v} conta={f.conta}
            onClick={() => setPend(pend === f.v && f.v ? FILTRO_TODOS : f.v)}>{f.rotulo}</Chip>
        ))}
      </div>
      <DataList itens={lista} colunas={colunas} chaveDe={(p) => String(p.id)} onAbrir={setAberto}
        rotulo="Fila de pedidos" vazio="Nada nesta etapa com o filtro atual." minWidth={640} />
      {ficha.montado && ultimo.current && (
        <PedidoModal p={ultimo.current} cor="var(--primary)" classe={ficha.classe} onClose={() => setAberto(null)} />
      )}
    </CartaoPainel>
  );
}

// Popup com o detalhamento do pedido (antes era expansão pra baixo).
//
// `classe` vem de fora (`useAbrirFechar` no painel): é ela que faz a folha
// crescer ao abrir e dar um passo atrás ao sair — mais rápido do que entrou,
// porque fechar é sair da frente, não um segundo espetáculo.
function PedidoModal({ p, cor, classe, onClose }: { p: LogiPedido; cor: string; classe: string; onClose: () => void }) {
  // Todo item não-feito vai pra "Falta produzir" (com tamanho/nome/foto); todo
  // item feito vai pra "Já feito". Sem filtro por pendência (não esconde nada).
  const falta = p.itens.filter((i) => !i.feito);
  const feito = p.itens.filter((i) => i.feito);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className={`apple-backdrop sheet-host ${classe}`.trim()} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, display: "grid", placeItems: "center", padding: 20 }}>
      {/* padding em clamp: 32px acima de 800px de viewport (desktop intacto) e
          16px no celular — 64px fixos comiam um quinto da tela de 320px. */}
      <div className={`apple-modal glass sheet t-modal ${classe}`.trim()} onClick={(e) => e.stopPropagation()} style={{ width: "min(1280px, 100%)", maxHeight: "94dvh", overflowY: "auto", borderRadius: 22, padding: "clamp(16px, 4vw, 32px)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ flex: "none", minWidth: 52, textAlign: "center", fontWeight: 800, fontSize: 15, color: p.caixa ? cor : "var(--text-dim)", background: `color-mix(in srgb, ${cor} 14%, transparent)`, borderRadius: 8, padding: "5px 9px" }}>
            {p.caixa ? `#${p.caixa}` : "s/cx"}
          </span>
          {/* base de 150px: no celular o nome do cliente cai numa linha só sua em
              vez de virar "R…" espremido entre o nº da caixa e o botão de fechar. */}
          <div style={{ minWidth: 0, flex: "1 1 150px" }}>
            <div style={{ fontSize: 16, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.cliente}</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{p.feitos}/{p.itens.length} feitos · {p.dias}d desde aprovação</div>
          </div>
          {p.urgente && <span style={{ fontSize: 11, fontWeight: 800, color: "var(--perigo)", background: "color-mix(in srgb, var(--perigo) 16%, transparent)", padding: "3px 9px", borderRadius: 6, flex: "none" }}>URGENTE</span>}
          {/* 32px é metade de um alvo de toque: no celular fechar virava mira.
              A onda confirma que o toque chegou antes de a folha sair. */}
          <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={onClose} style={{ flex: "none", marginLeft: "auto" }} />
        </div>

        {/* O que trava — checklist item por item, com o motivo. É o bloco que
            responde "por que esse pedido não avança". */}
        <Checklist checks={p.checks} pronto={p.pronto} dias={p.dias} />

        {/* Contato + metadados */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16, fontSize: 11.5, color: "var(--text-dim)" }}>
          <CopyId id={p.idProprio ?? p.id} />
          {p.nome && <span style={{ color: "var(--text)", fontWeight: 600 }}>{p.nome}</span>}
          {p.contato && (
            <a href={`https://wa.me/${p.contato.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: "var(--tap)", color: "var(--ok)", textDecoration: "none" }}>
              <Icon name="brand-whatsapp" size={13} color="var(--ok)" /> {p.contato}
            </a>
          )}
          {p.caixa && <span>Caixa #{p.caixa}</span>}
          {p.responsavel && <span><Icon name="user" size={11} /> {p.responsavel}</span>}
          {p.criadoEm && <span title="Entrou no sistema"><Icon name="calendar" size={11} /> Add {p.criadoEm.slice(0, 10).split("-").reverse().join("/")}</span>}
          {p.dataAprovado && <span title="Aprovado"><Icon name="circle-check" size={11} /> Aprov {p.dataAprovado.slice(0, 10).split("-").reverse().join("/")}</span>}
        </div>

        <Timeline pedido={p.id} />

        {/* grade() em vez de "1fr 1fr": a 320px duas colunas deixavam a foto do
            item e o nome disputando ~120px cada. */}
        <div style={{ display: "grid", gridTemplateColumns: grade(240, 2, 20), gap: "clamp(16px, 3vw, 28px)" }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--perigo)", marginBottom: 8 }}>Falta produzir ({falta.length})</div>
            {falta.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Nada — pronto p/ avançar.</div> : (
              <Fila style={{ display: "flex", flexDirection: "column", gap: 8 }}>{falta.map((i, k) => <ItemLinha key={k} i={i} cor="var(--perigo)" />)}</Fila>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ok)", marginBottom: 8 }}>Já feito / aqui ({feito.length})</div>
            {feito.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>—</div> : (
              <Fila style={{ display: "flex", flexDirection: "column", gap: 8 }}>{feito.map((i, k) => <ItemLinha key={k} i={i} cor="var(--ok)" />)}</Fila>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// O que trava o pedido, exigência por exigência.
//
// Substitui os chips soltos: chip ausente não distingue "conferido e liberado"
// de "ninguém respondeu", e era essa confusão que fazia pedido travado aparecer
// como pronto. Aqui cada linha diz o seu estado, inclusive o "não sei".
function Checklist({ checks, pronto, dias }: { checks: Check[]; pronto: boolean; dias: number }) {
  if (checks.length === 0) return null;
  const indefinidos = checks.filter((c) => c.estado === "indefinido");
  const bloqueios = checks.filter((c) => c.estado === "bloqueio");

  return (
    <div style={{ background: "var(--surface)", borderRadius: 14, padding: "13px 15px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {/* Os dois ícones ocupam a MESMA célula o tempo todo: trocando o nó, a
            fileira dava um solavanco no instante em que o pedido era liberado
            (um "circle-check" não tem a largura de um "list-check"). */}
        <TrocaIcone ligado={pronto} a="list-check" b="circle-check" size={15}
          corA="var(--perigo)" corB="var(--ok)"
          titulo={pronto ? "Liberado para avançar" : "Ainda travado"} />
        <span style={{ fontSize: 13, fontWeight: 800, color: pronto ? "var(--ok)" : "var(--perigo)" }}>
          {pronto ? "Liberado para avançar"
            : bloqueios.length > 0 ? `${bloqueios.length} item(ns) travando`
            : "Motivo não identificado — conferir no ERP"}
        </span>
        {!pronto && <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>parado há {dias}d</span>}
      </div>

      <Fila style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {checks.map((c) => (
          <div key={c.chave} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5 }}>
            <Icon name={ICONE_CHECK[c.estado]} size={15} color={COR_CHECK[c.estado]} />
            <span style={{ fontWeight: c.estado === "ok" ? 400 : 700, color: c.estado === "ok" ? "var(--text-dim)" : "var(--text)" }}>
              {c.label}
            </span>
            {c.detalhe && <span style={{ color: "var(--text-dim)", minWidth: 0 }}>— {c.detalhe}</span>}
          </div>
        ))}
      </Fila>

      {indefinidos.length > 0 && (
        <div style={{ display: "flex", gap: 7, alignItems: "flex-start", marginTop: 10, fontSize: 11.5, color: "var(--text-dim)" }}>
          <Icon name="info-circle" size={14} color="var(--text-dim)" />
          <span>O ERP não respondeu {indefinidos.map((c) => c.label.toLowerCase()).join(", ")}. Sem essa resposta o pedido não conta como pronto.</span>
        </div>
      )}
    </div>
  );
}

// Linha do tempo do pedido — carregada ao ABRIR o card, nunca com a lista.
// A lista recarrega a cada 60s com até 200 pedidos por etapa; puxar histórico
// junto seria uma consulta por pedido por tick (CLAUDE.md, "Dados").
function Timeline({ pedido }: { pedido: number }) {
  const [dados, setDados] = useState<TimelinePedido | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    setDados(null); setErro(false);
    fetch(`/api/logistica/pedido/${pedido}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (vivo) setDados(d); })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [pedido]);

  if (erro) return null;   // a linha do tempo é apoio: sem ela o card ainda serve

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9, flexWrap: "wrap" }}>
        <Icon name="history" size={15} color="var(--info)" />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--info)" }}>Linha do tempo</span>
        {dados?.horasNaEtapa != null && (
          <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
            nesta etapa há {dados.horasNaEtapa >= 48 ? `${Math.round(dados.horasNaEtapa / 24)}d` : `${dados.horasNaEtapa}h`}
          </span>
        )}
      </div>

      {!dados ? (
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Carregando…</div>
      ) : dados.marcos.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Sem registros no log do ERP.</div>
      ) : (
        // Mais recente primeiro e teto de 12: o log tem centenas de linhas por
        // pedido, e a lista inteira seria o "bagulho gigante" de novo.
        <Fila style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
          {[...dados.marcos].reverse().slice(0, 12).map((m, k) => (
            <div key={`${m.em}-${k}`} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 12 }}>
              <span style={{ flex: "none", width: 8, height: 8, borderRadius: 999, marginTop: 5, background: m.etapa != null ? "var(--info)" : "var(--border)" }} />
              <span style={{ flex: "none", color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{dataHora(m.em)}</span>
              <span style={{ minWidth: 0, fontWeight: m.etapa != null ? 700 : 400 }}>{m.titulo}</span>
              {m.quem && <span style={{ color: "var(--text-dim)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {m.quem}</span>}
            </div>
          ))}
        </Fila>
      )}
    </div>
  );
}

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Linha de item com FOTO (o que está faltando / o que está aqui).
function ItemLinha({ i, cor, style }: { i: import("@/lib/logistica").LogiItem; cor: string; style?: React.CSSProperties }) {
  // Foto 76px + vetor 84px eram 160px fixos numa linha de ~230px no celular: o
  // nome do item ficava sem espaço. Em clamp os dois encolhem só no estreito e
  // ficam idênticos no desktop (a partir de ~545px de viewport já é o tamanho cheio).
  const foto = "clamp(48px, 14vw, 76px)";
  const arte = "clamp(52px, 16vw, 84px)";
  return (
    // `style` por último: é por ele que a `Fila` do pai carimba o `--mt-i`.
    <div style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 13, ...style }}>
      {i.imagem
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={i.imagem} alt="" style={{ width: foto, height: foto, borderRadius: 12, objectFit: "cover", flex: "none", border: `1px solid color-mix(in srgb, ${cor} 35%, transparent)` }} />
        : <span style={{ width: foto, height: foto, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", background: "var(--surface-2)" }}><Icon name="box" size={26} color="var(--text-dim)" /></span>}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700, color: cor }}>{i.tipo}</div>
        <div style={{ color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.nome}</div>
      </div>
      {/* Arte vetorizada (logo do carimbo/chancela) direto na linha do item.
          A imagem fica FORA do <a>: o GlobalLightbox ignora img dentro de
          âncora (lá a ação é o link), então envolvê-la impedia o zoom — que é
          justo o que se quer aqui, conferir o desenho de perto. O link vira um
          botão pequeno ao lado, para quem precisa do arquivo. */}
      {i.vetor && (
        <span style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={i.vetor} alt={`arte — ${i.nome}`} title="Clique para ampliar"
            style={{ width: arte, height: arte, borderRadius: 12, objectFit: "contain", background: "#fff", padding: 4, border: "1px solid var(--indigo)" }} />
          <a href={i.vetor} target="_blank" rel="noopener noreferrer" title="Abrir arquivo da arte"
            style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "var(--text-dim)", textDecoration: "none" }}>
            <Icon name="external-link" size={11} color="var(--text-dim)" /> abrir
          </a>
        </span>
      )}
    </div>
  );
}

