"use client";

// Contatos — Leads e Respostas de todos os bots: tabela + busca/filtros +
// painel lateral do lead (respostas, origem/UTM). Visual claro (mockups).
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { Alerta } from "../../ui/Alerta";
import { Botao, BotaoIcone } from "../../ui/controles";
import { toast } from "../../Toast";
import { DataList, type Coluna } from "../../ui/DataList";
import { useIsMobile } from "../../ui/useMediaQuery";
import { GlassSelect } from "../../GlassPicker";
import {
  ESTAGIOS, NOTA_MAX, corDaPontuacao, ehRecuperavel, emailDoLead, estagioDe, infoEstagio,
  nomeDoLead, pontuacao, situacaoDe, telefoneDoLead, type Estagio,
} from "@/lib/tridiflow-leads";

interface Lead {
  id: string; botId: string; botNome: string; iniciadaEm: string; concluidaEm: string | null;
  ultimaEtapa: string | null; utm: Record<string, string>; respostas: Record<string, string>;
  estagio: string | null; nota: string | null; trabalhadoEm: string | null;
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid", "ttclid"];
// Nome/telefone/e-mail e pontuação vêm de lib/tridiflow-leads.ts. Estavam aqui
// dentro, e a lista de apelidos era curta: um funil que gravasse "seu_nome" ou
// "fone" mostrava "—" numa coluna e o dado inteiro na outra.
const nomeDe = (r: Record<string, string>) => nomeDoLead(r) || "—";
const telDe = telefoneDoLead;
const emailDe = emailDoLead;
const atras = (iso: string) => {
  const s = Math.floor((Date.now() - +new Date(iso)) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)} min atrás`;
  if (s < 86400) return `${Math.floor(s / 3600)} h atrás`;
  return `${Math.floor(s / 86400)} d atrás`;
};

export function ContatosClient() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [botFiltro, setBotFiltro] = useState("");
  const [status, setStatus] = useState("");   // "" | <estágio> | recuperar
  const [selId, setSelId] = useState<string | null>(null);
  // A gestão de leads depende de supabase/tridiflow-leads-crm.sql. Sem ele a
  // tela lista normalmente e esconde os controles de estágio — melhor que
  // oferecer um botão que não grava nada.
  const [crm, setCrm] = useState(false);
  // No celular o painel do lead não cabe ao lado da lista: vira folha por cima.
  const celular = useIsMobile();

  useEffect(() => {
    fetch("/api/tridiflow/leads", { cache: "no-store" }).then((r) => r.json())
      .then((d) => { if (d.error) setErro(d.error); else { setLeads(d.leads ?? []); setCrm(!!d.crm); } })
      .catch(() => setErro("Sem conexão."));
  }, []);

  /** Grava o trabalho no lead. Aplica na tela ANTES de confirmar: marcar
   *  "contatado" e esperar meio segundo o chip mudar faz a pessoa clicar duas
   *  vezes. Se o servidor recusar, volta e avisa. */
  async function salvarLead(id: string, patch: { estagio?: Estagio | null; nota?: string | null }) {
    const antes = leads;
    setLeads((ls) => (ls ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)));
    try {
      const r = await fetch("/api/tridiflow/leads", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setLeads(antes);
        toast.erro(d.error || "Não consegui salvar.");
      }
    } catch { setLeads(antes); toast.erro("Sem conexão."); }
  }

  const bots = useMemo(() => [...new Map((leads ?? []).map((l) => [l.botId, l.botNome])).entries()], [leads]);
  const nRecuperar = useMemo(() => (leads ?? []).filter(ehRecuperavel).length, [leads]);
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (leads ?? []).filter((l) => {
      if (botFiltro && l.botId !== botFiltro) return false;
      if (status === "recuperar") { if (!ehRecuperavel(l)) return false; }
      else if (status && estagioDe(l.estagio) !== status) return false;
      if (!q) return true;
      return nomeDe(l.respostas).toLowerCase().includes(q) || telDe(l.respostas).includes(q) || emailDe(l.respostas).toLowerCase().includes(q) || l.botNome.toLowerCase().includes(q);
    });
  }, [leads, busca, botFiltro, status]);
  const sel = useMemo(() => (leads ?? []).find((l) => l.id === selId) ?? null, [leads, selId]);

  function exportar() {
    if (!filtrados.length) return;
    const cols = [...new Set(filtrados.flatMap((l) => Object.keys(l.respostas)))].slice(0, 12);
    const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const linhas = [["quando", "bot", "concluiu", ...cols, "utm_source"].map(esc).join(";"),
      ...filtrados.map((l) => [new Date(l.iniciadaEm).toLocaleString("pt-BR"), l.botNome, l.concluidaEm ? "sim" : "não", ...cols.map((c) => l.respostas[c] ?? ""), l.utm.utm_source ?? ""].map(esc).join(";"))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = "leads-tridiflow.csv"; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div style={{ maxWidth: 1280, display: "flex", gap: 18, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: "clamp(22px, 6vw, 32px)", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>Leads e Respostas</h1>
            <p style={{ color: "var(--text-dim)", marginTop: 4, fontSize: 14 }}>Gerencie e acompanhe todos os leads coletados pelos seus bots.</p>
          </div>
          <Botao icone="download" onClick={exportar} disabled={!filtrados.length}>
            Exportar leads
          </Botao>
        </div>

        {/* Filtros */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex" }}><Icon name="search" size={15} color="var(--text-dim)" /></span>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, telefone, e-mail…"
              style={{ width: "100%", boxSizing: "border-box", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 11, padding: "10px 12px 10px 36px", color: "var(--text)", fontSize: 13.5, outline: "none" }} />
          </div>
          <GlassSelect value={botFiltro} onChange={setBotFiltro} style={sel_}
            options={[{ value: "", label: "Todos os bots" }, ...bots.map(([id, nome]) => ({ value: id, label: nome }))]} />
          <GlassSelect value={status} onChange={(v) => setStatus(v as typeof status)} style={sel_}
            options={[
              { value: "", label: "Todos os estágios" },
              ...ESTAGIOS.map((e) => ({ value: e.id, label: e.label })),
            ]} />
          {/* Recuperação: quem deixou contato e não terminou. É o lead mais mal
              aproveitado que existe — já disse quem é e já demonstrou interesse.
              Antes ele aparecia como "incompleto", misturado com quem entrou e
              não deixou nada, e morria ali. */}
          {nRecuperar > 0 && (
            <button
              onClick={() => setStatus((s) => (s === "recuperar" ? "" : "recuperar"))}
              aria-pressed={status === "recuperar"}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 14px",
                minHeight: "var(--tap, 44px)", borderRadius: 11, cursor: "pointer", fontSize: 13, fontWeight: 700,
                border: `1px solid ${status === "recuperar" ? "transparent" : "var(--border)"}`,
                background: status === "recuperar" ? "var(--atencao)" : "var(--surface)",
                color: status === "recuperar" ? "#1c1c22" : "var(--text)",
              }}>
              <Icon name="refresh" size={15} color={status === "recuperar" ? "#1c1c22" : "var(--atencao)"} />
              Recuperar ({nRecuperar})
            </button>
          )}
        </div>

        {!crm && leads && leads.length > 0 && (
          <Alerta tom="atencao" icone="info-circle" style={{ marginBottom: 14 }}>
            A lista funciona, mas marcar estágio e anotar ainda não: falta rodar
            <strong> supabase/tridiflow-leads-crm.sql</strong> no banco.
          </Alerta>
        )}

        {erro && <Alerta tom="perigo">{erro}</Alerta>}
        {!leads && !erro && <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Carregando…</p>}
        {leads && filtrados.length === 0 && !erro && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 40, textAlign: "center", color: "var(--text-dim)" }}>
            <Icon name="user-check" size={34} color="var(--primary-texto)" />
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 8, color: "var(--text)" }}>{leads.length === 0 ? "Ainda sem leads" : "Nenhum lead com esses filtros"}</div>
            <p style={{ fontSize: 13, marginTop: 4 }}>{leads.length === 0 ? "Publique um bot e cole o link no anúncio — os leads aparecem aqui." : "Ajuste a busca ou os filtros."}</p>
          </div>
        )}

        {leads && filtrados.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>{filtrados.length} lead(s) encontrado(s)</div>
            {/* Uma definição de colunas: tabela no computador, cartões no celular
                (rolar 7 colunas de lado tira o nome da vista logo no 1º arrasto). */}
            <div style={{ padding: celular ? 12 : 0 }}>
              <DataList
                itens={filtrados.slice(0, 300)}
                colunas={colunas}
                chaveDe={(l) => l.id}
                onAbrir={(l) => setSelId(l.id)}
                minWidth={760}
                rotulo="Leads"
                vazio="Nenhum lead."
              />
            </div>
          </div>
        )}
      </div>

      {/* Painel do lead: coluna fixa no computador, folha por cima no celular. */}
      {sel && !celular && (
        <aside style={{ width: 340, flex: "none", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, position: "sticky", top: 14 }}>
          <PainelLead l={sel} onFechar={() => setSelId(null)} crm={crm} onSalvar={(p) => salvarLead(sel.id, p)} />
        </aside>
      )}
      {sel && celular && (
        <div className="sheet-host" onClick={() => setSelId(null)}
          style={{ position: "fixed", inset: 0, zIndex: 5000, background: "rgba(16,24,40,.5)", display: "grid", placeItems: "center", padding: 16 }}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}
            style={{ width: "min(420px, 100%)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18 }}>
            <PainelLead l={sel} onFechar={() => setSelId(null)} crm={crm} onSalvar={(p) => salvarLead(sel.id, p)} />
          </div>
        </div>
      )}
    </div>
  );
}

function PainelLead({ l, onFechar, crm, onSalvar }: {
  l: Lead; onFechar: () => void; crm: boolean;
  onSalvar: (patch: { estagio?: Estagio | null; nota?: string | null }) => void;
}) {
  const situacao = situacaoDe({ ...l, estagio: l.estagio });
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", background: "color-mix(in srgb, var(--primary) 14%, transparent)", display: "grid", placeItems: "center", flex: "none", fontWeight: 800, color: "var(--primary-texto, var(--primary))" }}>{nomeDe(l.respostas).charAt(0).toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15.5, fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomeDe(l.respostas)}</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: `color-mix(in srgb, ${situacao.cor} 14%, transparent)`, color: situacao.cor, flex: "none" }}>{situacao.label}</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>Lead de {l.botNome} · {atras(l.iniciadaEm)}</div>
          </div>
        </div>
        <BotaoIcone icone="x" titulo="Fechar" onClick={onFechar} style={{ flex: "none" }} />
      </div>

      {/* Estágio — o que NÓS já fizemos. Botões em vez de <select>: a ação mais
          comum da tela é "marquei, próximo", e um clique bate dois. */}
      {crm && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 700, marginBottom: 6 }}>Estágio</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {ESTAGIOS.map((e) => {
              const on = estagioDe(l.estagio) === e.id;
              return (
                <button key={e.id} onClick={() => onSalvar({ estagio: e.id })} title={e.dica}
                  aria-pressed={on}
                  style={{
                    padding: "8px 11px", minHeight: "var(--tap, 44px)", borderRadius: 9, cursor: "pointer",
                    fontSize: 12, fontWeight: 800, flex: "1 1 auto",
                    border: `1px solid ${on ? "transparent" : "var(--border)"}`,
                    background: on ? e.cor : "var(--surface-2)",
                    color: on ? "#fff" : "var(--text-dim)",
                  }}>{e.label}</button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pontuação do lead */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 700 }}>Pontuação</span>
        <div style={{ flex: 1, height: 8, borderRadius: 5, background: "var(--surface-2)", overflow: "hidden" }}>
          <div style={{ width: `${pontuacao(l)}%`, height: "100%", background: corDaPontuacao(pontuacao(l)), borderRadius: 5 }} />
        </div>
        <span style={{ fontSize: 14, fontWeight: 800, color: corDaPontuacao(pontuacao(l)) }}>{pontuacao(l)}</span>
      </div>

      {crm && <Anotacao l={l} onSalvar={onSalvar} />}

      {telDe(l.respostas) && (
        <a href={`https://wa.me/55${telDe(l.respostas).replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 14px", minHeight: "var(--tap)", boxSizing: "border-box", borderRadius: 11, background: "var(--ok)", color: "#fff", fontSize: 13.5, fontWeight: 800, textDecoration: "none", marginBottom: 8 }}>
          <Icon name="brand-whatsapp" size={17} color="#fff" /> Abrir no WhatsApp
        </a>
      )}
      <Botao icone="copy" bloco onClick={() => { navigator.clipboard.writeText(JSON.stringify(l.respostas, null, 2)); toast.ok("Respostas copiadas."); }}
        style={{ marginBottom: 16 }}>
        Copiar respostas
      </Botao>

      {/* Respostas */}
      <Bloco titulo="Respostas coletadas">
        {Object.entries(l.respostas).filter(([k]) => !UTM_KEYS.includes(k)).map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{k}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", textAlign: "right", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span>
          </div>
        ))}
        {Object.keys(l.respostas).filter((k) => !UTM_KEYS.includes(k)).length === 0 && <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>—</span>}
      </Bloco>

      {/* Origem / UTM */}
      {Object.keys(l.utm).length > 0 && (
        <Bloco titulo="Origem e UTM">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {UTM_KEYS.filter((k) => l.utm[k]).map((k) => (
              <div key={k} style={{ minWidth: 0 }}><div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{k.replace("utm_", "")}</div><div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis" }}>{l.utm[k]}</div></div>
            ))}
          </div>
        </Bloco>
      )}
    </>
  );
}

// Colunas dos leads — a mesma definição vira <table> no computador e cartão no
// celular (nome vira título, pontuação vira o número em evidência). Estágio
// ordena na ordem do funil de trabalho (novo → fechado), não em ordem
// alfabética; "última interação" ordena pelo carimbo, não pelo "3 h atrás".
const ordemEstagio = (l: Lead) => ESTAGIOS.findIndex((e) => e.id === estagioDe(l.estagio));
const colunas: Coluna<Lead>[] = [
  { chave: "nome", titulo: "Nome", papel: "titulo", ordenar: (l) => nomeDoLead(l.respostas) || null, render: (l) => nomeDe(l.respostas) },
  { chave: "telefone", titulo: "Telefone", render: (l) => telDe(l.respostas) || "—" },
  { chave: "email", titulo: "E-mail", render: (l) => emailDe(l.respostas) || "—" },
  { chave: "bot", titulo: "Bot", ordenar: (l) => l.botNome, render: (l) => <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "var(--surface-2)", color: "var(--text-dim)" }}>{l.botNome}</span> },
  // Estágio é o que NÓS fizemos (persistido); situação é o que o LEAD deixou
  // (derivada). Eram a mesma coluna e por isso ninguém sabia se "qualificado"
  // queria dizer "tem perfil" ou "preencheu tudo".
  { chave: "estagio", titulo: "Estágio", ordenar: ordemEstagio, render: (l) => { const e = infoEstagio(l.estagio); return <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 999, background: `color-mix(in srgb, ${e.cor} 14%, transparent)`, color: e.cor }}>{e.label}</span>; } },
  { chave: "situacao", titulo: "Situação", render: (l) => { const s = situacaoDe({ ...l, estagio: l.estagio }); return <span style={{ fontSize: 11.5, color: s.cor, fontWeight: 600 }}>{s.label}</span>; } },
  { chave: "score", titulo: "Pontuação", papel: "destaque", alinhar: "right", ordenar: (l) => pontuacao(l), render: (l) => <span style={{ fontWeight: 800, color: corDaPontuacao(pontuacao(l)) }}>{pontuacao(l)}</span> },
  { chave: "quando", titulo: "Última interação", ordenar: (l) => +new Date(l.iniciadaEm), render: (l) => <span style={{ color: "var(--text-dim)" }}>{atras(l.iniciadaEm)}</span> },
];

/** Anotação do vendedor.
 *
 *  Grava no `blur`, não a cada tecla: um PATCH por letra digitada é o tipo de
 *  coisa que derruba o projeto por invocação (a Vercel já pausou este uma vez
 *  por execução, não por tamanho de resposta). E só grava se o texto mudou. */
function Anotacao({ l, onSalvar }: {
  l: Lead; onSalvar: (patch: { nota?: string | null }) => void;
}) {
  const [texto, setTexto] = useState(l.nota ?? "");
  // Trocar de lead com o painel aberto tem que trocar o texto junto.
  useEffect(() => { setTexto(l.nota ?? ""); }, [l.id, l.nota]);
  const original = l.nota ?? "";
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 700, display: "block", marginBottom: 6 }}>
        Anotação
      </label>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value.slice(0, NOTA_MAX))}
        onBlur={() => { if (texto !== original) onSalvar({ nota: texto || null }); }}
        placeholder="O que foi combinado, quando ligar de novo…"
        rows={3}
        style={{
          width: "100%", boxSizing: "border-box", resize: "vertical",
          background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10,
          padding: "10px 11px", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none",
        }}
      />
      {l.trabalhadoEm && (
        <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 4 }}>
          Última mexida {atras(l.trabalhadoEm)}
        </div>
      )}
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>{titulo}</div>
      {children}
    </div>
  );
}
const sel_: React.CSSProperties = { appearance: "auto", padding: "9px 11px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5, cursor: "pointer" };
