"use client";

// ── Central de Trabalho · visões ─────────────────────────────────────────────
// A mesma tarefa em quatro representações: Lista (no client principal), Kanban
// por status, Calendário por prazo e a Matriz de Eisenhower. Nenhuma delas cria
// entidade nova — todas leem e escrevem a MESMA tarefa.

import { useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { PRIORIDADE, STATUS, fmtPrazo, hojeStr, diaDe, ehVirtual } from "./comum";
import { QUADRANTES, ORDEM_QUADRANTES, classificar, distribuicao, sugestao, type Quadrante } from "@/lib/eisenhower";
import type { Tarefa, TarefaStatus } from "@/lib/tarefas";
import { TrocaIcone } from "../../ui/micro";
import { Dropdown } from "../../ui/Dropdown";
import { Botao, BotaoIcone } from "../../ui/controles";

export type Visao = "lista" | "kanban" | "calendario" | "matriz";
export const VISOES: { key: Visao; nome: string; icon: string }[] = [
  { key: "lista", nome: "Lista", icon: "list" },
  { key: "kanban", nome: "Kanban", icon: "layout-columns" },
  { key: "calendario", nome: "Calendário", icon: "calendar" },
  { key: "matriz", nome: "Eisenhower", icon: "layout-grid" },
];

// ── Seletor de visão (segmentado) ────────────────────────────────────────────
export function SeletorVisao({ visao, onVisao }: { visao: Visao; onVisao: (v: Visao) => void }) {
  return (
    // .tab-strip: quatro visões não cabem em 320px — rolam de lado em vez de cortar.
    <div className="tab-strip" role="tablist" aria-label="Visões" style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 999, background: "var(--seg-track)" }}>
      {VISOES.map((v) => {
        const on = visao === v.key;
        return (
          <button key={v.key} role="tab" aria-selected={on} onClick={() => onVisao(v.key)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 999, border: "none", cursor: "pointer", whiteSpace: "nowrap",
              background: on ? "var(--seg-pill)" : "transparent", color: on ? "var(--text)" : "var(--text-dim)", fontSize: 12.5, fontWeight: on ? 700 : 600,
              boxShadow: on ? "0 1px 3px rgba(0,0,0,.18)" : "none" }}>
            <Icon name={v.icon} size={14} color={on ? "var(--text)" : "var(--text-dim)"} />{v.nome}
          </button>
        );
      })}
    </div>
  );
}

// ── Card (o mesmo nas três visões novas) ─────────────────────────────────────
// Só o essencial: nome, prazo, responsável, prioridade e tags.
function CardTarefa({ t, sel, onSel, onArrastar, acoes }: {
  t: Tarefa; sel: string | null; onSel: (id: string) => void;
  onArrastar?: (id: string) => void;
  acoes?: { titulo: string; opcoes: { label: string; hint?: string; onClick: () => void }[] };
}) {
  const pr = fmtPrazo(t.prazo);
  const feita = t.status === "concluida";
  const p = PRIORIDADE[t.prioridade];
  const destaque = sel === t.id;
  return (
    <div
      draggable={!!onArrastar && !ehVirtual(t.id)}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; onArrastar?.(t.id); }}
      onClick={() => onSel(t.id)}
      style={{
        display: "flex", alignItems: "flex-start", gap: 8, padding: "11px 12px", borderRadius: "var(--r-sm)", cursor: "pointer",
        background: destaque ? "color-mix(in srgb, var(--primary) 7%, var(--surface))" : "var(--surface)",
        border: `1px solid ${destaque ? "color-mix(in srgb, var(--primary) 40%, var(--border))" : "var(--border)"}`,
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.35, color: feita ? "var(--text-dim)" : "var(--text)", textDecoration: feita ? "line-through" : "none",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.titulo}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 11.5, color: "var(--text-dim)", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.cor, flex: "none" }} />{p.label}
          </span>
          {pr && <span style={{ color: pr.cor, fontWeight: 600 }}>{pr.txt}</span>}
          {t.responsavelNome && <span>{t.responsavelNome.split(" ")[0]}</span>}
        </div>
        {t.tags.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
            {t.tags.slice(0, 3).map((tg) => (
              <span key={tg} style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, border: "1px solid var(--border)", color: "var(--text-dim)" }}>{tg}</span>
            ))}
          </div>
        )}
      </div>
      {acoes && !ehVirtual(t.id) && (
        // Nada de ação escondida no hover — no celular ela simplesmente não existiria.
        // O Dropdown para a propagação sozinho: escolher "mover" não seleciona o card.
        <Dropdown
          titulo="Mover tarefa"
          alinhar="fim"
          secoes={[{
            titulo: acoes.titulo,
            itens: acoes.opcoes.map((o, i) => ({ id: String(i), rotulo: o.label, descricao: o.hint, onSelect: o.onClick })),
          }]}
          gatilho={(p) => (
            <button type="button" {...p} aria-label="Mover tarefa"
              style={{ flex: "none", width: "var(--tap)", height: "var(--tap)", margin: "-11px -12px -11px 0", border: "none", background: "none", cursor: "pointer", display: "grid", placeItems: "center" }}>
              <Icon name="dots-vertical" size={15} color="var(--text-dim)" />
            </button>
          )}
        />
      )}
    </div>
  );
}

// ── Matriz de Eisenhower ─────────────────────────────────────────────────────
export function MatrizEisenhower({ tarefas, sel, onSel, onClassificar, estreito }: {
  tarefas: Tarefa[]; sel: string | null; onSel: (id: string) => void; estreito?: boolean;
  onClassificar: (id: string, importancia: "alta" | "baixa" | null, urgencia: "alta" | "baixa" | null) => void;
}) {
  const [sobre, setSobre] = useState<Quadrante | null>(null);
  const grupos = useMemo(() => {
    const g: Record<Quadrante, Tarefa[]> = { q1: [], q2: [], q3: [], q4: [] };
    for (const t of tarefas) g[classificar(t).quadrante].push(t);
    for (const k of ORDEM_QUADRANTES) g[k].sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"));
    return g;
  }, [tarefas]);
  const n = distribuicao(tarefas);
  const total = tarefas.length;
  const dica = sugestao(n);

  const mover = (id: string, q: Quadrante) => onClassificar(id, QUADRANTES[q].importante, QUADRANTES[q].urgente);
  const acoesDe = (t: Tarefa) => ({
    titulo: "Mover para",
    opcoes: [
      ...ORDEM_QUADRANTES.map((q) => ({ label: QUADRANTES[q].nome, hint: QUADRANTES[q].acao, onClick: () => mover(t.id, q) })),
      { label: "Deixar sem definir", hint: "volta a seguir prioridade e prazo", onClick: () => onClassificar(t.id, null, null) },
    ],
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {dica && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface)" }}>
          <Icon name="bulb" size={16} color={dica.cor} />
          <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.45 }}>{dica.texto}</span>
        </div>
      )}

      <Produtividade n={n} total={total} />

      {/* .duo-eq da fundação: 2×2 no desktop, uma coluna abaixo de 900px. Com o
          painel de detalhes aberto a coluna do meio não comporta duas — empilha. */}
      <div className={estreito ? undefined : "duo duo-eq"} style={{ display: "grid", gap: 14, ...(estreito ? { gridTemplateColumns: "minmax(0, 1fr)" } : null) }}>
        {ORDEM_QUADRANTES.map((q) => {
          const Q = QUADRANTES[q];
          const itens = grupos[q];
          const alvo = sobre === q;
          return (
            <section key={q}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (sobre !== q) setSobre(q); }}
              onDragLeave={() => setSobre((s) => (s === q ? null : s))}
              onDrop={(e) => { e.preventDefault(); setSobre(null); const id = e.dataTransfer.getData("text/plain"); if (id) mover(id, q); }}
              style={{ display: "flex", flexDirection: "column", minWidth: 0, borderRadius: "var(--r-md)", padding: 16,
                border: `1px solid ${alvo ? Q.cor : "var(--border)"}`,
                background: alvo ? "color-mix(in srgb, var(--text) 4%, var(--surface))" : "transparent", transition: "border-color .12s, background .12s" }}>
              <header style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: Q.cor, flex: "none" }} />
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text)" }}>{Q.acao}</h3>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)" }}>{itens.length}</span>
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", marginTop: 7 }}>{Q.nome}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 3, lineHeight: 1.4 }}>{Q.desc}</div>
              </header>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 64 }}>
                {itens.map((t) => <CardTarefa key={t.id} t={t} sel={sel} onSel={onSel} onArrastar={() => {}} acoes={acoesDe(t)} />)}
                {itens.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-dim)", padding: "14px 0" }}>Nada aqui.</div>}
              </div>
            </section>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
        Arraste um card entre os quadrantes para definir importância e urgência — ou use o menu do card. Sem definir, a tarefa entra pelo quadrante sugerido a partir da prioridade e do prazo.
      </div>
    </div>
  );
}

// ── Distribuição (visão de produtividade) ────────────────────────────────────
function Produtividade({ n, total }: { n: Record<Quadrante, number>; total: number }) {
  if (!total) return null;
  const pct = (v: number) => Math.round((v / total) * 100);
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "14px 16px", background: "var(--surface)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-dim)", letterSpacing: ".04em", textTransform: "uppercase" }}>Distribuição</span>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{total} tarefas</span>
      </div>
      <div style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden", background: "var(--seg-track)" }}>
        {ORDEM_QUADRANTES.filter((q) => n[q] > 0).map((q) => (
          <div key={q} title={`${QUADRANTES[q].nome}: ${n[q]}`} style={{ width: `${(n[q] / total) * 100}%`, background: QUADRANTES[q].cor }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 10 }}>
        {ORDEM_QUADRANTES.map((q) => (
          <span key={q} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-dim)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: QUADRANTES[q].cor }} />
            <b style={{ color: "var(--text)", fontWeight: 700 }}>{pct(n[q])}%</b> {QUADRANTES[q].acao}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Kanban (por status) ──────────────────────────────────────────────────────
const COLUNAS: TarefaStatus[] = ["pendente", "em_andamento", "aguardando", "bloqueada", "concluida"];

export function KanbanTarefas({ tarefas, sel, onSel, onStatus }: {
  tarefas: Tarefa[]; sel: string | null; onSel: (id: string) => void; onStatus: (id: string, s: TarefaStatus) => void;
}) {
  const [sobre, setSobre] = useState<TarefaStatus | null>(null);
  const acoesDe = (t: Tarefa) => ({
    titulo: "Mover para",
    opcoes: COLUNAS.filter((s) => s !== t.status).map((s) => ({ label: STATUS[s].label, onClick: () => onStatus(t.id, s) })),
  });
  return (
    // Rola DENTRO do bloco — nunca a página.
    <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, scrollSnapType: "x proximity" }}>
      {COLUNAS.map((s) => {
        const itens = tarefas.filter((t) => t.status === s);
        const alvo = sobre === s;
        return (
          <section key={s}
            onDragOver={(e) => { e.preventDefault(); if (sobre !== s) setSobre(s); }}
            onDragLeave={() => setSobre((v) => (v === s ? null : v))}
            onDrop={(e) => { e.preventDefault(); setSobre(null); const id = e.dataTransfer.getData("text/plain"); if (id) onStatus(id, s); }}
            style={{ flex: "none", width: "min(84vw, 270px)", scrollSnapAlign: "start", borderRadius: "var(--r-md)", padding: 12,
              border: `1px solid ${alvo ? STATUS[s].cor : "var(--border)"}`, background: alvo ? "color-mix(in srgb, var(--text) 4%, transparent)" : "transparent" }}>
            <header style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, padding: "0 2px" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS[s].cor }} />
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{STATUS[s].label}</h3>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>{itens.length}</span>
            </header>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 56 }}>
              {itens.map((t) => <CardTarefa key={t.id} t={t} sel={sel} onSel={onSel} onArrastar={() => {}} acoes={acoesDe(t)} />)}
              {itens.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-dim)", padding: "10px 2px" }}>Vazio.</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── Calendário (por prazo) ───────────────────────────────────────────────────
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function CalendarioTarefas({ tarefas, sel, onSel, celular }: { tarefas: Tarefa[]; sel: string | null; onSel: (id: string) => void; celular: boolean }) {
  const hoje = hojeStr();
  const [mes, setMes] = useState(() => hoje.slice(0, 7));   // "YYYY-MM"
  const porDia = useMemo(() => {
    const m = new Map<string, Tarefa[]>();
    for (const t of tarefas) { const d = diaDe(t.prazo); if (!d) continue; (m.get(d) ?? m.set(d, []).get(d)!).push(t); }
    return m;
  }, [tarefas]);
  const semPrazo = tarefas.filter((t) => !t.prazo);

  const [ano, mm] = mes.split("-").map(Number);
  const primeiro = new Date(Date.UTC(ano, mm - 1, 1));
  const diasNoMes = new Date(Date.UTC(ano, mm, 0)).getUTCDate();
  const vazioInicio = primeiro.getUTCDay();
  const dias = Array.from({ length: diasNoMes }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`);
  const passo = (n: number) => { const d = new Date(Date.UTC(ano, mm - 1 + n, 1)); setMes(d.toISOString().slice(0, 7)); };

  const cabecalho = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <BotaoIcone icone="chevron-left" titulo="Mês anterior" onClick={() => passo(-1)} />
      <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: "var(--text)", textAlign: "center", letterSpacing: "-0.01em" }}>{MESES[mm - 1]} {ano}</div>
      <Botao onClick={() => setMes(hoje.slice(0, 7))}>Hoje</Botao>
      <BotaoIcone icone="chevron-right" titulo="Próximo mês" onClick={() => passo(1)} />
    </div>
  );

  // No celular a grade de 7 colunas fica ilegível — vira agenda: só os dias com
  // tarefa, em ordem.
  if (celular) {
    const comTarefa = dias.filter((d) => (porDia.get(d)?.length ?? 0) > 0);
    return (
      <div>
        {cabecalho}
        {comTarefa.length === 0 && <div style={{ fontSize: 13, color: "var(--text-dim)", padding: "16px 0" }}>Nenhuma tarefa com prazo neste mês.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {comTarefa.map((d) => (
            <div key={d}>
              <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".04em", color: d === hoje ? "var(--primary-texto)" : "var(--text-dim)", marginBottom: 7 }}>
                {DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()].toUpperCase()} · {d.split("-").reverse().slice(0, 2).join("/")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {porDia.get(d)!.map((t) => <CardTarefa key={t.id} t={t} sel={sel} onSel={onSel} />)}
              </div>
            </div>
          ))}
        </div>
        {semPrazo.length > 0 && <SemPrazo itens={semPrazo} sel={sel} onSel={onSel} />}
      </div>
    );
  }

  return (
    <div>
      {cabecalho}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
        {DIAS.map((d) => (
          <div key={d} style={{ background: "var(--surface)", padding: "8px 10px", fontSize: 11, fontWeight: 800, color: "var(--text-dim)", letterSpacing: ".04em" }}>{d.toUpperCase()}</div>
        ))}
        {Array.from({ length: vazioInicio }, (_, i) => <div key={`v${i}`} style={{ background: "var(--surface)", minHeight: 108 }} />)}
        {dias.map((d) => {
          const itens = porDia.get(d) ?? [];
          const eHoje = d === hoje;
          return (
            <div key={d} style={{ background: "var(--surface)", minHeight: 108, padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: eHoje ? 800 : 600, color: eHoje ? "var(--primary-texto)" : "var(--text-dim)" }}>{Number(d.slice(-2))}</span>
              {itens.slice(0, 3).map((t) => (
                <button key={t.id} onClick={() => onSel(t.id)} title={t.titulo}
                  style={{ textAlign: "left", border: "none", borderRadius: "var(--r-xs)", padding: "4px 7px", cursor: "pointer", fontSize: 11.5, lineHeight: 1.25,
                    background: sel === t.id ? "color-mix(in srgb, var(--primary) 14%, var(--surface))" : "var(--seg-track)", color: "var(--text)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    textDecoration: t.status === "concluida" ? "line-through" : "none",
                    borderLeft: `2px solid ${PRIORIDADE[t.prioridade].cor}` }}>{t.titulo}</button>
              ))}
              {itens.length > 3 && <span style={{ fontSize: 11, color: "var(--text-dim)", paddingLeft: 4 }}>+{itens.length - 3}</span>}
            </div>
          );
        })}
      </div>
      {semPrazo.length > 0 && <SemPrazo itens={semPrazo} sel={sel} onSel={onSel} />}
    </div>
  );
}

function SemPrazo({ itens, sel, onSel }: { itens: Tarefa[]; sel: string | null; onSel: (id: string) => void }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <button onClick={() => setAberto((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 7, minHeight: "var(--tap)", border: "none", background: "transparent", cursor: "pointer", color: "var(--text-dim)", fontSize: 12.5, fontWeight: 700 }}>
        <TrocaIcone ligado={aberto} a="chevron-right" b="chevron-down" size={14} corA="var(--text-dim)" corB="var(--text-dim)" /> Sem prazo — {itens.length}
      </button>
      {aberto && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))", gap: 8, marginTop: 8 }}>
          {itens.map((t) => <CardTarefa key={t.id} t={t} sel={sel} onSel={onSel} />)}
        </div>
      )}
    </div>
  );
}
