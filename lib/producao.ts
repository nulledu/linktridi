// ── Módulo Produção — lê o ERP legado ao vivo (mesma fonte do lib/erp.ts).
// Fluxo do dia, funil do pipeline, produtos a produzir, metas e análise por
// setor (Design, Produção, Entrada Logística, Logística, Estoque) com pontos
// positivos/negativos.

import { resolvePeriod, type Range } from "@/lib/period";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZHB0ZHZrbGRyZ2hldm10bXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY5OTM4NzgsImV4cCI6MjAzMjU2OTg3OH0.SYzaaJO1jnT7064c6Q5KIcshvD9j_o1TuTFmmF2H46k";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || LEGACY_ANON;
const headers = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

/** Leitura paginada do ERP legado. Exportada pro `lib/analytics/operacao.ts`:
 *  duplicar as credenciais e o laço de `Range` num segundo arquivo era como as
 *  duas cópias do timeout nasciam diferentes. */
export async function fetchAllErp<T = Record<string, unknown>>(table: string, query: string, cap = 100000): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  const step = 1000;
  for (;;) {
    const res = await fetch(`${LEGACY_URL}/rest/v1/${table}?${query}`, {
      headers: { ...headers, Range: `${from}-${from + step - 1}`, "Range-Unit": "items" },
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`ERP ${table} ${res.status}`);
    const rows = (await res.json()) as T[];
    out.push(...rows);
    if (rows.length < step || out.length >= cap) break;
    from += step;
  }
  return out;
}

/** Só a contagem (corpo vazio, `count=exact` no cabeçalho). */
export async function countErp(table: string, query: string): Promise<number> {
  const res = await fetch(`${LEGACY_URL}/rest/v1/${table}?${query}`, {
    headers: { ...headers, Range: "0-0", "Range-Unit": "items", Prefer: "count=exact" },
    cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok && res.status !== 206) throw new Error(`ERP count ${table} ${res.status}`);
  const cr = res.headers.get("content-range") || "";
  const total = cr.split("/")[1];
  return total && total !== "*" ? Number(total) : 0;
}

// Drill-down: lista os pedidos de uma etapa (clicar numa métrica → ver os pedidos).
export interface PedidoLinha { ref: string; cliente: string; telefone: string | null; data: string | null; urgente: boolean; valor: number }
export async function listPedidosDaEtapa(etapaId: number): Promise<PedidoLinha[]> {
  type Row = { id_proprio: string | null; urgente: boolean | null; data_aprovado: string | null; created_at: string | null; preco_total: number | null };
  const rows = await fetchAllErp<Row>(
    "pedidos",
    `select=id_proprio,urgente,data_aprovado,created_at,preco_total&etapa_id=eq.${etapaId}&arquivado=eq.false&concluido=eq.false&order=data_aprovado.desc.nullslast&limit=500`,
    500,
  );
  return rows.map((r) => {
    const idp = (r.id_proprio || "").trim();
    const [cliente, telefone] = idp.includes(" - ") ? idp.split(" - ") : [idp, null];
    return { ref: idp, cliente: cliente || "—", telefone: telefone || null, data: r.data_aprovado || r.created_at, urgente: !!r.urgente, valor: Number(r.preco_total) || 0 };
  });
}

// Fuso SP (UTC-3, sem horário de verão).
const SP_OFFSET_MS = 3 * 3600 * 1000;
function spParts(now = new Date()) {
  const s = new Date(now.getTime() - SP_OFFSET_MS);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth(), d: s.getUTCDate() };
}
const spDayStartIso = (now = new Date()) => {
  const { y, m, d } = spParts(now);
  return new Date(Date.UTC(y, m, d, 3, 0, 0)).toISOString();
};
const spMonthStartIso = (now = new Date()) => {
  const { y, m } = spParts(now);
  return new Date(Date.UTC(y, m, 1, 3, 0, 0)).toISOString();
};
// Chave YYYY-MM-DD do dia SP de um instante.
const spDayKey = (date: Date) => new Date(date.getTime() - SP_OFFSET_MS).toISOString().slice(0, 10);
// Constrói uma série diária a partir de timestamps ISO (1 ponto por dia SP),
// usando a lista de dias fornecida (período selecionado).
function buildTrend(isoDates: (string | null)[], daysList: string[]): Trend {
  const days = daysList;
  const map = new Map(days.map((d) => [d, 0]));
  for (const iso of isoDates) {
    if (!iso) continue;
    const k = spDayKey(new Date(iso));
    if (map.has(k)) map.set(k, (map.get(k) || 0) + 1);
  }
  const points = days.map((day) => ({ day, value: map.get(day) || 0 }));
  const today = points[points.length - 1]?.value ?? 0;
  const yesterday = points.length > 1 ? points[points.length - 2].value : 0;
  const total = points.reduce((s, p) => s + p.value, 0);
  const avg = Math.round(total / points.length);
  const deltaPct = yesterday > 0
    ? Math.round(((today - yesterday) / yesterday) * 1000) / 10
    : today > 0 ? 100 : 0;
  return { days: points, today, yesterday, total, avg, deltaPct };
}

const EXCLUDE_STAGES = new Set([6, 14]); // Cancelamento/Estorno, Cancelado

export interface DayPoint { day: string; value: number }
export interface Trend { days: DayPoint[]; today: number; yesterday: number; total: number; avg: number; deltaPct: number }
export interface Trends {
  arteEnviada: Trend; aprovados: Trend; progMaquina: Trend;
  entraramProducao: Trend; fabricados: Trend; enviados: Trend;
  vetores: Trend; contornos: Trend;
}
export interface StatusCounts {
  aEmitir: number; semFormulario: number; oferecerAlmofada: number;
  aguardandoPagamento: number; comAlmofada: number; semAlmofada: number; prontoEnvio: number;
}
export interface ActionItem { label: string; value: number; icon: string; color: string; severidade: "alta" | "media" | "ok" }
export interface StageBucket { id: number; nome: string; cor: string; count: number; icon: string }
export interface ProduceItem { nome: string; imageUrl: string | null; total: number }
export interface ProduceCategoria { categoria: string; icon: string; cor: string; total: number; itens: number }

// Classifica um produto a produzir numa categoria (carimbo, chancela, etc.) pelo nome.
const CATEGORIA_REGRAS: { categoria: string; icon: string; cor: string; rx: RegExp }[] = [
  { categoria: "Carimbos", icon: "tools", cor: "var(--cat-1)", rx: /carimb/i },
  { categoria: "Chancelas", icon: "vector-bezier", cor: "var(--cat-2)", rx: /chancela/i },
  { categoria: "Almofadas", icon: "box", cor: "var(--cat-3)", rx: /almofad/i },
  { categoria: "Decorativos", icon: "sparkles", cor: "var(--cat-5)", rx: /decorat/i },
  { categoria: "Polvo / Brinde", icon: "circle-check", cor: "var(--cat-4)", rx: /polvo|brinde|cora[çc][aã]o/i },
  { categoria: "Etiquetas / Caixas", icon: "package-import", cor: "var(--cat-7)", rx: /etiqueta|caixa/i },
];
function categorizar(nome: string): { categoria: string; icon: string; cor: string } {
  for (const r of CATEGORIA_REGRAS) if (r.rx.test(nome)) return { categoria: r.categoria, icon: r.icon, cor: r.cor };
  return { categoria: "Outros", icon: "box", cor: "var(--cat-9)" };
}
export interface ProductionGoal { nome: string; goal: number }
export interface FlowCounts {
  arteEnviada: number; aprovados: number; progMaquina: number;
  entraramProducao: number; fabricados: number; enviados: number;
}
export interface SectorMetric { label: string; value: number; icon: string }
export interface SectorSummary {
  key: string;
  nome: string;
  icon: string;
  color: string;
  metrics: SectorMetric[];
  positives: string[];
  negatives: string[];
}
export interface ProductionSnapshot {
  updatedAt: string;
  periodLabel: string;
  today: FlowCounts;
  month: { fabricados: number; enviados: number };
  pipeline: { total: number; urgentes: number; atrasados: number; aguardandoMaquina: number; emProducao: number; stages: StageBucket[] };
  trends: Trends;
  status: StatusCounts;
  problemas: string[];
  acoes: ActionItem[];
  toProduce: ProduceItem[];
  toProduceCategorias: ProduceCategoria[];
  metas: ProductionGoal[];
  sectors: SectorSummary[];
  estoque: { total: number; emFalta: number; faltantes: { nome: string; qtd: number }[] };
}

interface Etapa { id: number; nome: string; cor: string | null; ordem: number }
interface Ped { etapa_id: number | null; urgente: boolean | null; data_aprovado: string | null }
interface StatusRow { a_emitir: number; sem_formulario: number; oferecer_almofada: number; aguardando_pagamento: number; com_almofada: number; sem_almofada: number }
interface Produzir { opcao_nome: string | null; imagem_url: string | null; total: number | null }
interface MetaProd { nome_produto: string | null; valor_meta: number | null }
interface Estoque { nome: string; qtd: number; min: number }

// Estoque agora vem do CATÁLOGO NOVO (estoque_itens), não do ERP antigo.
async function fetchEstoqueCatalogo(): Promise<Estoque[]> {
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("estoque_itens").select("nome,quantidade,qtd_minima").eq("ativo", true);
    return (data ?? []).map((i: { nome: string; quantidade: number | null; qtd_minima: number | null }) => ({ nome: i.nome, qtd: Number(i.quantidade) || 0, min: Number(i.qtd_minima) || 0 }));
  } catch { return []; }
}

// Ícone Tabler por id de etapa.
const STAGE_ICON: Record<number, string> = {
  1: "photo-question", 2: "vector-bezier", 3: "arrows-maximize", 4: "circle-x",
  5: "hourglass-high", 7: "circle-check", 16: "printer", 9: "tools",
  10: "package-import", 11: "truck-loading", 13: "truck-delivery",
};

export async function buildProductionSnapshot(range?: Range, now = new Date()): Promise<ProductionSnapshot> {
  const r = range ?? resolvePeriod("7d", null, null, now);
  const dayStart = spDayStartIso(now);
  const monthStart = spMonthStartIso(now);
  // Série diária do período por coluna de data — busca enxuta de uma coluna só.
  const colWin = (col: string) =>
    fetchAllErp<Record<string, string | null>>("pedidos", `select=${col}&${col}=gte.${r.fromIso}&${col}=lt.${r.toIso}`);

  const [etapas, peds, produzir, metas, estoque, tArte, tApr, tProg, tProd, tFab, tEnv, mFab, mEnv,
    sArte, sApr, sProg, sProd, sFab, sEnv, sVet, sCont, statusRows] = await Promise.all([
    fetchAllErp<Etapa>("etapas_pedidos", "select=id,nome,cor,ordem&order=ordem.asc"),
    fetchAllErp<Ped>("pedidos", "select=etapa_id,urgente,data_aprovado&arquivado=eq.false&concluido=eq.false"),
    fetchAllErp<Produzir>("lista_produtos_produzir_agrupados", "select=opcao_nome,imagem_url,total&order=total.desc&limit=300"),
    fetchAllErp<MetaProd>("metas_producao", "select=nome_produto,valor_meta&order=valor_meta.desc"),
    fetchEstoqueCatalogo(),
    countErp("pedidos", `select=id&data_arte_enviada=gte.${dayStart}`),
    countErp("pedidos", `select=id&data_aprovado=gte.${dayStart}`),
    countErp("pedidos", `select=id&data_prog_maquina=gte.${dayStart}`),
    countErp("pedidos", `select=id&data_producao=gte.${dayStart}`),
    countErp("pedidos", `select=id&data_fabricado=gte.${dayStart}`),
    countErp("pedidos", `select=id&data_envio=gte.${dayStart}`),
    countErp("pedidos", `select=id&data_fabricado=gte.${monthStart}`),
    countErp("pedidos", `select=id&data_envio=gte.${monthStart}`),
    colWin("data_arte_enviada"),
    colWin("data_aprovado"),
    colWin("data_prog_maquina"),
    colWin("data_producao"),
    colWin("data_fabricado"),
    colWin("data_envio"),
    fetchAllErp<{ data_vetor: string }>("dash_vetor", `select=data_vetor&data_vetor=gte.${r.fromIso}&data_vetor=lt.${r.toIso}`),
    fetchAllErp<{ data_contorno: string }>("dash_contorno", `select=data_contorno&data_contorno=gte.${r.fromIso}&data_contorno=lt.${r.toIso}`),
    fetchAllErp<StatusRow>("pedidos_status_contagem", "select=a_emitir,sem_formulario,oferecer_almofada,aguardando_pagamento,com_almofada,sem_almofada"),
  ]);

  const trends: Trends = {
    arteEnviada: buildTrend(sArte.map((x) => x.data_arte_enviada), r.days),
    aprovados: buildTrend(sApr.map((x) => x.data_aprovado), r.days),
    progMaquina: buildTrend(sProg.map((x) => x.data_prog_maquina), r.days),
    entraramProducao: buildTrend(sProd.map((x) => x.data_producao), r.days),
    fabricados: buildTrend(sFab.map((x) => x.data_fabricado), r.days),
    enviados: buildTrend(sEnv.map((x) => x.data_envio), r.days),
    vetores: buildTrend(sVet.map((x) => x.data_vetor), r.days),
    contornos: buildTrend(sCont.map((x) => x.data_contorno), r.days),
  };
  const sc = statusRows[0] || ({} as StatusRow);
  const status: StatusCounts = {
    aEmitir: sc.a_emitir || 0, semFormulario: sc.sem_formulario || 0,
    oferecerAlmofada: sc.oferecer_almofada || 0, aguardandoPagamento: sc.aguardando_pagamento || 0,
    comAlmofada: sc.com_almofada || 0, semAlmofada: sc.sem_almofada || 0,
    prontoEnvio: (sc.com_almofada || 0) + (sc.sem_almofada || 0),
  };

  const metaById = new Map(etapas.map((e) => [e.id, e]));
  const counts = new Map<number, number>();
  const atrasoPorEtapa: Record<number, number> = {};
  let urgentes = 0, atrasados = 0;
  // Em atraso = aprovado há mais de 4 dias e ainda não concluído (regra do negócio).
  const nowMs = now.getTime();
  const ATRASO_MS = 4 * 864e5;
  for (const p of peds) {
    if (p.etapa_id == null || EXCLUDE_STAGES.has(p.etapa_id)) continue;
    counts.set(p.etapa_id, (counts.get(p.etapa_id) || 0) + 1);
    if (p.urgente) urgentes++;
    if (p.data_aprovado && nowMs - Date.parse(p.data_aprovado) > ATRASO_MS) {
      atrasados++;
      atrasoPorEtapa[p.etapa_id] = (atrasoPorEtapa[p.etapa_id] || 0) + 1;
    }
  }
  const c = (id: number) => counts.get(id) || 0;
  const stages: StageBucket[] = [...counts.entries()]
    .map(([id, count]) => {
      const e = metaById.get(id);
      return { id, nome: e?.nome || `Etapa ${id}`, cor: e?.cor || "var(--neutro)", count, icon: STAGE_ICON[id] || "box" };
    })
    .sort((a, b) => (metaById.get(a.id)?.ordem ?? 99) - (metaById.get(b.id)?.ordem ?? 99));
  const total = stages.reduce((s, x) => s + x.count, 0);

  const today: FlowCounts = {
    arteEnviada: tArte, aprovados: tApr, progMaquina: tProg,
    entraramProducao: tProd, fabricados: tFab, enviados: tEnv,
  };

  // Estoque (catálogo novo): em falta = zerado OU abaixo do mínimo.
  let emFalta = 0;
  const faltantesArr: { nome: string; qtd: number }[] = [];
  for (const e of estoque) {
    const falta = e.qtd <= 0 || (e.min > 0 && e.qtd <= e.min);
    if (falta) {
      emFalta++;
      if (faltantesArr.length < 12) faltantesArr.push({ nome: (e.nome || "Item").trim(), qtd: e.qtd });
    }
  }

  // ── Setores ──
  // O FLUXO segue o período da tela, como os cards de cima; a FILA é o estado
  // de agora. Com "hoje" aqui, a tela que abre em "Este mês" dizia "0
  // fabricados" todo sábado de manhã.
  const sectors = montarSetores({
    fluxo: {
      arteEnviada: trends.arteEnviada.total, aprovados: trends.aprovados.total,
      progMaquina: trends.progMaquina.total, entraramProducao: trends.entraramProducao.total,
      fabricados: trends.fabricados.total, enviados: trends.enviados.total,
    },
    porEtapa: Object.fromEntries(counts),
    atrasoPorEtapa,
    status,
    estoque: { total: estoque.length, emFalta },
  });

  // ── Problemas frequentes (alertas) ──
  const problemas: string[] = [];
  if (atrasados > 0) problemas.push(`${atrasados} pedidos em atraso no pipeline`);
  if (urgentes > 10) problemas.push(`${urgentes} pedidos urgentes na fila`);
  if (c(9) > 250) problemas.push(`${c(9)} em produção — fila alta`);
  if (c(4) > 40) problemas.push(`${c(4)} artes reprovadas aguardando correção`);
  if (status.aEmitir > 50) problemas.push(`${status.aEmitir} etiquetas a emitir`);
  if (emFalta > 0) problemas.push(`${emFalta} itens de estoque zerados`);
  if (!problemas.length) problemas.push("Nenhum gargalo crítico no momento");

  // ── O que precisa ser feito agora (ações em tempo real) ──
  const acoes: ActionItem[] = [
    { label: "Urgentes na fila", value: urgentes, icon: "alert-triangle", color: "var(--perigo)", severidade: urgentes > 10 ? "alta" : urgentes > 0 ? "media" : "ok" },
    { label: "Em atraso", value: atrasados, icon: "hourglass-high", color: "var(--atencao)", severidade: atrasados > 20 ? "alta" : atrasados > 0 ? "media" : "ok" },
    { label: "Artes reprovadas p/ refazer", value: c(4), icon: "circle-x", color: "var(--perigo)", severidade: c(4) > 40 ? "alta" : c(4) > 0 ? "media" : "ok" },
    { label: "Aguardando aprovação cliente", value: c(5), icon: "hourglass-high", color: "var(--info)", severidade: c(5) > 250 ? "alta" : "media" },
    { label: "A vetorizar (com arte)", value: c(2), icon: "vector-bezier", color: "var(--roxo)", severidade: c(2) > 80 ? "alta" : "media" },
    { label: "Etiquetas a emitir", value: status.aEmitir, icon: "truck-loading", color: "var(--indigo)", severidade: status.aEmitir > 50 ? "alta" : "media" },
  ];

  return {
    updatedAt: now.toISOString(),
    periodLabel: r.label,
    today,
    month: { fabricados: mFab, enviados: mEnv },
    pipeline: { total, urgentes, atrasados, aguardandoMaquina: c(7), emProducao: c(9), stages },
    trends,
    status,
    problemas,
    acoes,
    toProduce: produzir.slice(0, 12).map((p) => ({ nome: p.opcao_nome || "Produto", imageUrl: p.imagem_url ?? null, total: Number(p.total) || 0 })),
    toProduceCategorias: (() => {
      const m = new Map<string, ProduceCategoria>();
      for (const p of produzir) {
        const { categoria, icon, cor } = categorizar(p.opcao_nome || "");
        const e = m.get(categoria) || { categoria, icon, cor, total: 0, itens: 0 };
        e.total += Number(p.total) || 0; e.itens += 1; m.set(categoria, e);
      }
      return [...m.values()].sort((a, b) => b.total - a.total);
    })(),
    metas: metas.map((m) => ({ nome: (m.nome_produto || "Produto").trim(), goal: Number(m.valor_meta) || 0 })).slice(0, 10),
    sectors,
    estoque: { total: estoque.length, emFalta, faltantes: faltantesArr },
  };
}

type C = (id: number) => number;

/** Entrada pura do "Resumo por setor" — sem ERP, para o teste bater direto. */
export interface EntradaSetores {
  /** Totais do PERÍODO da tela (não de hoje). */
  fluxo: FlowCounts;
  /** Pedidos abertos por etapa do ERP. */
  porEtapa: Record<number, number>;
  /** Dos abertos, quantos foram aprovados há mais de 4 dias (a regra de atraso). */
  atrasoPorEtapa: Record<number, number>;
  status: StatusCounts;
  estoque: { total: number; emFalta: number };
}

/**
 * Os cartões do "Resumo por setor". O cartão pinta `positives` com check verde
 * e `negatives` com triângulo, então: falta de movimento é ALERTA, e o elogio
 * ("sem gargalo") só entra quando não há alerta nenhum. Antes a frase de
 * reserva caía na lista errada e a Produção dizia, lado a lado, "Sem produção
 * registrada hoje" com check e "Fluxo de produção saudável" com alerta.
 */
export function montarSetores(e: EntradaSetores): SectorSummary[] {
  const c: C = (id) => e.porEtapa[id] || 0;
  const atraso: C = (id) => e.atrasoPorEtapa[id] || 0;
  return [
    sectorDesign(e.fluxo, c),
    sectorProducao(e.fluxo, c, atraso),
    sectorEntradaLog(c),
    sectorLogistica(e.fluxo, e.status),
    sectorEstoque(e.estoque.total, e.estoque.emFalta),
  ];
}

function sectorDesign(f: FlowCounts, c: C): SectorSummary {
  const semArte = c(1), aguardando = c(5), naoAprov = c(4);
  const positives: string[] = [];
  const negatives: string[] = [];
  if (f.aprovados > 0) positives.push(`${f.aprovados} artes aprovadas no período`);
  if (f.arteEnviada > 0) positives.push(`${f.arteEnviada} artes enviadas no período`);
  if (!f.aprovados && !f.arteEnviada) negatives.push("Nenhuma arte enviada ou aprovada no período");
  if (semArte > 80) negatives.push(`Fila "Sem Arte" alta: ${semArte} pedidos`);
  if (naoAprov > 40) negatives.push(`${naoAprov} artes reprovadas aguardando correção`);
  if (aguardando > 250) negatives.push(`${aguardando} aguardando aprovação do cliente`);
  if (!negatives.length) positives.push("Sem gargalos relevantes");
  return {
    key: "design", nome: "Design", icon: "palette", color: "var(--roxo)",
    metrics: [
      { label: "Sem arte", value: semArte, icon: "photo-question" },
      { label: "Com arte", value: c(2), icon: "vector-bezier" },
      { label: "Aguardando aprovação", value: aguardando, icon: "hourglass-high" },
      { label: "Reprovadas", value: naoAprov, icon: "circle-x" },
    ],
    positives, negatives,
  };
}

// O fluxo do ERP hoje: Aprovado (7) → programado na máquina → Em produção (9)
// → fabricado → Entrada Logística (10). A etapa 16 "Máquinas" existe, mas está
// `oculto_sistema` e vive vazia — contá-la dava "0 em máquinas" para sempre. E
// nenhuma coluna do pedido separa "na máquina" de "em montagem" com confiança
// (`sub_etapa_maquina` fica nula em ~97%, e as programações abertas guardam
// pedido já enviado). Então o cartão mostra as duas filas que o ERP mantém.
function sectorProducao(f: FlowCounts, c: C, atraso: C): SectorSummary {
  const aguardando = c(7), producao = c(9);
  const emAtraso = atraso(7) + atraso(9);
  const positives: string[] = [];
  const negatives: string[] = [];
  if (f.fabricados > 0) positives.push(`${f.fabricados} pedidos fabricados no período`);
  if (f.progMaquina > 0) positives.push(`${f.progMaquina} programados na máquina no período`);
  if (f.fabricados === 0) negatives.push("Nada fabricado no período");
  if (emAtraso > 0) negatives.push(`${emAtraso} pedidos aprovados há mais de 4 dias ainda não fabricados`);
  if (producao > 250) negatives.push(`${producao} em produção — fila alta`);
  if (!negatives.length) positives.push("Sem gargalo na produção");
  return {
    key: "producao", nome: "Produção", icon: "tools", color: "var(--atencao)",
    metrics: [
      { label: "Aguardando máquina", value: aguardando, icon: "hourglass-high" },
      { label: "Em produção", value: producao, icon: "tools" },
      { label: "Programados no período", value: f.progMaquina, icon: "printer" },
      { label: "Fabricados no período", value: f.fabricados, icon: "circle-check" },
    ],
    positives, negatives,
  };
}

function sectorEntradaLog(c: C): SectorSummary {
  const sep = c(10);
  return {
    key: "entrada-logistica", nome: "Entrada Logística", icon: "package-import", color: "var(--indigo)",
    metrics: [
      { label: "Em separação", value: sep, icon: "package-import" },
    ],
    positives: sep > 60 ? [] : ["Separação em dia"],
    negatives: sep > 60 ? [`${sep} pedidos acumulados em separação`] : [],
  };
}

function sectorLogistica(f: FlowCounts, s: StatusCounts): SectorSummary {
  const prontos = s.prontoEnvio; // com + sem almofada (correto)
  const positives: string[] = [];
  const negatives: string[] = [];
  if (f.enviados > 0) positives.push(`${f.enviados} pedidos enviados no período`);
  else negatives.push("Nenhum envio no período");
  if (prontos > 150) negatives.push(`${prontos} prontos parados aguardando envio`);
  else positives.push("Sem acúmulo de envios");
  return {
    key: "logistica", nome: "Logística", icon: "truck", color: "var(--info)",
    metrics: [
      { label: "Pronto p/ envio", value: prontos, icon: "truck-loading" },
      { label: "Etiqueta a emitir", value: s.aEmitir, icon: "truck-loading" },
      { label: "Sem formulário", value: s.semFormulario, icon: "box" },
      { label: "Enviados no período", value: f.enviados, icon: "truck-delivery" },
    ],
    positives, negatives,
  };
}

function sectorEstoque(total: number, emFalta: number): SectorSummary {
  return {
    key: "estoque", nome: "Estoque", icon: "building-warehouse", color: "var(--ok)",
    metrics: [
      { label: "Itens cadastrados", value: total, icon: "box" },
      { label: "Em falta / zerados", value: emFalta, icon: "alert-triangle" },
    ],
    positives: [emFalta === 0 ? "Nenhum item zerado" : `${total - emFalta} itens acima do mínimo`],
    negatives: emFalta > 0 ? [`${emFalta} itens zerados ou abaixo do mínimo`] : [],
  };
}
