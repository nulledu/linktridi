"use client";

// TridiFlow — Resultados do bot. Três abas:
//  · Analytics: quantos viram, funil por etapa (onde saíram) e conversão por botão.
//  · Vendas: quantas vendas REAIS do ERP saíram deste funil (lib/tridiflow-vendas.ts).
//  · Leads: tabela das respostas coletadas (exportável em CSV).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "../../../Icon";
import { DataList, type Coluna } from "../../../ui/DataList";
import { Botao } from "../../../ui/controles";
import { pontuacaoDe, type Quiz } from "@/lib/tridiflow-quiz";

// Estágios da triagem (espelha ESTAGIOS_CANDIDATO da rota /api/tridiflow/candidato).
const ESTAGIOS: { id: string; rotulo: string; cor: string }[] = [
  { id: "novo", rotulo: "Novo", cor: "var(--text-dim)" },
  { id: "qualificado", rotulo: "Qualificado", cor: "var(--primary-texto, var(--primary))" },
  { id: "entrevista", rotulo: "Entrevista", cor: "var(--atencao)" },
  { id: "aprovado", rotulo: "Aprovado", cor: "var(--ok)" },
  { id: "reprovado", rotulo: "Reprovado", cor: "var(--perigo)" },
];
const CHAVE_ESTAGIO = "estagio_rh";
const primeiro = (r: Record<string, string>, chaves: string[]) => { for (const k of chaves) if (r[k]?.trim()) return r[k].trim(); return ""; };
const acharCv = (r: Record<string, string>) => primeiro(r, ["curriculo", "cv"]) || Object.values(r).find((v) => /^\/api\/arquivos\//.test(v)) || "";

interface Etapa { etapa: string; titulo: string; abandonos: number }
interface Lead { id: string; iniciadaEm: string; concluidaEm: string | null; ultimaEtapa: string | null; utm: Record<string, string>; respostas: Record<string, string> }
interface Resp { nome: string; sessoes: number; concluidas: number; taxa: number; porEtapa: Etapa[]; grupos?: { id: string; titulo: string }[]; leads: Lead[]; error?: string }

interface VendaLinha { pedidoId: number; quando: string; valor: number; loja: string | null; via: "telefone" | "email"; adId: string | null; horas: number }
interface Vendas {
  sessoes: number; leads: number; vendas: number; receita: number; ticket: number; conversao: number;
  ultimaVenda: string | null; dias: number; janela: number; lista: VendaLinha[];
  porAnuncio: { adId: string; sessoes: number; vendas: number; receita: number }[];
  error?: string;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const fmtData = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const demorou = (h: number) => (h < 1 ? "menos de 1 h" : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} dias`);

/** Resposta livre pode ser um parágrafo: corta na tabela e deixa o texto
 *  inteiro no `title`, como a célula de 220px fazia antes. */
const Corte = ({ t }: { t: string }) => (
  <span title={t} style={{ display: "inline-block", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}>{t}</span>
);

// Vendas do funil: tabela no computador, cartão no celular (pedido no título,
// valor em evidência). Data ordena pelo ISO e "demorou" pelas horas, não pelo
// texto formatado.
const COLUNAS_VENDAS: Coluna<VendaLinha>[] = [
  { chave: "quando", titulo: "Quando", ordenar: (x) => x.quando, render: (x) => <span style={{ whiteSpace: "nowrap" }}>{fmtData(x.quando)}</span> },
  { chave: "pedido", titulo: "Pedido", papel: "titulo", ordenar: (x) => x.pedidoId, render: (x) => <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>#{x.pedidoId}</span> },
  { chave: "valor", titulo: "Valor", papel: "destaque", alinhar: "right", ordenar: (x) => x.valor, render: (x) => <span style={{ fontWeight: 800, color: "var(--ok)" }}>{brl(x.valor)}</span> },
  { chave: "loja", titulo: "Loja", ordenar: (x) => x.loja, render: (x) => <span style={{ color: "var(--text-dim)" }}>{x.loja ?? "—"}</span> },
  { chave: "demorou", titulo: "Demorou", ordenar: (x) => x.horas, render: (x) => <span style={{ color: "var(--text-dim)" }}>{demorou(x.horas)}</span> },
  { chave: "via", titulo: "Casou por", ordenar: (x) => x.via, render: (x) => <span style={{ color: "var(--text-dim)" }}>{x.via === "telefone" ? "telefone" : "e-mail"}</span> },
];

export function ResultadosClient({ botId, embutido = false, quiz }: { botId: string; embutido?: boolean; quiz?: Quiz }) {
  const triagem = !!quiz?.resultados?.length;   // quiz que pré-qualifica → aba Candidatos
  const [data, setData] = useState<Resp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<"candidatos" | "analytics" | "vendas" | "leads">(triagem ? "candidatos" : "analytics");
  const [vendas, setVendas] = useState<Vendas | null>(null);
  // Estágio por sessão, sobreposto localmente pra o clique responder na hora.
  const [estagios, setEstagios] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState<string>("todos");

  useEffect(() => {
    fetch(`/api/tridiflow/analytics?botId=${botId}`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => { if (d.error) setErro(d.error); else setData(d); })
      .catch(() => setErro("Sem conexão."));
    // Vendas vêm de outra rota (cruza o ERP e demora mais) — buscar junto faria
    // o funil por etapa esperar o ERP responder pra pintar.
    fetch(`/api/tridiflow/vendas?botId=${botId}&dias=30`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => setVendas(d)).catch(() => setVendas(null));
  }, [botId]);

  // Colunas dinâmicas = união das variáveis respondidas.
  const colunas = useMemo(() => {
    const s = new Set<string>();
    for (const l of data?.leads ?? []) Object.keys(l.respostas).forEach((k) => s.add(k));
    return [...s].slice(0, 8);
  }, [data]);

  // Leads: as colunas do meio são as respostas (dinâmicas), mas cada linha
  // continua sendo UM lead — no celular vira cartão com a data no título e as
  // respostas em pares rótulo→valor, em vez de rolar oito colunas de lado.
  const colunasLeads = useMemo<Coluna<Lead>[]>(() => [
    { chave: "quando", titulo: "Quando", papel: "titulo", ordenar: (l) => l.iniciadaEm, render: (l) => <span style={{ whiteSpace: "nowrap" }}>{fmtData(l.iniciadaEm)}</span> },
    {
      chave: "concluiu", titulo: "Concluiu", papel: "destaque", ordenar: (l) => (l.concluidaEm ? 1 : 0),
      render: (l) => l.concluidaEm ? <Icon name="check" size={14} color="var(--ok)" /> : <span style={{ color: "var(--text-dim)", fontWeight: 700 }}>—</span>,
    },
    ...colunas.map((c): Coluna<Lead> => ({
      chave: `r:${c}`, titulo: c, ordenar: (l) => l.respostas[c] ?? null, render: (l) => <Corte t={l.respostas[c] ?? ""} />,
    })),
    {
      chave: "origem", titulo: "Origem", ordenar: (l) => l.utm.utm_source ?? null,
      render: (l) => <span style={{ color: "var(--text-dim)" }}><Corte t={`${l.utm.utm_source ?? ""}${l.utm.utm_campaign ? ` · ${l.utm.utm_campaign}` : ""}`} /></span>,
    },
  ], [colunas]);

  // Funil na ordem do fluxo: alcance = sessões − abandonos das etapas anteriores.
  const funil = useMemo(() => {
    if (!data) return [];
    const abandonoDe = new Map(data.porEtapa.map((e) => [e.etapa, e.abandonos]));
    let alcance = data.sessoes;
    return (data.grupos ?? []).map((g, i) => {
      const reached = alcance;
      const drop = abandonoDe.get(g.id) ?? 0;
      alcance = Math.max(0, alcance - drop);
      return { id: g.id, titulo: g.titulo, n: i + 1, reached, drop, avancaram: Math.max(0, reached - drop), pct: data.sessoes ? Math.round((reached / data.sessoes) * 100) : 0, conv: reached ? Math.round(((reached - drop) / reached) * 100) : 0 };
    });
  }, [data]);
  const piorEtapa = useMemo(() => [...funil].sort((a, b) => b.drop - a.drop)[0], [funil]);

  // Conversão por resposta/botão: distribuição dos valores de cada variável.
  const conversoes = useMemo(() => {
    const porVar = new Map<string, Map<string, number>>();
    for (const l of data?.leads ?? []) {
      for (const [k, v] of Object.entries(l.respostas)) {
        if (!v || v.length > 60) continue;   // ignora textos longos (não são "botão")
        if (!porVar.has(k)) porVar.set(k, new Map());
        const m = porVar.get(k)!; m.set(v, (m.get(v) ?? 0) + 1);
      }
    }
    return [...porVar.entries()]
      .map(([variavel, m]) => {
        const total = [...m.values()].reduce((a, b) => a + b, 0);
        const opcoes = [...m.entries()].map(([valor, n]) => ({ valor, n, pct: total ? Math.round((n / total) * 100) : 0 })).sort((a, b) => b.n - a.n);
        return { variavel, total, opcoes };
      })
      .filter((c) => c.opcoes.length >= 2 || c.total >= 2)   // só o que dá pra comparar
      .slice(0, 6);
  }, [data]);

  // ── Triagem de candidatos (quiz com resultados) ──
  const candidatos = useMemo(() => {
    if (!triagem || !quiz || !data) return [];
    return data.leads.map((l) => {
      const { resultado, score } = pontuacaoDe(quiz, l.respostas);
      const estagio = estagios[l.id] ?? l.respostas[CHAVE_ESTAGIO] ?? "novo";
      return {
        id: l.id,
        nome: primeiro(l.respostas, ["nome", "name", "nome_completo"]) || "(sem nome)",
        vaga: primeiro(l.respostas, ["vaga", "cargo", "area"]),
        telefone: primeiro(l.respostas, ["telefone", "whatsapp", "fone", "celular"]),
        cidade: primeiro(l.respostas, ["cidade", "cidade_estado", "local", "cidadeuf"]),
        nivel: primeiro(l.respostas, ["nivel", "experiencia", "nivel_experiencia"]),
        disponibilidade: primeiro(l.respostas, ["periodo", "disponibilidade"]),
        inicio: primeiro(l.respostas, ["inicio", "inicio_imediato", "disponibilidade_inicio"]),
        perfil: resultado?.titulo ?? "",
        score,
        cv: acharCv(l.respostas),
        estagio,
        quando: l.iniciadaEm,
        concluido: !!l.concluidaEm,
      };
    }).sort((a, b) => b.score - a.score);   // melhores no topo
  }, [triagem, quiz, data, estagios]);

  const candidatosFiltrados = useMemo(
    () => (filtro === "todos" ? candidatos : candidatos.filter((c) => c.estagio === filtro)),
    [candidatos, filtro],
  );
  const contagem = useMemo(() => {
    const m: Record<string, number> = { todos: candidatos.length };
    for (const c of candidatos) m[c.estagio] = (m[c.estagio] ?? 0) + 1;
    return m;
  }, [candidatos]);

  const mudarEstagio = (id: string, estagio: string) => {
    const anterior = estagios[id];
    setEstagios((e) => ({ ...e, [id]: estagio }));   // otimista
    fetch("/api/tridiflow/candidato", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessaoId: id, estagio }),
    }).then((r) => { if (!r.ok) throw new Error("falha"); })
      .catch(() => setEstagios((e) => ({ ...e, [id]: anterior ?? "novo" })));   // reverte
  };

  function exportarCsv() {
    if (!data) return;
    const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const linhas = [
      ["data", "concluido", ...colunas, "utm_source", "utm_campaign"].map(esc).join(";"),
      ...data.leads.map((l) => [
        new Date(l.iniciadaEm).toLocaleString("pt-BR"), l.concluidaEm ? "sim" : "não",
        ...colunas.map((c) => l.respostas[c] ?? ""), l.utm.utm_source ?? "", l.utm.utm_campaign ?? "",
      ].map(esc).join(";")),
    ];
    const blob = new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `leads-${data.nome.toLowerCase().replace(/\W+/g, "-")}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  }

  const v = vendas && !vendas.error ? vendas : null;
  const kpis = data ? [
    { label: "Viram o funil", v: String(data.sessoes), cor: "var(--text)", icon: "eye" },
    { label: "Concluíram", v: String(data.concluidas), cor: "var(--ok)", icon: "flag" },
    { label: "Taxa de conclusão", v: `${data.taxa}%`, cor: data.taxa >= 50 ? "var(--ok)" : data.taxa >= 25 ? "var(--atencao)" : "var(--perigo)", icon: "chart-line" },
    { label: triagem ? "Candidatos" : "Leads", v: String(data.leads.length), cor: "var(--primary-texto)", icon: triagem ? "id-badge" : "user-check" },
    // Venda entra na MESMA fileira que sessão e lead de propósito: é o número
    // que a pessoa vem procurar, e escondê-lo numa aba faria o funil continuar
    // parecendo que só coleta contato. Num funil de candidatura, porém, venda não
    // faz sentido — some.
    ...(triagem ? [] : [
      { label: "Vendas", v: v ? String(v.vendas) : "…", cor: v && v.vendas > 0 ? "var(--ok)" : "var(--text-dim)", icon: "shopping-cart" },
      { label: "Receita", v: v ? brl(v.receita) : "…", cor: v && v.receita > 0 ? "var(--ok)" : "var(--text-dim)", icon: "cash" },
    ]),
  ] : [];

  return (
    <div style={{ maxWidth: embutido ? "100%" : 980 }}>
      {!embutido && <Link href="/tridiflow" style={{ color: "var(--primary-texto, var(--primary))", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>‹ Bots</Link>}
      {!embutido && <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 6 }}>{data?.nome ?? "Resultados"}</h1>}

      {erro && <div style={{ marginTop: 16, padding: 20, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-dim)" }}>{erro}</div>}
      {!data && !erro && <p style={{ marginTop: 16, fontSize: 13, color: "var(--text-dim)" }}>Carregando…</p>}

      {data && (
        <>
          {/* Abas + export */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: embutido ? 4 : 16, marginBottom: 14, flexWrap: "wrap" }}>
            {([
              ...(triagem ? [["candidatos", `Candidatos (${data.leads.length})`, "id-badge"] as const] : []),
              ["analytics", "Analytics", "chart-dots"],
              ...(triagem ? [] : [["vendas", v ? `Vendas (${v.vendas})` : "Vendas", "shopping-cart"] as const]),
              ["leads", triagem ? `Respostas (${data.leads.length})` : `Leads (${data.leads.length})`, "table"],
            ] as [typeof aba, string, string][]).map(([k, label, ic]) => (
              <button key={k} onClick={() => setAba(k)}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 10, border: "1px solid " + (aba === k ? "transparent" : "var(--border)"), background: aba === k ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: aba === k ? "var(--on-primary, #fff)" : "var(--text)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                <Icon name={ic} size={15} color={aba === k ? "#fff" : "var(--text-dim)"} /> {label}
              </button>
            ))}
            {data.leads.length > 0 && (
              <Botao icone="download" onClick={exportarCsv} style={{ marginLeft: "auto" }}>
                Exportar CSV
              </Botao>
            )}
          </div>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 12 }}>
            {kpis.map((k) => (
              <div key={k.label} style={{ padding: "14px 16px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-dim)", fontWeight: 600 }}>
                  <Icon name={k.icon} size={13} color="var(--text-dim)" /> {k.label}
                </div>
                <div style={{ fontSize: 27, color: k.cor, marginTop: 4, fontWeight: 800 }}>{k.v}</div>
              </div>
            ))}
          </div>

          {aba === "candidatos" && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {[{ id: "todos", rotulo: "Todos" }, ...ESTAGIOS].map((f) => {
                  const n = f.id === "todos" ? contagem.todos : (contagem[f.id] ?? 0);
                  const on = filtro === f.id;
                  return (
                    <button key={f.id} onClick={() => setFiltro(f.id)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, cursor: "pointer", border: "1px solid " + (on ? "transparent" : "var(--border)"), background: on ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: on ? "var(--on-primary, #fff)" : "var(--text)", fontSize: 12.5, fontWeight: 700 }}>
                      {f.rotulo} <span style={{ opacity: 0.7 }}>{n}</span>
                    </button>
                  );
                })}
              </div>

              {candidatosFiltrados.length === 0 ? (
                <div style={{ padding: 24, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 13.5, color: "var(--text-dim)" }}>
                  {candidatos.length === 0 ? "Nenhuma candidatura ainda. Publica o link da vaga que os candidatos aparecem aqui." : "Ninguém neste estágio."}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 290px), 1fr))", gap: 12 }}>
                  {candidatosFiltrados.map((c) => {
                    const scoreCor = c.score >= 70 ? "var(--ok)" : c.score >= 40 ? "var(--atencao)" : "var(--text-dim)";
                    const waDig = c.telefone.replace(/\D/g, "");
                    const wa = waDig ? `https://wa.me/${waDig.length >= 12 ? waDig : "55" + waDig}` : "";
                    return (
                      <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</div>
                            {c.vaga && <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 1 }}>{c.vaga}</div>}
                          </div>
                          <div style={{ flex: "none", textAlign: "center" }}>
                            <div style={{ fontSize: 20, fontWeight: 900, color: scoreCor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{c.score}</div>
                            <div style={{ fontSize: 9.5, color: "var(--text-dim)", fontWeight: 700 }}>/100</div>
                          </div>
                        </div>

                        {c.perfil && <span style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary-texto, var(--primary))" }}>{c.perfil}</span>}

                        {(c.nivel || c.disponibilidade || c.cidade) && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {c.nivel && <Badge icon="chart-bar" texto={c.nivel} />}
                            {c.disponibilidade && <Badge icon="clock-hour-4" texto={c.disponibilidade} />}
                            {c.cidade && <Badge icon="map-pin" texto={c.cidade} />}
                          </div>
                        )}

                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {c.cv ? (
                            <a href={c.cv} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "var(--primary-texto, var(--primary))", textDecoration: "none" }}>
                              <Icon name="file-text" size={15} color="var(--primary-texto, var(--primary))" /> Ver currículo
                            </a>
                          ) : <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Sem currículo</span>}
                          {wa && (
                            <a href={wa} target="_blank" rel="noopener noreferrer" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)", textDecoration: "none" }}>
                              <Icon name="brand-whatsapp" size={15} color="var(--text-dim)" /> WhatsApp
                            </a>
                          )}
                        </div>

                        <select value={c.estagio} onChange={(e) => mudarEstagio(c.id, e.target.value)}
                          aria-label="Estágio da triagem"
                          style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                          {ESTAGIOS.map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {aba === "analytics" && (
            <>
              {/* Funil por etapa — onde saíram */}
              {funil.length > 0 && data.sessoes > 0 && (
                <div style={{ marginTop: 16, padding: 18, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Funil por etapa</div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 14 }}>Quantos chegaram em cada etapa e onde desistiram.</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {funil.map((e) => (
                      // Wrap: no celular a barra e a queda descem pra segunda
                      // linha em vez de espremer o rótulo da etapa.
                      <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <span style={{ width: 24, height: 24, borderRadius: "50%", background: "color-mix(in srgb, var(--primary) 16%, transparent)", color: "var(--primary-texto, var(--primary))", fontSize: 11.5, fontWeight: 800, display: "grid", placeItems: "center", flex: "none" }}>{e.n}</span>
                        <span style={{ flex: "0 1 150px", minWidth: 0, fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.titulo}>{e.titulo}</span>
                        <div style={{ flex: "1 1 160px", minWidth: 0, height: 26, borderRadius: 7, background: "var(--surface-2)", overflow: "hidden", position: "relative" }}>
                          <div style={{ width: `${Math.max(2, e.pct)}%`, height: "100%", background: "linear-gradient(90deg, color-mix(in srgb,var(--primary) 85%, transparent), var(--primary))", borderRadius: 7, transition: "width .35s ease" }} />
                          <span style={{ position: "absolute", left: 10, top: 0, height: "100%", display: "flex", alignItems: "center", fontSize: 11.5, fontWeight: 800, color: e.pct > 12 ? "#fff" : "var(--text)" }}>{e.reached.toLocaleString("pt-BR")} · {e.pct}%</span>
                        </div>
                        <span style={{ width: 92, textAlign: "right", fontSize: 12, flex: "none" }}>
                          {e.drop > 0
                            ? <span style={{ color: "var(--perigo)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}><Icon name="arrow-down" size={12} color="var(--perigo)" />{e.drop} saíram</span>
                            : <span style={{ color: "var(--ok)", fontWeight: 700 }}>{e.conv}%</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                  {piorEtapa && piorEtapa.drop > 0 && (
                    <div style={{ marginTop: 14, padding: "10px 13px", borderRadius: 11, background: "color-mix(in srgb,var(--atencao) 10%,transparent)", border: "1px solid color-mix(in srgb,var(--atencao) 30%,transparent)", fontSize: 12, display: "flex", alignItems: "flex-start", gap: 7 }}>
                      <span style={{ flex: "none", marginTop: 1 }}><Icon name="bulb" size={14} color="var(--atencao)" /></span>
                      <span>Maior perda em <strong>{piorEtapa.titulo}</strong>: {piorEtapa.drop} pessoa(s) saíram aí. Encurte ou melhore essa etapa.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Conversão por botão / resposta */}
              {conversoes.length > 0 && (
                <div style={{ marginTop: 16, padding: 18, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Conversão por botão / resposta</div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 14 }}>O que as pessoas mais escolheram em cada pergunta com opções.</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 16 }}>
                    {conversoes.map((c) => (
                      <div key={c.variavel}>
                        <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                          <Icon name="click" size={13} color="var(--primary-texto)" /> {c.variavel} <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>· {c.total}</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          {c.opcoes.map((o) => (
                            <div key={o.valor}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 3 }}>
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{o.valor}</span>
                                <span style={{ color: "var(--text-dim)", fontWeight: 700, flex: "none", marginLeft: 8 }}>{o.n} · {o.pct}%</span>
                              </div>
                              <div style={{ height: 8, borderRadius: 5, background: "var(--surface-2)", overflow: "hidden" }}>
                                <div style={{ width: `${Math.max(3, o.pct)}%`, height: "100%", background: "var(--primary)", borderRadius: 5 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.leads.length === 0 && (
                <div style={{ marginTop: 16, padding: 24, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 13.5, color: "var(--text-dim)" }}>
                  Ainda sem dados. Publica o link no anúncio que as métricas aparecem aqui.
                </div>
              )}
            </>
          )}

          {aba === "vendas" && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
              {!vendas && <div style={{ padding: 24, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 13.5, color: "var(--text-dim)" }}>Cruzando com os pedidos do ERP…</div>}
              {vendas?.error && <div style={{ padding: 20, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 13.5, color: "var(--text-dim)" }}>{vendas.error}</div>}

              {v && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 12 }}>
                    {[
                      { l: "Vendas", x: String(v.vendas), c: v.vendas > 0 ? "var(--ok)" : "var(--text-dim)" },
                      { l: "Receita", x: brl(v.receita), c: v.receita > 0 ? "var(--ok)" : "var(--text-dim)" },
                      { l: "Ticket médio", x: v.vendas ? brl(v.ticket) : "—", c: "var(--text)" },
                      { l: "Visita → venda", x: `${v.conversao}%`, c: v.conversao >= 2 ? "var(--ok)" : v.conversao > 0 ? "var(--atencao)" : "var(--text-dim)" },
                      { l: "Lead → venda", x: v.leads ? `${Math.round((v.vendas / v.leads) * 1000) / 10}%` : "—", c: "var(--text)" },
                    ].map((k) => (
                      <div key={k.l} style={{ padding: "14px 16px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600 }}>{k.l}</div>
                        <div style={{ fontSize: 24, color: k.c, marginTop: 4, fontWeight: 800, letterSpacing: "-0.02em" }}>{k.x}</div>
                      </div>
                    ))}
                  </div>

                  {v.lista.length > 0 && (
                    <div style={{ borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", overflow: "hidden" }}>
                      <div style={{ padding: "14px 18px 0" }}>
                        <div style={{ fontSize: 15, fontWeight: 800 }}>Vendas deste funil</div>
                        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>Pedidos do ERP ligados a quem passou por aqui nos últimos {v.dias} dias.</div>
                      </div>
                      <div style={{ padding: 12 }}>
                        <DataList
                          itens={v.lista}
                          colunas={COLUNAS_VENDAS}
                          chaveDe={(x) => String(x.pedidoId)}
                          rotulo="Vendas deste funil"
                          minWidth={620}
                          densa
                          ordemInicial={{ coluna: "quando", sentido: "desc" }}
                        />
                      </div>
                    </div>
                  )}

                  {v.porAnuncio.length > 0 && (
                    <div style={{ padding: 18, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Quais anúncios trouxeram</div>
                      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>O id é o do anúncio no Meta — o mesmo que aparece no Tridify.</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {v.porAnuncio.map((a) => (
                          <div key={a.adId} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12.5 }}>
                            <span style={{ fontFamily: "ui-monospace, Menlo, monospace", color: "var(--text-dim)", flex: "1 1 160px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{a.adId}</span>
                            <span style={{ flex: "none", color: "var(--text-dim)" }}>{a.sessoes} visita(s)</span>
                            <span style={{ flex: "none", fontWeight: 800, color: a.vendas ? "var(--ok)" : "var(--text-dim)" }}>{a.vendas} venda(s)</span>
                            <span style={{ flex: "none", fontWeight: 700, minWidth: 84, textAlign: "right" }}>{brl(a.receita)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sem contato coletado não há como ligar venda nenhuma — e é
                      melhor dizer isso do que mostrar um zero que parece resultado. */}
                  {v.leads === 0 && (
                    <div style={{ padding: "12px 14px", borderRadius: 12, background: "color-mix(in srgb,var(--atencao) 10%,transparent)", border: "1px solid color-mix(in srgb,var(--atencao) 30%,transparent)", fontSize: 12.5, display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ flex: "none", marginTop: 1 }}><Icon name="alert-triangle" size={14} color="var(--atencao)" /></span>
                      <span>Este funil não pede telefone nem e-mail, então não há como ligar as vendas a ele. Peça o WhatsApp antes de mandar pro checkout e as vendas passam a aparecer aqui.</span>
                    </div>
                  )}
                  {v.leads > 0 && v.vendas === 0 && (
                    <div style={{ padding: "12px 14px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 12.5, color: "var(--text-dim)" }}>
                      Nenhuma das {v.leads} pessoa(s) que deixaram contato virou pedido nos últimos {v.dias} dias.
                    </div>
                  )}

                  <div style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.6 }}>
                    Como conta: a venda é do funil quando o telefone (ou e-mail) que a pessoa deixou aqui aparece
                    num pedido do ERP em até {v.janela} dias. O valor é o do checkout, o mesmo que o Tridify usa.
                    Pedido excluído não entra, e cada pedido conta uma vez só — pro funil mais recente antes da compra.
                  </div>
                </>
              )}
            </div>
          )}

          {aba === "leads" && (
            <div style={{ marginTop: 16, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", overflow: "hidden" }}>
              {data.leads.length === 0
                ? <div style={{ padding: 24, fontSize: 13.5, color: "var(--text-dim)" }}>Nenhuma resposta coletada ainda. Publica o link no anúncio que eles aparecem aqui.</div>
                : (
                  <div style={{ padding: 12 }}>
                    <DataList
                      itens={data.leads.slice(0, 200)}
                      colunas={colunasLeads}
                      chaveDe={(l) => l.id}
                      rotulo="Respostas coletadas"
                      minWidth={Math.max(560, 360 + colunas.length * 140)}
                      densa
                    />
                  </div>
                )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
function Badge({ icon, texto }: { icon: string; texto: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "var(--text-dim)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 8px", maxWidth: "100%" }}>
      <Icon name={icon} size={12} color="var(--text-dim)" />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{texto}</span>
    </span>
  );
}

