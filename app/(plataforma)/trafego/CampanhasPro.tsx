"use client";

// ── Tridify · Campanhas Pro (§4) ─────────────────────────────────────────────
// Área de análise operacional: tabela avançada com CONJUNTOS DE MÉTRICAS salvos,
// busca, ordenação, agrupamento (por conta/objetivo/categoria), sparklines de
// tendência, indicadores de melhora/piora e expansão da linha (anúncios). O
// conjunto de métricas escolhido é salvo POR USUÁRIO e não muda ao trocar de
// conta/BM. Dados reais do overview do Meta (AdsOverview).

import { tfSet } from "./ajustes-na-conta";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { AdsOverview, AdMetrics, CampaignRow, AdSetRow, SparkPonto } from "@/lib/meta-ads";
import { fmtBRL2, fmtNum } from "@/lib/format";
import { GlassSelect } from "../GlassPicker";
import { Icon } from "../Icon";
import { VisorCriativo } from "../marketing/VisorCriativo";
import { useCriativosPorNome } from "../marketing/useCriativosPorNome";
import { normId } from "./FonteSelector";
import { diagnosticar } from "@/lib/trafego-diagnosticos";
import { EstrelaFavorito, IconeEstrela, Switch, useFavoritos } from "./TfKit";
import { EditorMetrica, fmtPorTipo, novoIdMetrica, type MetricaCustom } from "./MetricaFormulaEditor";
import { compilarFormula } from "@/lib/formula";
import { TfChart } from "./TfChart";
import { Portal } from "../Portal";
import type { DiaCampanha } from "@/lib/meta-warehouse";
import { useIsMobile } from "../ui/useMediaQuery";
import { DataList, type Coluna } from "../ui/DataList";
import { Fila, NumeroVivo, TrocaIcone, useAbrirFechar, useOnda } from "../ui/micro";
import { Botao, BotaoIcone, Caixa } from "../ui/controles";

// Persistência local simples (por usuário) — métricas custom e organizações.
function gravarLS(k: string, v: unknown) { try { tfSet(k, JSON.stringify(v)); } catch { /* quota/privado */ } }
function lerLS<T>(k: string, padrao: T): T { try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : padrao; } catch { return padrao; } }

const brl = (v: number | null) => (v == null ? "—" : fmtBRL2(v));
const num = (v: number | null) => (v == null ? "—" : fmtNum(v));
const roas = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}×`);
const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);
const roasCor = (n: number | null) => (n == null ? "var(--text)" : n >= 2 ? "var(--tf-pos)" : n >= 1 ? "var(--tf-warn)" : "var(--tf-neg)");
// Data da última edição (updated_time, epoch ms) — curta e com "há Nd" recente.
const fmtData = (v: number | null) => {
  if (v == null) return "—";
  const d = new Date(v);
  const dm = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  const dias = Math.floor((Date.now() - v) / 86400000);
  if (dias <= 0) return `hoje · ${dm}`;
  if (dias === 1) return `ontem · ${dm}`;
  if (dias < 7) return `${dias}d · ${dm}`;
  return dm;
};

const lucroM = (m: AdMetrics) => m.revenue - m.spend;
const margemM = (m: AdMetrics) => (m.revenue > 0 ? (lucroM(m) / m.revenue) * 100 : 0);
const ticketM = (m: AdMetrics) => (m.purchases > 0 ? m.revenue / m.purchases : 0);

// Variáveis que uma MÉTRICA POR FÓRMULA pode usar (uma por linha) + exemplo p/ a
// prévia do editor. lucro/margem/ticket são as derivadas que a tela já calcula.
const VARIAVEIS_CAMP = ["spend", "revenue", "roas", "clicks", "purchases", "impressions", "reach", "frequency", "leads", "ctr", "cpc", "cpm", "cpa", "cpl", "lucro", "margem", "ticket"];
const EXEMPLO_CAMP: Record<string, number> = { spend: 100, revenue: 400, roas: 4, clicks: 50, purchases: 8, impressions: 2000, reach: 1500, frequency: 1.3, leads: 10, ctr: 2.5, cpc: 2, cpm: 50, cpa: 12.5, cpl: 10, lucro: 300, margem: 75, ticket: 50 };
function varsDeCampanha(m: AdMetrics): Record<string, number> {
  return {
    spend: m.spend || 0, revenue: m.revenue || 0, roas: m.roas ?? 0, clicks: m.clicks || 0, purchases: m.purchases || 0,
    impressions: m.impressions || 0, reach: m.reach || 0, frequency: m.frequency || 0, leads: m.leads || 0,
    ctr: m.ctr || 0, cpc: m.cpc || 0, cpm: m.cpm || 0, cpa: m.cpa ?? 0, cpl: m.cpl ?? 0,
    lucro: lucroM(m), margem: margemM(m), ticket: ticketM(m),
  };
}

// `destaque` = a única coluna que ganha barra/heatmap colorido. Antes TODA coluna
// com `alto` pintava fundo + número em negrito colorido → parede de arco-íris
// ("tá tudo colorido"). Restringir às 4 métricas de DECISÃO (ROAS, CPA, Lucro,
// Margem) deixa a leitura limpa; o resto é número simples.
interface MetricDef { key: string; label: string; get: (m: AdMetrics) => number | null; fmt: (v: number | null) => string; cor?: (v: number | null) => string; alto?: "bom" | "ruim"; destaque?: boolean }
const METRICS: MetricDef[] = [
  { key: "spend", label: "Investimento", get: (m) => m.spend, fmt: brl, alto: "ruim" },
  { key: "revenue", label: "Faturamento", get: (m) => m.revenue, fmt: brl, alto: "bom" },
  { key: "roas", label: "ROAS", get: (m) => m.roas, fmt: roas, cor: roasCor, alto: "bom", destaque: true },
  { key: "cpa", label: "CPA", get: (m) => m.cpa, fmt: brl, alto: "ruim", destaque: true },
  { key: "purchases", label: "Vendas", get: (m) => m.purchases, fmt: num, alto: "bom" },
  { key: "lucro", label: "Lucro", get: (m) => lucroM(m), fmt: brl, alto: "bom", destaque: true },
  { key: "margem", label: "Margem", get: (m) => margemM(m), fmt: pct, alto: "bom", destaque: true },
  { key: "ticket", label: "Ticket médio", get: (m) => ticketM(m), fmt: brl },
  { key: "impressions", label: "Impressões", get: (m) => m.impressions, fmt: num },
  { key: "reach", label: "Alcance", get: (m) => m.reach, fmt: num },
  { key: "frequency", label: "Frequência", get: (m) => m.frequency, fmt: (v) => (v == null ? "—" : v.toFixed(2)), alto: "ruim" },
  { key: "cpm", label: "CPM", get: (m) => m.cpm, fmt: brl, alto: "ruim" },
  { key: "clicks", label: "Cliques", get: (m) => m.clicks, fmt: num },
  { key: "ctr", label: "CTR", get: (m) => m.ctr, fmt: pct, alto: "bom" },
  { key: "cpc", label: "CPC", get: (m) => m.cpc, fmt: brl, alto: "ruim" },
  { key: "leads", label: "Leads", get: (m) => m.leads, fmt: num, alto: "bom" },
  { key: "cpl", label: "CPL", get: (m) => m.cpl, fmt: brl, alto: "ruim" },
  // Última edição do objeto na Meta (orçamento/status/segmentação). Ordena por
  // data (epoch); sem heat (é data, não performance).
  { key: "atualizado", label: "Atualizado", get: (m) => m.updatedTime ?? null, fmt: fmtData },
];
const METRIC_BY: Record<string, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.key, m]));

const CONJUNTOS: { key: string; nome: string; metricas: string[] }[] = [
  // Espelha as colunas padrão do Gerenciador de Anúncios do Meta (Resultados,
  // Alcance, Impressões, Custo por resultado, Valor gasto). A "Veiculação" é
  // coluna fixa da tabela, não entra aqui.
  { key: "meta", nome: "Gerenciador (Meta)", metricas: ["purchases", "reach", "impressions", "cpa", "spend"] },
  { key: "performance", nome: "Performance", metricas: ["spend", "revenue", "roas", "cpa", "purchases", "lucro", "margem"] },
  { key: "entrega", nome: "Entrega", metricas: ["impressions", "reach", "frequency", "cpm", "clicks", "ctr", "cpc"] },
  { key: "funil", nome: "Funil", metricas: ["impressions", "clicks", "ctr", "purchases", "cpa"] },
  { key: "criativos", nome: "Criativos", metricas: ["ctr", "cpc", "frequency", "purchases", "roas"] },
  { key: "financeiro", nome: "Financeiro", metricas: ["revenue", "spend", "lucro", "margem", "roas", "ticket"] },
];

function somaM(rows: AdMetrics[]): AdMetrics {
  const s = rows.reduce((a, m) => ({
    spend: a.spend + m.spend, impressions: a.impressions + m.impressions, reach: a.reach + m.reach,
    clicks: a.clicks + m.clicks, purchases: a.purchases + m.purchases, revenue: a.revenue + m.revenue, leads: a.leads + m.leads,
  }), { spend: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, revenue: 0, leads: 0 });
  const ctr = s.impressions > 0 ? (s.clicks / s.impressions) * 100 : 0;
  const cpc = s.clicks > 0 ? s.spend / s.clicks : 0;
  const cpm = s.impressions > 0 ? (s.spend / s.impressions) * 1000 : 0;
  const roasV = s.spend > 0 ? s.revenue / s.spend : null;
  const cpa = s.purchases > 0 ? s.spend / s.purchases : null;
  const cpl = s.leads > 0 ? s.spend / s.leads : null;
  const frequency = s.reach > 0 ? s.impressions / s.reach : 0;
  return { ...s, ctr, cpc, cpm, roas: roasV, cpa, cpl, frequency };
}

// Rótulo de veiculação estilo Gerenciador de Anúncios: ponto colorido + texto.
function Veiculacao({ ativa }: { ativa: boolean | undefined }) {
  const cor = ativa === undefined ? "var(--text-dim)" : ativa ? "var(--tf-pos)" : "var(--text-dim)";
  const txt = ativa === undefined ? "—" : ativa ? "Ativa" : "Pausada";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: cor, whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: cor, flex: "none" }} />
      {txt}
    </span>
  );
}

// Seta de ordenação no cabeçalho. Apagada = coluna ordenável (dica visual);
// acesa = coluna ativa. Reserva o espaço sempre, então clicar não empurra o
// texto do header.
//
// Era um "↕/↓/↑" tipográfico — glifo fazendo papel de ÍCONE, que a casa não
// aceita. Em Tabler a dica apagada aponta pra BAIXO porque o primeiro clique
// ordena decrescente: a seta apagada é a prévia honesta do que vai acontecer.
// A virada usa `TrocaIcone` (receita `icon-swap`): os dois ícones dividem a
// mesma célula, então inverter a ordem não muda a largura do cabeçalho.
function Seta({ on, dir }: { on: boolean; dir: 1 | -1 }) {
  return (
    <span aria-hidden style={{ display: "inline-flex", verticalAlign: "middle", marginLeft: 4, opacity: on ? 1 : 0.28 }}>
      <TrocaIcone ligado={on && dir === 1} a="chevron-down" b="chevron-up" size={13}
        corA={on ? "var(--primary-texto)" : "currentColor"} corB="var(--primary-texto)" />
    </span>
  );
}

// Célula de métrica. SEM fundo/barra atrás do número (poluía) — só COR no
// número. As de DECISÃO (col.destaque: ROAS/CPA/Lucro/Margem) vêm coloridas
// (bom/ruim) e em negrito; o resto é número neutro simples.
function CelulaMetrica({ v, col, all, td }: { v: number | null; col: MetricDef; all: (number | null)[]; td: React.CSSProperties }) {
  const cor = col.cor ? col.cor(v) : (col.destaque ? heat(v, all, col.alto) : "var(--text)");
  return <td style={{ ...td, color: cor, fontWeight: col.destaque ? 700 : 500 }}>{col.fmt(v)}</td>;
}

// Cor "heat" de melhora/piora relativa dentro da coluna.
function heat(v: number | null, all: (number | null)[], alto?: "bom" | "ruim"): string {
  if (v == null || !alto) return "var(--text)";
  const nums = all.filter((x): x is number => x != null);
  if (nums.length < 2) return "var(--text)";
  const min = Math.min(...nums), max = Math.max(...nums);
  if (max === min) return "var(--text)";
  const t = (v - min) / (max - min);          // 0..1
  const bom = alto === "bom" ? t : 1 - t;      // 1 = melhor
  return bom > 0.66 ? "var(--tf-pos)" : bom < 0.33 ? "var(--tf-neg)" : "var(--text)";
}

type Group = "none" | "account" | "objetivo" | "categoria";

// Filtro avançado: uma condição métrica op valor (ex.: ROAS < 1, gasto > 500).
type FiltroAv = { id: string; metrica: string; op: "<" | ">" | "="; valor: number };
const OPS: FiltroAv["op"][] = ["<", ">", "="];
// "Organização" = layout nomeado salvo (colunas + filtros + ordenação + grupo).
type Organizacao = { id: string; nome: string; cols: string[]; filtrosAv?: FiltroAv[]; ordCol?: string; ordDir?: 1 | -1; grupo?: Group };
// metricBy recebido de fora pra enxergar TAMBÉM as métricas por fórmula (custom).
function passaFiltros(c: CampaignRow, filtros: FiltroAv[], metricBy: Record<string, MetricDef>): boolean {
  for (const f of filtros) {
    const def = metricBy[f.metrica]; if (!def) continue;
    const v = def.get(c);
    if (v == null) return false;
    if (f.op === "<" && !(v < f.valor)) return false;
    if (f.op === ">" && !(v > f.valor)) return false;
    if (f.op === "=" && !(Math.abs(v - f.valor) < 0.005)) return false;
  }
  return true;
}

export function CampanhasPro({ d, userId, contas = [], podeGerenciar = false }: { d: AdsOverview; userId: string; contas?: string[]; podeGerenciar?: boolean }) {
  const contasSet = useMemo(() => new Set(contas.map(normId)), [contas]);
  const key = `trafego.campanhas.metricas.${userId}`;
  const [sel, setSel] = useState<string[]>(CONJUNTOS[0].metricas);
  const [conjunto, setConjunto] = useState<string>(CONJUNTOS[0].key);   // padrão = Gerenciador (Meta)
  const [q, setQ] = useState("");
  const [grupo, setGrupo] = useState<Group>("none");
  const [ordCol, setOrdCol] = useState<string>("revenue");
  const [ordDir, setOrdDir] = useState<1 | -1>(-1);
  const [aberta, setAberta] = useState<string | null>(null);
  // Drill-down "dia a dia" de UMA campanha. Guarda id+conta+nome, então continua
  // aberto mesmo trocando o período global (busca a própria série por id).
  const [analise, setAnalise] = useState<{ id: string; name: string; accountId: string } | null>(null);
  const [editor, setEditor] = useState(false);
  const [soFav, setSoFav] = useState(false);
  const [tagsSel, setTagsSel] = useState<string[]>([]);   // filtro por tag (E lógico)
  // Navegação por NÍVEL, como no Gerenciador do Meta. `escopo` guarda o que foi
  // "aberto" no nível de cima (campanha → conjuntos daquela campanha, etc.).
  const [nivel, setNivel] = useState<Nivel>("campanhas");
  const [escopo, setEscopo] = useState<{ campanha?: string; conjunto?: string }>({});
  // "Ver o anúncio" no nível de anúncios: abre a peça da biblioteca (pelo
  // código no nome) e a prévia da Meta, sem sair da tabela.
  const [verAnuncio, setVerAnuncio] = useState<{ id: string; name: string } | null>(null);
  const nomesAnuncios = useMemo(() => d.anuncios.map((a) => a.name), [d.anuncios]);
  const ligacao = useCriativosPorNome(nomesAnuncios);
  const fav = useFavoritos(userId);
  const [denso, setDenso] = useState(false);
  const [filtrosAv, setFiltrosAv] = useState<FiltroAv[]>([]);
  const [abrirFiltro, setAbrirFiltro] = useState(false);
  const carregou = useRef(false);
  const onda = useOnda();

  // Métricas por FÓRMULA (pool por usuário) + ORGANIZAÇÕES (layouts nomeados).
  const kCustom = `trafego.campanhas.metricasCustom.${userId}`;
  const kOrgs = `trafego.campanhas.orgs.${userId}`;
  const [metricasCustom, setMetricasCustom] = useState<MetricaCustom[]>([]);
  const [orgs, setOrgs] = useState<Organizacao[]>([]);
  const [orgAtiva, setOrgAtiva] = useState<string | null>(null);   // tabela salva em uso (destaque)
  const [dragCol, setDragCol] = useState<number | null>(null);     // índice arrastado na faixa de ordem
  const [editandoMetrica, setEditandoMetrica] = useState<MetricaCustom | "nova" | null>(null);

  useEffect(() => {
    try { const s = localStorage.getItem(key); if (s) { const p = JSON.parse(s); if (Array.isArray(p.metricas)) { setSel(p.metricas); setConjunto(p.conjunto ?? "custom"); } if (typeof p.denso === "boolean") setDenso(p.denso); if (Array.isArray(p.filtrosAv)) setFiltrosAv(p.filtrosAv); } } catch { /* */ }
    setMetricasCustom(lerLS<MetricaCustom[]>(kCustom, []));
    setOrgs(lerLS<Organizacao[]>(kOrgs, []));
    carregou.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kCustom, kOrgs]);

  // Métricas custom viram MetricDef de verdade (compiladas UMA vez, não por
  // linha): passam a funcionar como coluna ordenável/filtrável/exportável.
  const customDefs = useMemo<MetricDef[]>(() => metricasCustom.map((m) => {
    const f = compilarFormula(m.formula);
    return { key: `f:${m.id}`, label: m.nome, get: (row: AdMetrics) => (f ? f.calcular(varsDeCampanha(row)) : null), fmt: fmtPorTipo[m.tipo], alto: m.alto, destaque: !!m.alto };
  }), [metricasCustom]);
  const allMetrics = useMemo(() => [...METRICS, ...customDefs], [customDefs]);
  const metricBy = useMemo(() => Object.fromEntries(allMetrics.map((m) => [m.key, m])) as Record<string, MetricDef>, [allMetrics]);

  // Persiste densidade + filtros junto das métricas (mesma chave por usuário).
  function persistir(extra: Record<string, unknown>) {
    try {
      const cur = JSON.parse(localStorage.getItem(key) || "{}");
      tfSet(key, JSON.stringify({ ...cur, metricas: sel, conjunto, denso, filtrosAv, ...extra }));
    } catch { /* */ }
  }
  const mudarDenso = (v: boolean) => { setDenso(v); persistir({ denso: v }); };

  // Exporta a tabela ATUAL (já filtrada/ordenada) com as colunas visíveis. É o
  // que o gestor mais pede: levar pro Excel/planilha. Número em vírgula (pt-BR).
  function exportarCSV() {
    const cab = ["Campanha", "Conta", ...cols.map((c) => c.label)];
    const linhasCSV = linhas.map((c) => [
      `"${(c.name ?? "").replace(/"/g, '""')}"`, `"${(c.account ?? "").replace(/"/g, '""')}"`,
      ...cols.map((col) => { const v = col.get(c); return v == null ? "" : String(v).replace(".", ","); }),
    ].join(";"));
    const csv = "﻿" + [cab.join(";"), ...linhasCSV].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `campanhas-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const mudarFiltros = (f: FiltroAv[]) => { setFiltrosAv(f); persistir({ filtrosAv: f }); };
  // Adição robusta: atualização FUNCIONAL — não perde um filtro se dois entram
  // no mesmo tick (o mudarFiltros com [...filtrosAv] usaria o array antigo).
  const addFiltro = (f: FiltroAv) => { setOrgAtiva(null); setFiltrosAv((prev) => { const nv = [...prev, f]; persistir({ filtrosAv: nv }); return nv; }); };

  function usarConjunto(k: string) { const c = CONJUNTOS.find((x) => x.key === k); if (!c) return; setOrgAtiva(null); setConjunto(k); setSel(c.metricas); salvar(c.metricas, k); }
  function toggleMetrica(mk: string) { setOrgAtiva(null); const nv = sel.includes(mk) ? sel.filter((x) => x !== mk) : [...sel, mk]; setSel(nv); setConjunto("custom"); salvar(nv, "custom"); }
  // Reordena as colunas: tira `from` e insere na posição `to`. A ordem de `sel`
  // é a ordem das colunas na tabela.
  function moverColuna(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    setOrgAtiva(null);
    setSel((prev) => { const nv = [...prev]; const [x] = nv.splice(from, 1); nv.splice(to, 0, x); salvar(nv, "custom"); return nv; });
    setConjunto("custom");
  }
  function salvar(metricas: string[], conj: string) { try { tfSet(key, JSON.stringify({ metricas, conjunto: conj })); } catch { /* */ } }

  // ── Métricas por fórmula: criar/editar/apagar (pool por usuário) ──
  const salvarMetrica = (m: MetricaCustom) => {
    setMetricasCustom((p) => { const n = p.some((x) => x.id === m.id) ? p.map((x) => (x.id === m.id ? m : x)) : [...p, m]; gravarLS(kCustom, n); return n; });
    if (!sel.includes(`f:${m.id}`)) { const nv = [...sel, `f:${m.id}`]; setSel(nv); setConjunto("custom"); salvar(nv, "custom"); }
    setEditandoMetrica(null);
  };
  const apagarMetrica = (id: string) => {
    setMetricasCustom((p) => { const n = p.filter((x) => x.id !== id); gravarLS(kCustom, n); return n; });
    const nv = sel.filter((k) => k !== `f:${id}`); setSel(nv); salvar(nv, conjunto);
    if (ordCol === `f:${id}`) setOrdCol("revenue");
    setFiltrosAv((p) => { const n = p.filter((f) => f.metrica !== `f:${id}`); persistir({ filtrosAv: n }); return n; });
  };

  // ── Organizações (layouts nomeados): salvar/aplicar/apagar ──
  const salvarOrg = (nome: string) => {
    const nm = nome.trim(); if (!nm) return;
    setOrgs((p) => { const existente = p.find((x) => x.nome === nm); const id = existente?.id ?? novoIdMetrica(); const o: Organizacao = { id, nome: nm, cols: sel, filtrosAv, ordCol, ordDir, grupo }; const n = existente ? p.map((x) => (x.id === id ? o : x)) : [...p, o]; gravarLS(kOrgs, n); setOrgAtiva(id); return n; });
  };
  const aplicarOrg = (o: Organizacao) => {
    setSel(o.cols); setConjunto("custom"); salvar(o.cols, "custom");
    mudarFiltros(o.filtrosAv ?? []);
    setOrdCol(o.ordCol ?? "revenue"); setOrdDir(o.ordDir ?? -1);
    setGrupo(o.grupo ?? "none");
    setOrgAtiva(o.id);
  };
  const apagarOrg = (id: string) => setOrgs((p) => { const n = p.filter((x) => x.id !== id); gravarLS(kOrgs, n); if (orgAtiva === id) setOrgAtiva(null); return n; });

  const cols = sel.map((k) => metricBy[k]).filter(Boolean);

  // Status ATIVA/PAUSADA por campanha (declarado ANTES da ordenação porque a
  // coluna Status também ordena). O efeito que popula fica mais abaixo.
  const [statusMap, setStatusMap] = useState<Map<string, boolean>>(new Map());
  const [pendentes, setPendentes] = useState<Set<string>>(new Set());

  // Valor de ordenação por coluna — inclui as NÃO-métricas (nome da campanha,
  // veiculação ativa/pausada), que antes não ordenavam.
  const sortVal = (c: CampaignRow, k: string): number | string => {
    if (k === "__name") return (c.name || "").toLowerCase();
    if (k === "__status") { const st = statusMap.get(c.id); return st === true ? 2 : st === false ? 1 : 0; }
    return metricBy[k]?.get(c) ?? -Infinity;
  };

  const linhas = useMemo(() => {
    const filtro = q.trim().toLowerCase();
    let rows = d.campanhas.filter((c) =>
      (contasSet.size === 0 || contasSet.has(normId(c.accountId)))
      && (!soFav || fav.has(`campanha:${c.id}`))
      && passaFiltros(c, filtrosAv, metricBy)
      // Filtro por TAG (E lógico: a campanha precisa ter TODAS as tags marcadas).
      && (tagsSel.length === 0 || tagsSel.every((t) => c.tags.includes(t)))
      // A busca também alcança tag e categoria — dá pra digitar "{MKT}" ou "carimbo".
      && (!filtro || c.name.toLowerCase().includes(filtro) || (c.account ?? "").toLowerCase().includes(filtro)
        || (c.categoria ?? "").toLowerCase().includes(filtro) || c.tags.some((t) => t.toLowerCase().includes(filtro))));
    rows = [...rows].sort((a, b) => {
      const va = sortVal(a, ordCol), vb = sortVal(b, ordCol);
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb)) * ordDir;
      return (va - vb) * ordDir;
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.campanhas, q, ordCol, ordDir, contasSet, soFav, fav, filtrosAv, statusMap, metricBy, tagsSel]);

  // Linhas dos níveis CONJUNTOS / ANÚNCIOS: mesmo filtro de conta e busca, mais
  // o escopo aberto no nível de cima. Ordena por gasto (como o Meta faz).
  const linhasConjuntos = useMemo(() => {
    const f = q.trim().toLowerCase();
    return d.conjuntos
      .filter((s) => (!escopo.campanha || s.campaign === escopo.campanha)
        && (!f || s.name.toLowerCase().includes(f) || (s.campaign ?? "").toLowerCase().includes(f)))
      .sort((a, b) => b.spend - a.spend);
  }, [d.conjuntos, escopo.campanha, q]);

  const linhasAnuncios = useMemo(() => {
    const f = q.trim().toLowerCase();
    return d.anuncios
      .filter((a) => (!escopo.campanha || a.campaign === escopo.campanha)
        && (!f || a.name.toLowerCase().includes(f) || (a.campaign ?? "").toLowerCase().includes(f)))
      .sort((a, b) => b.spend - a.spend);
  }, [d.anuncios, escopo.campanha, q]);

  // Tags disponíveis (das campanhas visíveis por conta), com quantas campanhas
  // cada uma tem — as mais usadas primeiro.
  const tagsDisp = useMemo(() => {
    const cont = new Map<string, number>();
    for (const c of d.campanhas) {
      if (contasSet.size > 0 && !contasSet.has(normId(c.accountId))) continue;
      for (const t of c.tags) cont.set(t, (cont.get(t) ?? 0) + 1);
    }
    return [...cont.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [d.campanhas, contasSet]);

  // Destaque de linha-problema (§15): reusa o MOTOR de diagnósticos (não uma
  // regra nova). Campanha que aparece como risco vira uma faixa na linha; id do
  // risco é "<tipo>:<campaignId>". Assim tabela e painel concordam no que é
  // problema — uma fonte de verdade.
  const problemas = useMemo(() => {
    const { riscos } = diagnosticar({ campanhas: d.campanhas, kpis: d.kpis, kpisPrev: d.kpisPrev });
    const m = new Map<string, "alta" | "media">();
    for (const r of riscos) {
      const id = r.id.includes(":") ? r.id.split(":")[1] : "";
      if (!id) continue;
      if (r.severidade === "alta" || !m.has(id)) m.set(id, r.severidade === "alta" ? "alta" : "media");
    }
    return m;
  }, [d]);

  // Scroll infinito (como no Gerenciador do Meta) no lugar de paginação: mostra
  // um lote e vai crescendo conforme a sentinela no fim da tabela entra na tela.
  // Some o "achar a campanha na página X" — é só rolar.
  const LOTE = 40;
  const [visiveis, setVisiveis] = useState(LOTE);
  const fimRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setVisiveis(LOTE); }, [q, ordCol, ordDir, grupo, soFav, contasSet, filtrosAv, tagsSel]);
  const linhasPag = grupo === "none" ? linhas.slice(0, visiveis) : linhas;
  const temMais = grupo === "none" && visiveis < linhas.length;
  useEffect(() => {
    if (!temMais) return;
    const el = fimRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) setVisiveis((v) => Math.min(v + LOTE, linhas.length));
    }, { rootMargin: "600px 0px" });   // carrega ANTES de chegar no fim
    io.observe(el);
    return () => io.disconnect();
  }, [temMais, linhas.length]);

  // Agrupamento (opera sobre a página atual quando sem grupo).
  const grupos = useMemo(() => {
    if (grupo === "none") return [{ nome: "", rows: linhasPag }];
    const map = new Map<string, CampaignRow[]>();
    for (const c of linhasPag) {
      const g = grupo === "account" ? (c.account || "Sem conta") : grupo === "objetivo" ? (c.objetivo || "Sem objetivo") : (c.categoria || "Sem categoria");
      (map.get(g) ?? map.set(g, []).get(g)!).push(c);
    }
    return [...map.entries()].map(([nome, rows]) => ({ nome, rows }));
  }, [linhasPag, grupo]);

  // Seleção em massa (§15) — `marcadas` p/ não colidir com `sel` (métricas).
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const toggleMarcada = (id: string) => setMarcadas((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selecionadas = useMemo(() => linhas.filter((c) => marcadas.has(c.id)), [linhas, marcadas]);
  const limparMarcadas = () => setMarcadas(new Set());

  // Busca do status em LOTE só as campanhas da PÁGINA atual (agrupadas por conta
  // no servidor) — sem N+1. Só pra quem gerencia. (statusMap/pendentes declarados
  // mais acima porque a ordenação pela coluna Status precisa deles.)
  // Ao expandir uma campanha, também buscamos o status dos ANÚNCIOS dela (pra o
  // switch de anúncio). Anúncio usa a conta da campanha-pai.
  const abertaRow = aberta ? (linhas.find((c) => c.id === aberta) ?? null) : null;
  const adsDaAberta = useMemo(() => (abertaRow ? d.anuncios.filter((a) => a.campaign === abertaRow.name) : []), [abertaRow, d.anuncios]);
  const setsDaAberta = useMemo(() => (abertaRow ? d.conjuntos.filter((s) => s.campaign === abertaRow.name) : []), [abertaRow, d.conjuntos]);
  const chaveVisiveis = linhasPag.map((c) => c.id).join(",") + "|" + adsDaAberta.map((a) => a.id).join(",") + "|" + setsDaAberta.map((s) => s.id).join(",");
  useEffect(() => {
    if (!podeGerenciar || !linhasPag.length) return;
    let vivo = true;
    const nodes = [
      ...linhasPag.map((c) => ({ id: c.id, accountId: c.accountId })),
      ...(abertaRow ? adsDaAberta.map((a) => ({ id: a.id, accountId: abertaRow.accountId })) : []),
      ...(abertaRow ? setsDaAberta.map((s) => ({ id: s.id, accountId: abertaRow.accountId })) : []),
    ];
    fetch("/api/trafego/campanha/status", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes }),
    }).then((r) => (r.ok ? r.json() : { status: {} })).then((j) => {
      if (!vivo) return;
      setStatusMap((prev) => {
        const n = new Map(prev);
        for (const [id, s] of Object.entries(j.status ?? {})) {
          const st = s as { effectiveStatus?: string; status?: string };
          n.set(id, (st.effectiveStatus ?? st.status) === "ACTIVE");
        }
        return n;
      });
    }).catch(() => {});
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveVisiveis, podeGerenciar]);

  // Toggle otimista genérico (campanha OU anúncio): vira o switch na hora, chama
  // a Meta, reverte se falhar. id de campanha e de anúncio não colidem.
  const alternar = async (id: string, accountId: string, tipo: "campaign" | "adset" | "ad") => {
    const atual = statusMap.get(id);
    const alvo = !(atual === true);   // undefined/false → ativar; true → pausar
    setStatusMap((p) => new Map(p).set(id, alvo));
    setPendentes((p) => new Set(p).add(id));
    try {
      const r = await fetch("/api/trafego/campanha/gerenciar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, id, accountId, acao: alvo ? "ativar" : "pausar" }),
      });
      if (!r.ok) setStatusMap((p) => new Map(p).set(id, atual === true));   // reverte
    } catch {
      setStatusMap((p) => new Map(p).set(id, atual === true));
    } finally {
      setPendentes((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  };

  function clickCol(k: string) { if (ordCol === k) setOrdDir((d2) => (d2 === 1 ? -1 : 1)); else { setOrdCol(k); setOrdDir(-1); } }

  // A reordenação de coluna ARRASTANDO o cabeçalho foi REMOVIDA: o `draggable` no
  // <th> engolia o clique de ordenar E o scroll lateral ("se eu arrasto pro lado
  // buga tudo"). A ordem das colunas agora segue só o conjunto/editor de métricas.

  const th: React.CSSProperties = { padding: "10px 12px", fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap", textAlign: "right", cursor: "pointer", userSelect: "none" };
  const td: React.CSSProperties = { padding: denso ? "5px 12px" : "11px 12px", fontSize: denso ? 12.5 : 13, textAlign: "right", whiteSpace: "nowrap" };
  const allByCol = (col: MetricDef) => linhas.map((r) => col.get(r));

  // ── Celular: a linha vira CARTÃO ────────────────────────────────────────────
  // A coluna Nome é fixa (sticky) com 220px de largura mínima: em 320px sobravam
  // ~48px pra TODAS as métricas. Aqui a mesma campanha vira um cartão com nome,
  // conta, veiculação, as primeiras métricas do conjunto escolhido e as ações. A
  // tabela cheia (todas as colunas, agrupamento e a gaveta com diagnóstico) é do
  // computador — no dedo ela nunca foi legível.
  const celular = useIsMobile();
  const METRICAS_NO_CARTAO = 4;
  const colunasCartao = useMemo<Coluna<CampaignRow>[]>(() => [
    {
      chave: "__nome", titulo: "Campanha", papel: "titulo",
      render: (c) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {/* O <label> dá os 44px de alvo sem inchar o checkbox nem a linha. */}
          <label title="Selecionar" style={{ flex: "none", display: "grid", placeItems: "center", width: "var(--tap)", height: "var(--tap)", margin: "-11px -6px -11px -12px", cursor: "pointer" }}>
            <Caixa marcado={marcadas.has(c.id)} onChange={() => toggleMarcada(c.id)} titulo="Selecionar" />
          </label>
          <EstrelaFavorito on={fav.has(`campanha:${c.id}`)} onToggle={() => fav.toggle(`campanha:${c.id}`)} size={17} />
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{c.name}</span>
        </div>
      ),
    },
    { chave: "__conta", titulo: "Conta", render: (c) => <>{c.account || "—"}</> },
    {
      chave: "__veic", titulo: "Veiculação",
      render: (c) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Veiculacao ativa={statusMap.get(c.id)} />
          {podeGerenciar && (
            <Switch estado={statusMap.get(c.id)} pendente={pendentes.has(c.id)} onToggle={() => alternar(c.id, c.accountId, "campaign")}
              titulo={statusMap.get(c.id) === undefined ? "Status desconhecido" : statusMap.get(c.id) ? "Ativa — toque pra pausar" : "Pausada — toque pra ativar"} />
          )}
        </span>
      ),
    },
    ...cols.slice(0, METRICAS_NO_CARTAO).map((col, i): Coluna<CampaignRow> => ({
      chave: col.key, titulo: col.label, papel: i === 0 ? "destaque" : "meta",
      render: (c: CampaignRow) => <>{col.fmt(col.get(c))}</>,
    })),
    {
      chave: "__acoes", titulo: "Ações", papel: "acoes",
      render: (c) => (
        <div style={{ display: "flex", gap: 8 }}>
          <Botao variante="secundario" icone="chevron-right" onClick={() => { setEscopo({ campanha: c.name }); setNivel("conjuntos"); }}>Conjuntos</Botao>
          <Botao variante="secundario" icone="chart-line" onClick={() => setAnalise({ id: c.id, name: c.name, accountId: c.accountId })}>Análise</Botao>
        </div>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [cols, marcadas, fav, statusMap, pendentes, podeGerenciar]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Barra: conjuntos de métricas + busca + agrupar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* .tab-strip: a fileira rola de lado no estreito em vez de ser cortada. */}
        <div className="tab-strip" style={{ display: "inline-flex", gap: 2, background: "var(--seg-track)", padding: 3, borderRadius: 11, border: "1px solid var(--border)" }}>
          {CONJUNTOS.map((c) => (
            <button key={c.key} onClick={() => usarConjunto(c.key)} className="mt-anel" onPointerDown={onda} style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: conjunto === c.key ? "var(--primary-acao, var(--primary))" : "transparent", color: conjunto === c.key ? "var(--on-primary, #fff)" : "var(--text-dim)" }}>{c.nome}</button>
          ))}
          <button onClick={() => setEditor((v) => !v)} title="Montar meu conjunto" className="mt-anel" onPointerDown={onda} style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: conjunto === "custom" ? "var(--primary-acao, var(--primary))" : "transparent", color: conjunto === "custom" ? "var(--on-primary, #fff)" : "var(--text-dim)" }}>{conjunto === "custom" ? "Meu conjunto" : "+ Personalizar"}</button>
        </div>
        <OrgSelector orgs={orgs} ativa={orgAtiva} onAplicar={aplicarOrg} onSalvar={salvarOrg} onApagar={apagarOrg} />
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 160 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><Icon name="search" size={14} color="var(--text-dim)" /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar campanha ou conta…" style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px 8px 30px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }} />
        </div>
        <div className="tab-strip" style={{ display: "inline-flex", gap: 2, background: "var(--seg-track)", padding: 3, borderRadius: 11, border: "1px solid var(--border)" }}>
          {([["none", "Sem grupo"], ["account", "Conta"], ["objetivo", "Objetivo"], ["categoria", "Categoria"]] as [Group, string][]).map(([g, l]) => (
            <button key={g} onClick={() => { setOrgAtiva(null); setGrupo(g); }} className="mt-anel" onPointerDown={onda} style={{ padding: "6px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: grupo === g ? "var(--seg-pill)" : "transparent", color: grupo === g ? "var(--text)" : "var(--text-dim)", boxShadow: grupo === g ? "0 1px 3px rgba(0,0,0,.2)" : "none" }}>{l}</button>
          ))}
        </div>
        {/* Só favoritos: acende dourado quando ativo; desabilitado sem nenhum favorito. */}
        <button onClick={() => setSoFav((v) => !v)} disabled={fav.count === 0 && !soFav} className="mt-anel" onPointerDown={onda}
          title={fav.count === 0 ? "Favorite campanhas na estrela da linha" : soFav ? "Mostrar todas" : "Mostrar só favoritas"}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: fav.count === 0 && !soFav ? "default" : "pointer",
            border: `1px solid ${soFav ? "var(--tf-gold, #b9975b)" : "var(--border)"}`,
            background: soFav ? "color-mix(in srgb, var(--tf-gold, #b9975b) 16%, transparent)" : "var(--surface)",
            color: soFav ? "var(--tf-gold, #b9975b)" : "var(--text-dim)", opacity: fav.count === 0 && !soFav ? 0.5 : 1 }}>
          {/* Só o desenho: o clique é do chip inteiro. O `EstrelaFavorito`
              aqui punha um <button> dentro de outro, e o React recusava
              hidratar — descartava o HTML do servidor e repintava tudo. */}
          <IconeEstrela on={soFav} size={14} />
          Favoritas{fav.count > 0 ? ` · ${fav.count}` : ""}
        </button>
        {/* Filtros avançados (métrica op valor). Acende roxo quando há filtro. */}
        <button onClick={() => setAbrirFiltro((v) => !v)} title="Filtrar por métrica (ROAS < 1, gasto > 500…)" className="mt-anel" onPointerDown={onda}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${filtrosAv.length ? "var(--primary)" : "var(--border)"}`,
            background: filtrosAv.length ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)",
            color: filtrosAv.length ? "var(--primary-texto)" : "var(--text-dim)" }}>
          <Icon name="filter" size={14} color={filtrosAv.length ? "var(--primary-texto)" : "var(--text-dim)"} />
          Filtros{filtrosAv.length ? ` · ${filtrosAv.length}` : ""}
        </button>
        {/* Densidade: mais linhas na tela. */}
        <button onClick={() => mudarDenso(!denso)} title={denso ? "Modo confortável" : "Modo compacto (mais linhas)"} className="mt-anel" onPointerDown={onda}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "1px solid var(--border)", background: denso ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)", color: denso ? "var(--primary-texto)" : "var(--text-dim)" }}>
          {/* Troca de ícone é uma das exceções SIMÉTRICAS da escala (mesma
              duração nos dois sentidos): nenhum dos dois estados é "abrir". */}
          <TrocaIcone ligado={denso} a="menu-2" b="layout-list" size={14} corA="var(--text-dim)" corB="var(--primary-texto)" />
          {denso ? "Compacto" : "Confortável"}
        </button>
        {/* Exportar CSV da tabela atual (filtros + colunas + ordenação). */}
        <Botao variante="secundario" icone="download" onClick={exportarCSV} title="Baixar as campanhas visíveis em CSV">CSV</Botao>
      </div>

      {/* Troca RÁPIDA entre tabelas salvas (1 clique). A ativa fica destacada;
          mexer em métrica/filtro/grupo tira o destaque (virou "custom"). */}
      {orgs.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em" }}>Tabelas</span>
          {orgs.map((o) => {
            const on = orgAtiva === o.id;
            return (
              <button key={o.id} onClick={() => aplicarOrg(o)} title={`Aplicar a tabela "${o.nome}"`} className="mt-anel" onPointerDown={onda}
                style={{ padding: "5px 12px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 700,
                  border: on ? "1px solid var(--primary)" : "1px solid var(--border)",
                  background: on ? "color-mix(in srgb, var(--primary) 16%, transparent)" : "var(--surface)",
                  color: on ? "var(--text)" : "var(--text-dim)" }}>{o.nome}</button>
            );
          })}
        </div>
      )}

      {/* Chips dos filtros ATIVOS + limpar */}
      {filtrosAv.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {filtrosAv.map((f) => (
            <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, border: "1px solid color-mix(in srgb, var(--primary) 40%, transparent)", background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary-texto, var(--primary))" }}>
              {metricBy[f.metrica]?.label ?? f.metrica} {f.op} {metricBy[f.metrica]?.fmt(f.valor) ?? f.valor}
              <button onClick={() => mudarFiltros(filtrosAv.filter((x) => x.id !== f.id))} style={{ display: "inline-flex", border: "none", background: "none", cursor: "pointer", padding: 0, color: "inherit" }}><Icon name="x" size={13} color="currentColor" /></button>
            </span>
          ))}
          <button onClick={() => mudarFiltros([])} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: 12, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>Limpar filtros</button>
        </div>
      )}

      {/* Construtor de filtro avançado (inclui métricas por fórmula) */}
      {abrirFiltro && <FiltroBuilder metricas={allMetrics} onAdd={addFiltro} onClose={() => setAbrirFiltro(false)} />}

      {/* Editor de conjunto (escolher métricas + criar métricas por fórmula) */}
      {editor && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 14, background: "var(--surface)", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Ordem das colunas — arraste pra reordenar (a ordem daqui é a da tabela) */}
          {sel.length > 0 && (
            <div>
              {/* Arrastar (draggable HTML5) é inerte no toque. Como `moverColuna`
                  já existe, no celular a mesma ação vira duas setas — reordenar
                  continua possível em vez de virar "só no computador". */}
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Ordem das colunas <span style={{ fontWeight: 600, color: "var(--text-dim)" }}>— {celular ? "use as setas pra reordenar" : "arraste pra reordenar"}</span></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {sel.map((k, i) => {
                  const m = metricBy[k]; if (!m) return null;
                  const arrastando = dragCol === i;
                  const seta = (dir: -1 | 1) => (
                    <BotaoIcone icone={dir < 0 ? "chevron-left" : "chevron-right"} tamanho="sm"
                      titulo={`${m.label}: mover pra ${dir < 0 ? "esquerda" : "direita"}`}
                      onClick={() => moverColuna(i, i + dir)} disabled={dir < 0 ? i === 0 : i === sel.length - 1} />
                  );
                  return (
                    <div key={k} draggable={!celular}
                      onDragStart={() => setDragCol(i)}
                      onDragOver={(e) => { e.preventDefault(); if (dragCol != null && dragCol !== i) { moverColuna(dragCol, i); setDragCol(i); } }}
                      onDragEnd={() => setDragCol(null)}
                      title={celular ? undefined : "Arraste pra mudar a posição"}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: celular ? "3px 4px 3px 10px" : "6px 10px", borderRadius: 9, cursor: celular ? "default" : "grab", fontSize: 12, fontWeight: 700,
                        minHeight: celular ? "var(--tap)" : undefined,
                        border: "1px solid var(--primary)", background: "color-mix(in srgb, var(--primary) 14%, transparent)", color: "var(--text)",
                        opacity: arrastando ? 0.4 : 1 }}>
                      {!celular && <Icon name="drag-drop" size={13} color="var(--text-dim)" />}
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--text-dim)", minWidth: 12 }}>{i + 1}</span>
                      {m.label}
                      {celular && <span style={{ display: "inline-flex", marginLeft: 2 }}>{seta(-1)}{seta(1)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>Métricas do conjunto ({sel.length}) — clique pra incluir/tirar, salva pra você</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {allMetrics.map((m) => {
                const on = sel.includes(m.key);
                const custom = m.key.startsWith("f:");
                return (
                  <span key={m.key} style={{ display: "inline-flex", alignItems: "center" }}>
                    <button onClick={() => toggleMetrica(m.key)} className="mt-anel" onPointerDown={onda} style={{ padding: "6px 12px", borderRadius: custom ? "999px 0 0 999px" : 999, cursor: "pointer", fontSize: 12, fontWeight: 700, border: on ? "1px solid var(--primary)" : "1px solid var(--border)", borderRight: custom ? "none" : undefined, background: on ? "color-mix(in srgb, var(--primary) 16%, transparent)" : "var(--surface-2, transparent)", color: on ? "var(--text)" : "var(--text-dim)" }}>{custom ? <><span style={{ fontStyle: "italic", fontWeight: 800, marginRight: 3 }}>ƒ</span>{m.label}</> : m.label}</button>
                    {custom && (
                      <button onClick={() => { const mc = metricasCustom.find((x) => `f:${x.id}` === m.key); if (mc) setEditandoMetrica(mc); }} title="Editar/apagar fórmula" style={{ padding: "6px 8px", borderRadius: "0 999px 999px 0", cursor: "pointer", fontSize: 11, fontWeight: 700, border: on ? "1px solid var(--primary)" : "1px solid var(--border)", borderLeft: "1px solid var(--border)", background: on ? "color-mix(in srgb, var(--primary) 16%, transparent)" : "var(--surface-2, transparent)", color: "var(--text-dim)" }}><Icon name="settings" size={11} color="currentColor" /></button>
                    )}
                  </span>
                );
              })}
              <button onClick={() => setEditandoMetrica("nova")} style={{ padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 700, border: "1px dashed var(--primary)", background: "transparent", color: "var(--primary-texto, var(--primary))" }}>+ Métrica por fórmula</button>
            </div>
          </div>
          {editandoMetrica && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>{editandoMetrica === "nova" ? "Nova métrica por fórmula" : `Editar "${editandoMetrica.nome}"`}</div>
              <EditorMetrica inicial={editandoMetrica === "nova" ? undefined : editandoMetrica} variaveis={VARIAVEIS_CAMP} exemplo={EXEMPLO_CAMP} onSalvar={salvarMetrica} onCancelar={() => setEditandoMetrica(null)} />
              {editandoMetrica !== "nova" && (
                <Botao variante="perigo" tamanho="sm" icone="trash" onClick={() => { apagarMetrica(editandoMetrica.id); setEditandoMetrica(null); }} style={{ marginTop: 8 }}>Apagar esta métrica</Botao>
              )}
            </div>
          )}
        </div>
      )}

      {/* Barra de AÇÕES EM MASSA — aparece com seleção; pausar/ativar só p/ quem gerencia. */}
      {selecionadas.length > 0 && (
        <BulkBar selecionadas={selecionadas} podeGerenciar={podeGerenciar} onLimpar={limparMarcadas} />
      )}

      {/* NÍVEIS (Gerenciador do Meta): Campanhas › Conjuntos › Anúncios.
          Abrir uma campanha "entra" nela e filtra os níveis de baixo. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div className="tab-strip" style={{ display: "inline-flex", gap: 2, background: "var(--seg-track, var(--surface-2))", borderRadius: 10, padding: 3 }}>
          {(["campanhas", "conjuntos", "anuncios"] as Nivel[]).map((n) => (
            <button key={n} onClick={() => setNivel(n)} className="mt-anel" onPointerDown={onda}
              style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                background: nivel === n ? "var(--primary-acao, var(--primary))" : "transparent", color: nivel === n ? "var(--on-primary, #fff)" : "var(--text-dim)" }}>
              {n === "campanhas" ? "Campanhas" : n === "conjuntos" ? "Conjuntos" : "Anúncios"}
            </button>
          ))}
        </div>
        {escopo.campanha && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text-dim)" }}>
            <Icon name="filter" size={13} color="var(--primary-texto)" />
            dentro de <b style={{ color: "var(--text)", maxWidth: "min(320px, 58vw)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{escopo.campanha}</b>
            <button onClick={() => setEscopo({})} title="Ver todos" style={{ display: "inline-flex", border: "none", background: "none", cursor: "pointer", padding: 0, color: "var(--text-dim)" }}>
              <Icon name="x" size={13} color="currentColor" />
            </button>
          </span>
        )}
      </div>

      {/* Filtro por TAG — chips das tags extraídas do nome da campanha ({MKT},
          {SM-xxxx}…). Clique acumula (E lógico). */}
      {nivel === "campanhas" && tagsDisp.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em" }}>Tags</span>
          <button onClick={() => setTagsSel([])} className="mt-anel" onPointerDown={onda}
            style={chipTag(tagsSel.length === 0)}>Todas</button>
          {tagsDisp.map(([t, n]) => {
            const on = tagsSel.includes(t);
            return (
              <button key={t} title={`${n} campanha(s) com ${t}`}
                onClick={() => setTagsSel((p) => (on ? p.filter((x) => x !== t) : [...p, t]))} className="mt-anel" onPointerDown={onda}
                style={chipTag(on)}>
                {t} <span style={{ opacity: .6, fontWeight: 600 }}>{n}</span>
              </button>
            );
          })}
          {tagsSel.length > 0 && (
            <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{linhas.length} campanha(s)</span>
          )}
        </div>
      )}

      {/* Níveis Conjuntos / Anúncios — mesma grade de métricas, scroll infinito. */}
      {nivel === "conjuntos" && (
        <TabelaNivel rows={linhasConjuntos} cols={cols} td={td} denso={denso}
          vazio={escopo.campanha ? "Sem conjuntos desta campanha no período." : "Sem conjuntos no período."}
          rotuloAbrir="Ver anúncios deste conjunto"
          onAbrir={(s) => { setEscopo({ campanha: s.campaign }); setNivel("anuncios"); }} />
      )}
      {nivel === "anuncios" && (
        <TabelaNivel rows={linhasAnuncios} cols={cols} td={td} denso={denso}
          vazio={escopo.campanha ? "Sem anúncios desta campanha no período." : "Sem anúncios no período."}
          rotuloAbrir="Ver o anúncio e a peça"
          onAbrir={(r) => setVerAnuncio({ id: r.id, name: r.name })} />
      )}
      {verAnuncio && (
        <VisorCriativo alvo={ligacao.alvoDe(verAnuncio.name, verAnuncio.id)} podeEditar={false} onFechar={() => setVerAnuncio(null)} />
      )}

      {/* Tabela de CAMPANHAS (no celular: cartões) */}
      {nivel === "campanhas" && celular && (
        linhas.length === 0
          ? <div className="tf-panel" style={{ padding: 20, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Nenhuma campanha no período.</div>
          : <div style={{ display: "grid", gap: 14 }}>
              {grupos.map((g) => (
                <div key={g.nome || "all"} style={{ display: "grid", gap: 8 }}>
                  {grupo !== "none" && (
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em" }}>{g.nome} · {g.rows.length}</div>
                  )}
                  <DataList itens={g.rows} colunas={colunasCartao} chaveDe={(c) => c.id} densa={denso} vazio="Nenhuma campanha aqui." />
                </div>
              ))}
            </div>
      )}

      {nivel === "campanhas" && !celular && (
      <div className="tf-panel" style={{ overflow: "hidden" }}>
        <div className="tf-sticky" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 + cols.length * 90 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th onClick={() => clickCol("__name")} title="Ordenar por nome" style={{ ...th, textAlign: "left", position: "sticky", left: 0, background: "var(--surface)", zIndex: 4, minWidth: 220, boxShadow: "1px 0 0 var(--border)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Caixa titulo="Selecionar todas desta página"
                      marcado={linhasPag.length > 0 && linhasPag.every((c) => marcadas.has(c.id))}
                      parcial={linhasPag.some((c) => marcadas.has(c.id))}
                      pararPropagacao
                      onChange={(marc) => setMarcadas((p) => { const n = new Set(p); linhasPag.forEach((c) => marc ? n.add(c.id) : n.delete(c.id)); return n; })} />
                    Campanha<Seta on={ordCol === "__name"} dir={ordDir} />
                  </span>
                </th>
                <th onClick={() => clickCol("__status")} title="Ordenar por veiculação" style={{ ...th, textAlign: "center" }}>Veiculação<Seta on={ordCol === "__status"} dir={ordDir} /></th>
                {cols.map((c) => (
                  <th key={c.key} title="Clique pra ordenar" onClick={() => clickCol(c.key)}
                    style={{ ...th, cursor: "pointer", color: ordCol === c.key ? "var(--text)" : "var(--text-dim)" }}>
                    {c.label}<Seta on={ordCol === c.key} dir={ordDir} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <GroupBlock key={g.nome || "all"} g={g} cols={cols} td={td} allByCol={allByCol} aberta={aberta} setAberta={setAberta} anuncios={d.anuncios} mostrarGrupo={grupo !== "none"} podeGerenciar={podeGerenciar} problemas={problemas} fav={fav} marcadas={marcadas} toggleMarcada={toggleMarcada} statusMap={statusMap} pendentes={pendentes} onAlternar={alternar} conjuntos={d.conjuntos} denso={denso} onAnalise={(c) => setAnalise({ id: c.id, name: c.name, accountId: c.accountId })} onEntrar={(c) => { setEscopo({ campanha: c.name }); setNivel("conjuntos"); }} />
              ))}
              {linhas.length === 0 && <tr><td colSpan={cols.length + 2} style={{ padding: 20, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Nenhuma campanha no período.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Fim da lista: sentinela do scroll infinito + contador. Fica FORA do
          desktop/celular porque os dois modos carregam por lote. */}
      {nivel === "campanhas" && grupo === "none" && linhas.length > 0 ? (
        <div ref={fimRef} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 12.5, color: "var(--text-dim)", fontWeight: 700, padding: "4px 0 2px" }}>
          {temMais ? (
            <>
              <span className="spin" style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--tf-line, var(--border))", borderTopColor: "var(--primary)" }} />
              Carregando mais… {linhasPag.length} de {linhas.length}
            </>
          ) : (
            <>{linhas.length} campanha(s)</>
          )}
        </div>
      ) : null}

      {analise && <AnaliseCampanha id={analise.id} name={analise.name} accountId={analise.accountId} onClose={() => setAnalise(null)} />}
    </div>
  );
}

type Nivel = "campanhas" | "conjuntos" | "anuncios";

// ── Tabela dos níveis CONJUNTOS e ANÚNCIOS ──────────────────────────────────
// Reaproveita as MESMAS colunas de métrica da tabela de campanhas (AdSetRow e
// AdRow também estendem AdMetrics, então col.get(row) funciona igual). Mantém
// busca, ordenação e scroll infinito. É a navegação hierárquica do Gerenciador.
function TabelaNivel<T extends AdMetrics & { id: string; name: string; account: string; campaign: string }>({
  rows, cols, td, denso, vazio, onAbrir, rotuloAbrir,
}: {
  rows: T[]; cols: MetricDef[]; td: React.CSSProperties; denso: boolean;
  vazio: string; onAbrir?: (r: T) => void; rotuloAbrir?: string;
}) {
  const LOTE = 40;
  const [visiveis, setVisiveis] = useState(LOTE);
  const fimRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setVisiveis(LOTE); }, [rows]);
  const temMais = visiveis < rows.length;
  useEffect(() => {
    if (!temMais) return;
    const el = fimRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) setVisiveis((v) => Math.min(v + LOTE, rows.length));
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [temMais, rows.length]);

  const th: React.CSSProperties = { padding: "10px 8px", fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", textAlign: "right", whiteSpace: "nowrap" };
  const allByCol = (col: MetricDef) => rows.map((r) => col.get(r));

  // Mesma história da tabela de campanhas: a coluna Nome fixa de 240px não deixa
  // nada pras métricas no celular, então a linha vira cartão.
  const celular = useIsMobile();
  const colunasCartao: Coluna<T>[] = [
    { chave: "__nome", titulo: "Nome", papel: "titulo", render: (r) => <span style={{ overflowWrap: "anywhere" }}>{r.name}</span> },
    { chave: "__pai", titulo: "Campanha", render: (r) => <>{r.campaign || r.account || "—"}</> },
    ...cols.slice(0, 4).map((col, i): Coluna<T> => ({
      chave: col.key, titulo: col.label, papel: i === 0 ? "destaque" : "meta",
      render: (r: T) => <>{col.fmt(col.get(r))}</>,
    })),
    ...(onAbrir ? [{
      chave: "__abrir", titulo: "Ações", papel: "acoes" as const,
      render: (r: T) => <Botao variante="secundario" icone="chevron-right" onClick={() => onAbrir(r)}>{rotuloAbrir ?? "Abrir"}</Botao>,
    }] : []),
  ];

  return (
    <>
      {celular ? (
        <DataList itens={rows.slice(0, visiveis)} colunas={colunasCartao} chaveDe={(r) => r.id} densa={denso} vazio={vazio} />
      ) : (
      <div className="tf-panel" style={{ overflow: "hidden" }}>
        <div className="tf-sticky" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 + cols.length * 90 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ ...th, textAlign: "left", position: "sticky", left: 0, background: "var(--surface)", zIndex: 4, minWidth: 240, boxShadow: "1px 0 0 var(--border)" }}>Nome</th>
                {cols.map((c) => <th key={c.key} style={th}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, visiveis).map((r) => (
                <tr key={r.id} className="mt-linha" style={{ borderBottom: "1px solid var(--tf-line-soft, var(--border))" }}>
                  <td style={{ padding: denso ? "7px 12px" : "11px 12px", position: "sticky", left: 0, background: "var(--surface)", zIndex: 2, minWidth: 240, boxShadow: "1px 0 0 var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.name}>{r.name}</div>
                        {!denso && <div style={{ fontSize: 10.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.campaign || r.account}</div>}
                      </div>
                      {onAbrir && (
                        <BotaoIcone icone="chevron-right" titulo={rotuloAbrir ?? "Abrir"} variante="secundario" tamanho="sm" onClick={() => onAbrir(r)} style={{ flex: "none" }} />
                      )}
                    </div>
                  </td>
                  {cols.map((col) => <CelulaMetrica key={col.key} v={col.get(r)} col={col} all={allByCol(col)} td={td} />)}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={cols.length + 1} style={{ padding: 20, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>{vazio}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      )}
      {rows.length > 0 && (
        <div ref={fimRef} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 12.5, color: "var(--text-dim)", fontWeight: 700, padding: "4px 0 2px" }}>
          {temMais ? <>Carregando mais… {visiveis} de {rows.length}</> : <>{rows.length} linha(s)</>}
        </div>
      )}
    </>
  );
}

// Botão de ação do cartão (celular). O piso de 44px vem da fundação.

// Chip do filtro de tags (ativo = roxo preenchido).
const chipTag = (on: boolean): React.CSSProperties => ({
  padding: "4px 10px", borderRadius: 999, cursor: "pointer", fontSize: 11.5, fontWeight: 700,
  border: "1px solid " + (on ? "var(--primary)" : "var(--tf-line, var(--border))"),
  background: on ? "var(--primary)" : "var(--surface)",
  color: on ? "#fff" : "var(--text)",
});


// ── Barra de ações em massa (§15) ───────────────────────────────────────────
// Pausar/ativar N campanhas de uma vez. Sequencial de propósito (a Meta penaliza
// rajada) e com confirmação — mexe em dinheiro real. Mostra progresso e o placar
// no fim. Só quem tem `trafego:gerenciar` vê os botões de escrita.
function BulkBar({ selecionadas, podeGerenciar, onLimpar }: { selecionadas: CampaignRow[]; podeGerenciar: boolean; onLimpar: () => void }) {
  const [rodando, setRodando] = useState<null | "pausar" | "ativar">(null);
  const [feito, setFeito] = useState(0);
  const [res, setRes] = useState<{ ok: number; erro: number } | null>(null);
  const [confirmar, setConfirmar] = useState<null | "pausar" | "ativar">(null);

  const aplicar = async (acao: "pausar" | "ativar") => {
    setRodando(acao); setFeito(0); setRes(null); setConfirmar(null);
    let ok = 0, erro = 0;
    for (const c of selecionadas) {
      try {
        const r = await fetch("/api/trafego/campanha/gerenciar", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: c.id, accountId: c.accountId, acao }),
        });
        r.ok ? ok++ : erro++;
      } catch { erro++; }
      setFeito((f) => f + 1);
    }
    setRes({ ok, erro }); setRodando(null);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 14px", borderRadius: 12, background: "color-mix(in srgb, var(--primary) 10%, var(--surface))", border: "1px solid color-mix(in srgb, var(--primary) 30%, var(--border))" }}>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)" }}>{selecionadas.length} selecionada(s)</span>
      {rodando ? (
        <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 700 }}>{rodando === "pausar" ? "Pausando" : "Ativando"} {feito}/{selecionadas.length}…</span>
      ) : res ? (
        <span style={{ fontSize: 12, fontWeight: 700, color: res.erro ? "var(--tf-warn)" : "var(--tf-pos)" }}>{res.ok} aplicada(s){res.erro ? ` · ${res.erro} falha(s)` : ""}</span>
      ) : podeGerenciar ? (
        confirmar ? (
          <>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--tf-warn)" }}>{confirmar === "pausar" ? "Pausar" : "Ativar"} {selecionadas.length} campanha(s) na Meta?</span>
            <Botao variante={confirmar === "pausar" ? "perigo" : "primario"} tamanho="sm" onClick={() => aplicar(confirmar)}>Confirmar</Botao>
            <Botao variante="secundario" tamanho="sm" onClick={() => setConfirmar(null)}>Cancelar</Botao>
          </>
        ) : (
          <>
            <Botao variante="secundario" tamanho="sm" icone="player-pause" onClick={() => setConfirmar("pausar")}>Pausar</Botao>
            <Botao variante="secundario" tamanho="sm" icone="player-play" onClick={() => setConfirmar("ativar")}>Ativar</Botao>
          </>
        )
      ) : (
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Sem permissão para pausar/ativar.</span>
      )}
      <Botao variante="sutil" tamanho="sm" onClick={onLimpar} style={{ marginLeft: "auto" }}>Limpar seleção</Botao>
    </div>
  );
}

// ── Seletor de ORGANIZAÇÕES (layouts nomeados) ──────────────────────────────
// Salva/troca/apaga TABELAS personalizadas (colunas + filtros + ordenação + grupo).
function OrgSelector({ orgs, ativa, onAplicar, onSalvar, onApagar }: { orgs: Organizacao[]; ativa: string | null; onAplicar: (o: Organizacao) => void; onSalvar: (nome: string) => void; onApagar: (id: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  // Receita t-dropdown (transitions.dev) — antes o painel abria em corte seco.
  const pop = useAbrirFechar(aberto, "--dropdown-close-dur");
  const salvar = () => { if (nome.trim()) { onSalvar(nome); setNome(""); } };
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setAberto((v) => !v)} title="Salvar a tabela atual ou trocar de tabela (colunas + filtros + ordem + grupo)"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-dim)" }}>
        <Icon name="layout-grid" size={14} color="var(--text-dim)" /> Tabelas{orgs.length ? ` · ${orgs.length}` : ""}
      </button>
      {pop.montado && (
        <>
          <div onClick={() => setAberto(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          {/* .gp-pop: no celular a fundação prende embaixo como folha — os 268px
              fixos ancorados no botão saíam da tela de 320px. */}
          <div className={`gp-pop t-dropdown ${pop.classe}`.trim()} data-origin="top-left" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 41, width: 268, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 12px 30px -12px rgba(0,0,0,.4)", padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>Salvar como tabela</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              <input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") salvar(); }} placeholder="Nome (ex.: Escala, Análise)" style={{ flex: 1, minWidth: 0, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5 }} />
              <Botao variante="primario" tamanho="sm" onClick={salvar} disabled={!nome.trim()}>Salvar</Botao>
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginBottom: 10 }}>Guarda as colunas, filtros, ordenação e agrupamento de agora. Repetir o nome sobrescreve.</div>
            {orgs.length === 0 ? <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Nenhuma tabela salva ainda.</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {orgs.map((o) => {
                  const on = ativa === o.id;
                  return (
                    <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 8, border: on ? "1px solid var(--primary)" : "1px solid var(--border)", background: on ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent" }}>
                      <button onClick={() => { onAplicar(o); setAberto(false); }} style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "var(--text)", fontSize: 12.5, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.nome}</button>
                      {on && <span style={{ fontSize: 10, fontWeight: 800, color: "var(--primary-texto, var(--primary))" }}>em uso</span>}
                      <BotaoIcone icone="x" titulo="Apagar tabela" tamanho="sm" onClick={() => onApagar(o.id)} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Construtor de filtro avançado ───────────────────────────────────────────
// Escolhe métrica + operador + valor e adiciona. Tem ATALHOS pros filtros que
// o media buyer mais usa: quem gasta sem vender, ROAS abaixo de 1, CPA alto.
const novoId = () => Math.random().toString(36).slice(2, 9);
function FiltroBuilder({ metricas, onAdd, onClose }: { metricas: MetricDef[]; onAdd: (f: FiltroAv) => void; onClose: () => void }) {
  const onda = useOnda();
  const [metrica, setMetrica] = useState("roas");
  const [op, setOp] = useState<FiltroAv["op"]>("<");
  const [valor, setValor] = useState("");
  const add = () => { const v = Number(valor.replace(",", ".")); if (!Number.isFinite(v)) return; onAdd({ id: novoId(), metrica, op, valor: v }); setValor(""); };
  const atalhos: Array<{ label: string; f: Omit<FiltroAv, "id"> }> = [
    { label: "ROAS < 1", f: { metrica: "roas", op: "<", valor: 1 } },
    { label: "Sem vendas", f: { metrica: "purchases", op: "=", valor: 0 } },
    { label: "Gasto > 500", f: { metrica: "spend", op: ">", valor: 500 } },
    { label: "CPA > 100", f: { metrica: "cpa", op: ">", valor: 100 } },
    { label: "Frequência > 3", f: { metrica: "frequency", op: ">", valor: 3 } },
  ];
  const inp: React.CSSProperties = { padding: "7px 9px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5 };
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 14, background: "var(--surface)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-dim)" }}>Filtrar quando</span>
        <GlassSelect value={metrica} onChange={setMetrica} style={inp}
          options={metricas.map((m) => ({ value: m.key, label: m.label }))} />
        <div style={{ display: "inline-flex", gap: 2, background: "var(--seg-track)", padding: 3, borderRadius: 9 }}>
          {OPS.map((o) => <button key={o} onClick={() => setOp(o)} style={{ padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 800, background: op === o ? "var(--seg-pill)" : "transparent", color: op === o ? "var(--text)" : "var(--text-dim)" }}>{o}</button>)}
        </div>
        <input value={valor} onChange={(e) => setValor(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} inputMode="decimal" placeholder="valor" style={{ ...inp, width: 90 }} />
        <Botao variante="primario" onClick={add} disabled={!valor.trim()}>Adicionar</Botao>
        <Botao variante="sutil" tamanho="sm" onClick={onClose} style={{ marginLeft: "auto" }}>Fechar</Botao>
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)" }}>Atalhos:</span>
        {atalhos.map((a) => (
          <button key={a.label} onClick={() => onAdd({ id: novoId(), ...a.f })} className="mt-anel" onPointerDown={onda} style={{ padding: "5px 11px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{a.label}</button>
        ))}
      </div>
    </div>
  );
}

// ── Gerenciar campanha (pausar/ativar + orçamento) ──────────────────────────
// Só renderiza pra quem tem a sub-permissão `trafego:gerenciar` (o gate real é
// da API). Estado atual buscado SOB DEMANDA ao expandir a campanha — buscar
// status da tabela inteira seria N+1 no Graph. Toda ação pede confirmação em
// dois cliques: mexe em campanha DE VERDADE, com dinheiro real.
interface EstadoCampanha { status: string | null; effectiveStatus: string | null; orcamentoDiarioBrl: number | null }

function GerenciarCampanha({ c }: { c: CampaignRow }) {
  const [est, setEst] = useState<EstadoCampanha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [agindo, setAgindo] = useState(false);
  const [confirmando, setConfirmando] = useState<"pausar" | "ativar" | null>(null);
  const [orcamento, setOrcamento] = useState("");
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/trafego/campanha/gerenciar?campaignId=${encodeURIComponent(c.id)}&accountId=${encodeURIComponent(c.accountId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j?.detalhe || j?.error || r.status))))
      .then((j: EstadoCampanha) => { if (vivo) { setEst(j); if (j.orcamentoDiarioBrl != null) setOrcamento(String(j.orcamentoDiarioBrl)); } })
      .catch((e) => { if (vivo) setErro(typeof e === "string" ? e : "Não consegui ler o estado na Meta."); });
    return () => { vivo = false; };
  }, [c.id, c.accountId]);

  const agir = async (acao: "pausar" | "ativar" | "orcamento") => {
    setAgindo(true); setErro(null); setOkMsg(null);
    try {
      const body: Record<string, unknown> = { campaignId: c.id, accountId: c.accountId, acao };
      if (acao === "orcamento") body.orcamentoBrl = Number(orcamento.replace(",", "."));
      const r = await fetch("/api/trafego/campanha/gerenciar", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detalhe || j?.error || "A Meta recusou.");
      // Reflete o que a Meta CONFIRMOU (j.depois), não o que pedimos.
      if (acao === "orcamento") {
        setEst((e) => (e ? { ...e, orcamentoDiarioBrl: Number(j.depois) / 100 } : e));
        setOkMsg("Orçamento atualizado na Meta.");
      } else {
        setEst((e) => (e ? { ...e, status: j.depois, effectiveStatus: j.depois } : e));
        setOkMsg(acao === "pausar" ? "Campanha pausada na Meta." : "Campanha reativada na Meta.");
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao falar com a Meta.");
    } finally {
      setAgindo(false); setConfirmando(null);
    }
  };

  const ativa = est?.effectiveStatus === "ACTIVE" || est?.status === "ACTIVE";

  if (erro && !est) return <span style={{ fontSize: 12, color: "var(--tf-neg)" }}>{erro}</span>;
  if (!est) return <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Consultando a Meta…</span>;

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
      {/* Status REAL (effective_status: o que está de fato rodando) */}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 800, padding: "3px 10px", borderRadius: 999, color: ativa ? "var(--tf-pos)" : "var(--tf-warn)", background: `color-mix(in srgb, ${ativa ? "var(--tf-pos)" : "var(--tf-warn)"} 12%, transparent)` }}>
        {ativa ? "ATIVA" : (est.effectiveStatus || est.status || "—")}
      </span>

      {/* Pausar/ativar em DOIS cliques */}
      {confirmando ? (
        <>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--tf-warn)" }}>
            {confirmando === "pausar" ? "Pausar esta campanha na Meta?" : "Reativar esta campanha na Meta?"}
          </span>
          <Botao variante={confirmando === "pausar" ? "perigo" : "primario"} tamanho="sm" onClick={() => agir(confirmando)} carregando={agindo}>
            Confirmar
          </Botao>
          <Botao variante="secundario" tamanho="sm" onClick={() => setConfirmando(null)} disabled={agindo}>Cancelar</Botao>
        </>
      ) : (
        <Botao variante="secundario" tamanho="sm" icone={ativa ? "player-pause" : "player-play"} onClick={() => setConfirmando(ativa ? "pausar" : "ativar")} disabled={agindo}>
          {ativa ? "Pausar" : "Ativar"}
        </Botao>
      )}

      {/* Orçamento diário (só se a campanha tem orçamento no nível campanha —
          CBO. Sem daily_budget = orçamento nos conjuntos; não mostramos input) */}
      {est.orcamentoDiarioBrl != null && (() => {
        const atual = est.orcamentoDiarioBrl ?? 0;
        const digitado = Number((orcamento || "").replace(",", "."));
        const base = Number.isFinite(digitado) && digitado > 0 ? digitado : atual;   // ±% parte do valor no campo
        const ajustar = (pct: number) => { const nv = Math.round(base * (1 + pct / 100) * 100) / 100; setOrcamento(String(nv)); setOkMsg(null); };
        const delta = Number.isFinite(digitado) && atual > 0 ? Math.round((digitado / atual - 1) * 100) : 0;
        const pctBtn: React.CSSProperties = { padding: "5px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 11.5, fontWeight: 800, color: "var(--text-dim)", minWidth: 38 };
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Orçamento/dia R$</span>
            <span style={{ display: "inline-flex", gap: 3 }}>
              {[-20, -10, -5].map((p) => <button key={p} onClick={() => ajustar(p)} disabled={agindo} title={`Diminuir ${Math.abs(p)}% do valor atual`} style={{ ...pctBtn, color: "var(--tf-neg)" }}>{p}%</button>)}
            </span>
            <input value={orcamento} onChange={(e) => { setOrcamento(e.target.value); setOkMsg(null); }} inputMode="decimal"
              style={{ width: 84, padding: "5px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5, fontWeight: 700, textAlign: "center" }} />
            <span style={{ display: "inline-flex", gap: 3 }}>
              {[5, 10, 20].map((p) => <button key={p} onClick={() => ajustar(p)} disabled={agindo} title={`Aumentar ${p}% do valor atual`} style={{ ...pctBtn, color: "var(--tf-pos)" }}>+{p}%</button>)}
            </span>
            {delta !== 0 && <span style={{ fontSize: 11, fontWeight: 800, color: delta > 0 ? "var(--tf-pos)" : "var(--tf-neg)" }}>{delta > 0 ? "+" : ""}{delta}% vs atual</span>}
            <Botao variante={digitado > 0 && digitado !== atual ? "primario" : "secundario"} tamanho="sm" onClick={() => agir("orcamento")} carregando={agindo} disabled={!orcamento.trim() || digitado === atual || !(digitado > 0)}>
              Salvar
            </Botao>
          </span>
        );
      })()}

      {okMsg && <span style={{ fontSize: 12, fontWeight: 700, color: "var(--tf-pos)" }}>{okMsg}</span>}
      {erro && est && <span style={{ fontSize: 12, color: "var(--tf-neg)" }}>{erro}</span>}
    </div>
  );
}

// Modo diagnóstico (§5): lê a tendência do sparkline (1ª vs 2ª metade) + os KPIs
// e sugere a próxima ação. Client-side, sem dados extras.
function Diagnostico({ c }: { c: CampaignRow }) {
  const sp = c.spark ?? [];
  const meio = Math.floor(sp.length / 2);
  const roasMet = (arr: SparkPonto[]) => { const s = arr.reduce((a, p) => ({ sp: a.sp + p.spend, rv: a.rv + p.revenue }), { sp: 0, rv: 0 }); return s.sp > 0 ? s.rv / s.sp : null; };
  const r1 = sp.length >= 4 ? roasMet(sp.slice(0, meio)) : null;
  const r2 = sp.length >= 4 ? roasMet(sp.slice(meio)) : null;
  const tend = r1 != null && r2 != null ? (r2 > r1 * 1.05 ? { t: "melhorou", cor: "var(--tf-pos)" } : r2 < r1 * 0.95 ? { t: "piorou", cor: "var(--tf-neg)" } : { t: "estável", cor: "var(--text-dim)" }) : null;
  let acao = "Manter e observar.", cor = "var(--text-dim)";
  if (c.roas == null || c.roas < 1) { acao = "ROAS abaixo de 1 — rever oferta/criativo ou pausar."; cor = "var(--tf-neg)"; }
  else if (c.ctr < 1) { acao = "CTR baixo — testar um novo criativo (gancho)."; cor = "var(--tf-warn)"; }
  else if ((c.frequency ?? 0) > 3) { acao = "Frequência alta — atenção à fadiga, renovar criativo."; cor = "var(--tf-warn)"; }
  else if (c.roas >= 2) { acao = "ROAS forte — escalar orçamento aos poucos."; cor = "var(--tf-pos)"; }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
        <Icon name="activity" size={14} color={tend?.cor ?? "var(--text-dim)"} />
        <span style={{ color: "var(--text-dim)" }}>Tendência:</span>
        <b style={{ color: tend?.cor ?? "var(--text-dim)" }}>{tend ? tend.t : "poucos dias"}</b>
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
        <Icon name="bolt" size={14} color={cor} />
        <span style={{ color: "var(--text-dim)" }}>Próxima ação:</span>
        <b style={{ color: cor }}>{acao}</b>
      </div>
    </div>
  );
}

function GroupBlock({ g, cols, td, allByCol, aberta, setAberta, anuncios, mostrarGrupo, podeGerenciar, problemas, fav, marcadas, toggleMarcada, statusMap, pendentes, onAlternar, conjuntos, denso, onAnalise, onEntrar }: {
  g: { nome: string; rows: CampaignRow[] }; cols: MetricDef[]; td: React.CSSProperties;
  allByCol: (c: MetricDef) => (number | null)[]; aberta: string | null; setAberta: (s: string | null) => void;
  anuncios: AdsOverview["anuncios"]; mostrarGrupo: boolean; podeGerenciar?: boolean; problemas?: Map<string, "alta" | "media">; fav: { has: (id: string) => boolean; toggle: (id: string) => void }; marcadas: Set<string>; toggleMarcada: (id: string) => void; statusMap: Map<string, boolean>; pendentes: Set<string>; onAlternar: (id: string, accountId: string, tipo: "campaign" | "adset" | "ad") => void; conjuntos: AdSetRow[]; denso: boolean; onAnalise: (c: CampaignRow) => void; onEntrar: (c: CampaignRow) => void;
}) {
  const totM = somaM(g.rows);
  return (
    <>
      {mostrarGrupo && (
        <tr style={{ background: "var(--surface-2, rgba(255,255,255,.02))", borderBottom: "1px solid var(--border)" }}>
          <td style={{ padding: "9px 12px", fontSize: 12, fontWeight: 800, color: "var(--text)", position: "sticky", left: 0, background: "var(--seg-track)", zIndex: 2, boxShadow: "1px 0 0 var(--border)" }}>{g.nome} · {g.rows.length}</td>
          <td />
          {podeGerenciar && <td />}
          {cols.map((c) => { const v = c.get(totM); return <td key={c.key} style={{ ...td, fontWeight: 800, color: "var(--text-dim)" }}>{c.fmt(v)}</td>; })}
        </tr>
      )}
      {g.rows.map((c) => {
        const ab = aberta === c.id;
        const ads = ab ? anuncios.filter((a) => a.campaign === c.name).slice(0, 8) : [];
        const sets = ab ? conjuntos.filter((s) => s.campaign === c.name).slice(0, 12) : [];
        return (
          <Fragment key={c.id}>
            {/* `.mt-linha` responde ao ponteiro E ao toque por FUNDO (nunca por
                transform: numa `<tr>` o transform vira bloco de contenção e a
                coluna fixa de nome sai do lugar). `data-mt-sel` põe o fio de
                destaque na campanha aberta, dizendo QUAL linha a gaveta abaixo
                está detalhando. */}
            <tr onClick={() => setAberta(ab ? null : c.id)} className="mt-linha" data-mt-sel={ab ? "1" : undefined} data-problema={problemas?.has(c.id) ? "1" : undefined} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
              {/* O fio do `.mt-linha[data-mt-sel]` mora AQUI e não na `<tr>`:
                  `border-collapse: collapse` faz o navegador ignorar box-shadow
                  na linha, e a coluna fixa tem fundo próprio (que cobriria o
                  realce). É o mesmo fio roxo que marca a gaveta logo abaixo. */}
              <td style={{ padding: denso ? "5px 12px" : "11px 12px", position: "sticky", left: 0, background: ab ? "color-mix(in srgb, var(--primary) 6%, var(--surface))" : "var(--surface)", zIndex: 2, boxShadow: ab ? "inset 3px 0 0 var(--primary), 1px 0 0 var(--border)" : "1px 0 0 var(--border)", minWidth: 220 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Caixa marcado={marcadas.has(c.id)} onChange={() => toggleMarcada(c.id)} titulo="Selecionar" pararPropagacao />
                  <EstrelaFavorito on={fav.has(`campanha:${c.id}`)} onToggle={() => fav.toggle(`campanha:${c.id}`)} size={15} />
                  {/* Abrir/fechar a gaveta é sanfona — exceção simétrica: os dois
                      sentidos com a mesma duração, senão o "fechar" some antes
                      de a pessoa entender que fechou. */}
                  <TrocaIcone ligado={ab} a="chevron-right" b="chevron-down" size={14} corA="var(--text-dim)" corB="var(--primary-texto)" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }}>{c.name}</div>
                    {!denso && <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{c.account}{c.status ? ` · ${c.status.toLowerCase()}` : ""}</div>}
                  </div>
                  {/* Abre o "dia a dia" da campanha (drawer que independe do período global). */}
                  {/* Entra na campanha: vai pros CONJUNTOS dela (como no Meta). */}
                  <BotaoIcone icone="chevron-right" titulo="Ver conjuntos desta campanha" variante="secundario" tamanho="sm" onClick={(e) => { e.stopPropagation(); onEntrar(c); }} style={{ marginLeft: "auto", flex: "none" }} />
                  <BotaoIcone icone="chart-line" titulo="Ver análise dia a dia" variante="secundario" tamanho="sm" onClick={(e) => { e.stopPropagation(); onAnalise(c); }} style={{ flex: "none" }} />
                </div>
              </td>
              {/* Veiculação (estilo Gerenciador): ponto colorido + rótulo, e a
                  chave liga/desliga pra quem pode gerenciar. */}
              <td style={{ textAlign: "center", padding: "0 8px" }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {podeGerenciar && (
                    <Switch estado={statusMap.get(c.id)} pendente={pendentes.has(c.id)} onToggle={() => onAlternar(c.id, c.accountId, "campaign")}
                      titulo={statusMap.get(c.id) === undefined ? "Status desconhecido" : statusMap.get(c.id) ? "Ativa — clique pra pausar" : "Pausada — clique pra ativar"} />
                  )}
                  <Veiculacao ativa={statusMap.get(c.id)} />
                </div>
              </td>
              {cols.map((col) => <CelulaMetrica key={col.key} v={col.get(c)} col={col} all={allByCol(col)} td={td} />)}
            </tr>
            {ab && (() => {
              // Bloco expandido com visual UNIFICADO: mesma cor de fundo em toda a
              // gaveta (linha + coluna fixa, antes ficavam em 2 tons) e uma FAIXA
              // roxa à esquerda marcando que tudo ali pertence à campanha aberta.
              const expBg = "color-mix(in srgb, var(--primary) 6%, var(--surface))";
              const totalCols = cols.length + 2;
              const stickyFilho = (indent: number): React.CSSProperties => ({
                padding: `8px 12px 8px ${indent}px`, position: "sticky", left: 0, background: expBg, zIndex: 2,
                boxShadow: "inset 3px 0 0 var(--primary), 1px 0 0 var(--border)", minWidth: 220,
              });
              const cabecalho = (txt: string) => (
                <tr style={{ background: expBg }}>
                  <td colSpan={totalCols} style={{ padding: "9px 20px 4px", fontSize: 10, fontWeight: 800, color: "var(--primary-texto, var(--primary))", textTransform: "uppercase", letterSpacing: ".06em", boxShadow: "inset 3px 0 0 var(--primary)" }}>{txt}</td>
                </tr>
              );
              const filho = (item: { id: string; name: string }, tipo: "adset" | "ad", indent: number) => (
                <tr key={item.id} style={{ background: expBg }}>
                  <td style={stickyFilho(indent)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--text-dim)", flex: "none", opacity: 0.6 }} />
                      <span style={{ fontSize: 12, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 240 }}>{item.name}</span>
                    </div>
                  </td>
                  <td style={{ background: expBg }} />
                  {podeGerenciar && (
                    <td style={{ textAlign: "center", padding: "0 8px", background: expBg }} onClick={(e) => e.stopPropagation()}>
                      <Switch estado={statusMap.get(item.id)} pendente={pendentes.has(item.id)} onToggle={() => onAlternar(item.id, c.accountId, tipo)}
                        titulo={statusMap.get(item.id) === undefined ? "Status desconhecido" : statusMap.get(item.id) ? "Ativo — clique pra pausar" : "Pausado — clique pra ativar"} />
                    </td>
                  )}
                  {cols.map((col) => { const v = col.get(item as unknown as CampaignRow); return <td key={col.key} style={{ ...td, fontSize: 12, color: "var(--text-dim)", background: expBg }}>{col.fmt(v)}</td>; })}
                </tr>
              );
              return (
                <>
                  {/* Painel de diagnóstico + gestão, contido numa moldura */}
                  <tr style={{ background: expBg, borderBottom: "1px solid var(--border)" }}>
                    <td colSpan={totalCols} style={{ padding: "12px 20px", boxShadow: "inset 3px 0 0 var(--primary)" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                        <Diagnostico c={c} />
                        {podeGerenciar && <GerenciarCampanha c={c} />}
                      </div>
                    </td>
                  </tr>
                  {sets.length > 0 && cabecalho(`Conjuntos · ${sets.length}`)}
                  {sets.map((s) => filho(s, "adset", 34))}
                  {ads.length > 0 && cabecalho(`Anúncios · ${ads.length}`)}
                  {ads.map((a) => filho(a, "ad", 44))}
                  {ads.length === 0 && (
                    <tr style={{ background: expBg, borderBottom: "1px solid var(--border)" }}><td colSpan={totalCols} style={{ padding: "8px 20px", fontSize: 11.5, color: "var(--text-dim)", boxShadow: "inset 3px 0 0 var(--primary)" }}>Sem anúncios carregados pra esta campanha.</td></tr>
                  )}
                  {/* Fecho da gaveta: borda embaixo do último filho */}
                  <tr style={{ borderBottom: "2px solid color-mix(in srgb, var(--primary) 30%, var(--border))" }}><td colSpan={totalCols} style={{ padding: 0, height: 0 }} /></tr>
                </>
              );
            })()}
          </Fragment>
        );
      })}
    </>
  );
}

// ── Análise dia a dia de UMA campanha (drawer lateral) ──────────────────────────
// Resolve dois pedidos: (1) a campanha some ao trocar a data global — aqui o drawer
// guarda id/conta e busca a PRÓPRIA série por id, então continua aberto e válido
// independente do período da tela; (2) ver como a campanha se comportou dia após
// dia. Banco primeiro (/api/trafego/campanha/diario), Graph como fallback.
function AnaliseCampanha({ id, name, accountId, onClose }: { id: string; name: string; accountId: string; onClose: () => void }) {
  const [dias, setDias] = useState(30);
  const [pontos, setPontos] = useState<DiaCampanha[] | null>(null);
  const [fonte, setFonte] = useState<"banco" | "meta">("banco");
  const [loading, setLoading] = useState(true);
  const onda = useOnda();

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    // Fuso SP (−3h): "hoje" e o início do intervalo. Independe do período global.
    const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    const from = new Date(Date.parse(hoje + "T12:00:00Z") - (dias - 1) * 864e5).toISOString().slice(0, 10);
    let vivo = true; setLoading(true);
    fetch(`/api/trafego/campanha/diario?id=${encodeURIComponent(id)}&accountId=${encodeURIComponent(accountId)}&from=${from}&to=${hoje}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { dias: [], fonte: "banco" }))
      .then((j) => { if (!vivo) return; setPontos(j.dias ?? []); setFonte(j.fonte ?? "banco"); setLoading(false); })
      .catch(() => { if (vivo) { setPontos([]); setLoading(false); } });
    return () => { vivo = false; };
  }, [id, accountId, dias]);

  const p = pontos ?? [];
  const tot = useMemo(() => {
    const s = p.reduce((a, d) => ({ spend: a.spend + d.spend, revenue: a.revenue + d.revenue, purchases: a.purchases + d.purchases, clicks: a.clicks + d.clicks, impressions: a.impressions + d.impressions }), { spend: 0, revenue: 0, purchases: 0, clicks: 0, impressions: 0 });
    return { ...s, roas: s.spend > 0 ? s.revenue / s.spend : null, cpa: s.purchases > 0 ? s.spend / s.purchases : null, ctr: s.impressions > 0 ? (s.clicks / s.impressions) * 100 : 0 };
  }, [p]);
  // Tendência do ROAS: 2ª metade dos dias com gasto vs 1ª metade.
  const tend = useMemo(() => {
    const cg = p.filter((d) => d.spend > 0); if (cg.length < 4) return null;
    const meio = Math.floor(cg.length / 2);
    const roasDe = (arr: DiaCampanha[]) => { const sp = arr.reduce((a, d) => a + d.spend, 0), rv = arr.reduce((a, d) => a + d.revenue, 0); return sp > 0 ? rv / sp : 0; };
    const a = roasDe(cg.slice(0, meio)); if (a <= 0) return null;
    return ((roasDe(cg.slice(meio)) - a) / a) * 100;
  }, [p]);

  const labels = p.map((d) => d.day.slice(5));
  const series = [
    { key: "spend", label: "Investimento", cor: "var(--tf-chart-1)", vals: p.map((d) => d.spend), fmt: fmtBRL2 },
    { key: "revenue", label: "Faturamento", cor: "var(--tf-chart-2)", vals: p.map((d) => d.revenue), fmt: fmtBRL2 },
    { key: "roas", label: "ROAS", cor: "var(--tf-chart-3)", axis: "right" as const, vals: p.map((d) => (d.spend > 0 ? d.revenue / d.spend : null)), fmt: (v: number) => `${v.toFixed(2)}×` },
  ];
  const roasCor = (r: number | null) => (r == null ? "var(--text-dim)" : r >= 2 ? "var(--tf-pos)" : r >= 1 ? "var(--tf-warn)" : "var(--tf-neg)");

  const tile = (rot: string, val: React.ReactNode, cor = "var(--text)") => (
    <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "9px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: "var(--text-dim)", fontWeight: 700 }}>{rot}</div>
      <div className="stat" style={{ fontSize: 16.5, fontWeight: 800, color: cor, marginTop: 2, whiteSpace: "nowrap" }}>{val}</div>
    </div>
  );

  // Dia a dia na tabela do sistema. No celular (a gaveta ocupa a tela toda) as
  // sete colunas não cabiam lado a lado; ali cada dia vira cartão com o ROAS em
  // destaque, que é o número que diz se o dia pagou. Os derivados (ROAS/CPA/CTR)
  // saem de UM lugar pra render e ordenação não divergirem.
  type LinhaDia = DiaCampanha & { roas: number | null; cpa: number | null; ctr: number };
  const linhasDia: LinhaDia[] = p.map((d) => ({
    ...d,
    roas: d.spend > 0 ? d.revenue / d.spend : null,
    cpa: d.purchases > 0 ? d.spend / d.purchases : null,
    ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
  }));
  const nw: React.CSSProperties = { whiteSpace: "nowrap" };
  const colunasDia: Coluna<LinhaDia>[] = [
    { chave: "dia", titulo: "Dia", papel: "titulo", ordenar: (d) => d.day, render: (d) => <span style={nw}>{d.day.slice(5).replace("-", "/")}</span> },
    { chave: "gasto", titulo: "Gasto", alinhar: "right", ordenar: (d) => d.spend, render: (d) => <span style={nw}>{fmtBRL2(d.spend)}</span> },
    { chave: "fat", titulo: "Fat.", alinhar: "right", ordenar: (d) => d.revenue, render: (d) => <span style={{ ...nw, color: "var(--tf-pos)" }}>{fmtBRL2(d.revenue)}</span> },
    { chave: "roas", titulo: "ROAS", papel: "destaque", alinhar: "right", ordenar: (d) => d.roas, render: (d) => <span style={{ ...nw, fontWeight: 700, color: roasCor(d.roas) }}>{d.roas == null ? "—" : `${d.roas.toFixed(2)}×`}</span> },
    { chave: "compras", titulo: "Compras", alinhar: "right", ordenar: (d) => d.purchases, render: (d) => <>{fmtNum(d.purchases)}</> },
    { chave: "cpa", titulo: "CPA", alinhar: "right", ordenar: (d) => d.cpa, render: (d) => <span style={nw}>{d.cpa == null ? "—" : fmtBRL2(d.cpa)}</span> },
    { chave: "ctr", titulo: "CTR", alinhar: "right", ordenar: (d) => d.ctr, render: (d) => <>{d.ctr.toFixed(2)}%</> },
  ];

  return (
    <Portal>
      <div onClick={onClose} data-nozoom className="tf-scope" style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(8,10,18,.72)", backdropFilter: "blur(4px)", display: "flex", justifyContent: "flex-end", animation: "tfFade var(--duration-quick) var(--ease-smooth-out) both" }}>
        <div onClick={(e) => e.stopPropagation()} className="tf-panel" style={{ width: "min(760px, 100%)", height: "100%", overflowY: "auto", borderRadius: 0, padding: 0, animation: "tfSlideIn var(--panel-open-dur) var(--panel-ease) both" }}>
          <div style={{ position: "sticky", top: 0, zIndex: 3, display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--tf-panel-line)", background: "var(--surface)" }}>
            <Icon name="chart-line" size={17} color="var(--primary-texto)" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Análise dia a dia · {fonte === "banco" ? "do banco" : "da Meta"}</div>
            </div>
            <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={onClose} style={{ flex: "none" }} />
          </div>

          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 15 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[7, 14, 30, 90].map((n) => (
                <button key={n} onClick={() => setDias(n)} className="mt-anel" onPointerDown={onda} style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: `1px solid ${dias === n ? "transparent" : "var(--tf-line, var(--border))"}`, background: dias === n ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: dias === n ? "var(--on-primary, #fff)" : "var(--text)" }}>{n} dias</button>
              ))}
            </div>

            {loading ? (
              <div style={{ padding: 30, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Carregando…</div>
            ) : p.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Sem dados dessa campanha no período. Se ela é recente, clique em &quot;Atualizar agora&quot; na tela pra sincronizar.</div>
            ) : (
              <>
                {/* `Fila` carimba `--mt-i` em cada cartão: os cinco números
                    CHEGAM em cascata em vez de piscarem juntos. */}
                <Fila style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 92px), 1fr))", gap: 8 }}>
                  {tile("Investido", <NumeroVivo valor={tot.spend} formatar={fmtBRL2} />)}
                  {tile("Faturamento", <NumeroVivo valor={tot.revenue} formatar={fmtBRL2} />, "var(--tf-pos)")}
                  {tile("ROAS", tot.roas == null ? "—" : <NumeroVivo valor={tot.roas} formatar={(v) => `${v.toFixed(2)}×`} />, roasCor(tot.roas))}
                  {tile("Compras", <NumeroVivo valor={tot.purchases} formatar={fmtNum} />)}
                  {tile("CPA", tot.cpa == null ? "—" : <NumeroVivo valor={tot.cpa} formatar={fmtBRL2} />)}
                </Fila>

                {tend != null && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text-dim)" }}>
                    <Icon name={tend >= 0 ? "trending-up" : "trending-down"} size={15} color={tend >= 0 ? "var(--tf-pos)" : "var(--tf-neg)"} />
                    ROAS da 2ª metade do período <b style={{ color: tend >= 0 ? "var(--tf-pos)" : "var(--tf-neg)" }}>{tend >= 0 ? "+" : ""}{tend.toFixed(0)}%</b> vs a 1ª metade.
                  </div>
                )}

                <TfChart labels={labels} series={series} height={200} titulo={`diario-${name}`} />

                {/* Sem a caixa de 320px com rolagem própria: a gaveta já rola,
                    e rolagem dentro de rolagem prende o polegar no celular.
                    Mais recente primeiro (era o `reverse()`), agora como ordem
                    inicial — e qualquer coluna reordena com um clique. */}
                <DataList itens={linhasDia} colunas={colunasDia} chaveDe={(d) => d.day} densa minWidth={520}
                  rotulo={`Dia a dia de ${name}`} ordemInicial={{ coluna: "dia", sentido: "desc" }}
                  vazio="Sem dias no período." />
              </>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
