import type {
  Metrics,
  Product,
  Salesperson,
  SalesSnapshot,
  Team,
} from "@/lib/types";
import { getMetaSpend } from "@/lib/meta";
import { foraDoComercial, isMarketingX1, livroComercial } from "@/lib/vendedoras";

// ── Fonte legada (ERP TridiXP).
const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZHB0ZHZrbGRyZ2hldm10bXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY5OTM4NzgsImV4cCI6MjAzMjU2OTg3OH0.SYzaaJO1jnT7064c6Q5KIcshvD9j_o1TuTFmmF2H46k";
// service role (env) desbloqueia tabelas RLS; cai pra anon se ausente.
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || LEGACY_ANON;

// Mapa de equipes (espelha scripts/legacy.mjs). setor 2 = Comercial.
const SETOR_TEAM: Record<number, "marketing" | "comercial"> = { 2: "comercial" };
// Quem é X1 sai de `lib/vendedoras.ts` (`isMarketingX1`), NÃO de uma lista
// própria daqui. Existiam duas, e elas já tinham divergido: esta trazia só a
// Letícia por UUID, enquanto o Analytics conta Letícia E Beatriz. Resultado: a
// Beatriz era Marketing numa tela e Comercial na parede de TV, com o mesmo
// dado embaixo. Uma pergunta, uma resposta.
const USER_TEAM: Record<string, "marketing" | "comercial"> = {};
// Samuel e Suzuki (administradores) saem do comercial em TODA a casa por
// `foraDoComercial` de lib/vendedoras.ts — o livro já chega sem eles. Esta lista
// é só o que a parede de TV tira A MAIS do ranking — de qualquer time, X1
// incluído (a Letícia é X1 e aparecia no ranking como "marketing"). Pedido do
// dono em 14/09/2026: essas três não aparecem na parede de maneira alguma.
// Casa por "contém", sem acento nem caixa ("Letícia" = "leticia").
const EXCLUDE_NAMES = ["emanuelly", "ana julia", "leticia"];
const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export const foraDaParede = (nome: string | null | undefined) => {
  const n = semAcento(nome || "");
  return !!n && EXCLUDE_NAMES.some((x) => n.includes(x));
};

interface ErpUser {
  user_id: string;
  nome: string | null;
  apelido: string | null;
  foto_url: string | null;
  setor_id: number | null;
}

function teamOf(u: ErpUser | undefined): "marketing" | "comercial" | null {
  if (!u) return null;
  const n = (u.apelido || u.nome || "").toLowerCase();
  if (foraDoComercial(n) || foraDaParede(u.nome) || foraDaParede(u.apelido)) return null;
  if (USER_TEAM[u.user_id]) return USER_TEAM[u.user_id];
  // X1 é Marketing em toda a casa — inclusive aqui.
  if (isMarketingX1(u.apelido || u.nome)) return "marketing";
  return SETOR_TEAM[u.setor_id ?? -1] ?? null;
}

const headers = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

async function fetchAllErp<T = Record<string, unknown>>(
  table: string,
  query: string,
  cap = 100000
): Promise<T[]> {
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

// Fuso de São Paulo (UTC-3, sem horário de verão). Meia-noite SP = 03:00 UTC.
const SP_OFFSET_MS = 3 * 3600 * 1000;
// "Relógio de parede" SP: pega ano/mês/dia/dow lendo os getters UTC do instante deslocado.
function spWall(now = new Date()) {
  const s = new Date(now.getTime() - SP_OFFSET_MS);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth(), d: s.getUTCDate(), dow: s.getUTCDay(), hour: s.getUTCHours() };
}
// Instante UTC correspondente a uma meia-noite SP (Y,M,D).
const spMidnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 3, 0, 0));
// Chave YYYY-MM-DD no dia SP.
const spDayKey = (date: Date) => new Date(date.getTime() - SP_OFFSET_MS).toISOString().slice(0, 10);

export function startOf(period: "daily" | "weekly" | "monthly", now = new Date()): Date {
  const w = spWall(now);
  if (period === "daily") return spMidnight(w.y, w.m, w.d);
  if (period === "weekly") {
    const back = (w.dow + 6) % 7; // segunda = 0
    return spMidnight(w.y, w.m, w.d - back);
  }
  return spMidnight(w.y, w.m, 1);
}

const VALID = "valores_corretos=eq.true&preco_total=gt.0";

interface Pedido {
  responsavel_id: string | null;
  preco_total: number | null;
  preco_yampi: number | null;
  plataforma_id: number | null;
  qual_yampi: string | null;
  created_at: string;
}

// Monta o snapshot completo (vendas + métricas) lendo o ERP ao vivo.
export async function buildErpSnapshot(now = new Date()): Promise<SalesSnapshot> {
  const monthStart = startOf("monthly", now);
  const weekStart = startOf("weekly", now);
  const dayStart = startOf("daily", now);
  const prevMonthStart = new Date(monthStart);
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
  const prevCutoff = new Date(prevMonthStart.getTime() + (now.getTime() - monthStart.getTime()));

  // Datas SP (string) do mês corrente. O recorte do livro do comercial é o
  // `livroComercial()` quem monta, com as janelas certas de cada tabela do ERP
  // (`data_venda` é meia-noite UTC; `data_pagamento` é instante em Brasília).
  // Data nua num filtro dessas colunas derruba o último dia inteiro.
  const w0 = spWall(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthStartDate = `${w0.y}-${pad(w0.m + 1)}-01`;
  const todayDate = spDayKey(now);
  const weekStartDate = spDayKey(weekStart);

  const [users, peds, prevPeds, itens, paidPeds, allPeds, vplan] = await Promise.all([
    fetchAllErp<ErpUser>("usuarios", "select=user_id,nome,apelido,foto_url,setor_id&atividade=eq.true"),
    fetchAllErp<Pedido>(
      "pedidos",
      `select=responsavel_id,preco_total,preco_yampi,plataforma_id,qual_yampi,created_at&created_at=gte.${monthStart.toISOString()}&${VALID}`
    ),
    fetchAllErp<{ preco_total: number | null }>(
      "pedidos",
      `select=preco_total&created_at=gte.${prevMonthStart.toISOString()}&created_at=lt.${prevCutoff.toISOString()}&${VALID}`
    ),
    // `preco` entra aqui porque `topProducts[].revenue` existia no contrato e
    // era SEMPRE zero — nunca foi somado. Quem lia o campo (o painel novo de
    // widgets) mostrava "R$ 0" em todo produto na TV. Mesma consulta, mesma
    // quantidade de linhas: só uma coluna a mais.
    fetchAllErp<{ nome: string | null; nome_inteiro: string | null; imagem_url: string | null; preco: number | null }>(
      "itens_pedidos",
      `select=nome,nome_inteiro,imagem_url,preco&created_at=gte.${monthStart.toISOString()}`
    ),
    // Receita de tráfego pago (Carimbos Tridi) no MÊS corrente p/ a série.
    fetchAllErp<{ preco_yampi: number | null; created_at: string }>(
      "pedidos",
      `select=preco_yampi,created_at&created_at=gte.${monthStart.toISOString()}&qual_yampi=eq.Carimbos%20Tridi&${VALID}`
    ),
    // Faturamento total do MÊS corrente p/ a série.
    fetchAllErp<{ preco_total: number | null; created_at: string }>(
      "pedidos",
      `select=preco_total,created_at&created_at=gte.${monthStart.toISOString()}&${VALID}`
    ),
    // Livro do comercial (por vendedora) do MÊS corrente. Qual das duas tabelas
    // do ERP responde por cada dia é decisão do `livroComercial()` — a planilha
    // antiga morreu em 31/08/2026 e ler só ela zerava o Comercial da parede.
    livroComercial({ fromDate: monthStartDate, toDate: todayDate }),
  ]);

  const byId = new Map(users.map((u) => [u.user_id, u]));

  // ── Vendedores (ranking) ── COMERCIAL real, do livro do ERP (venda líquida)
  //
  // O total do Comercial conta o MESMO recorte que o ranking mostra: só quem é
  // do time comercial. Antes ele somava TODAS as linhas da planilha — X1 e as
  // pessoas de `EXCLUDE_NAMES` incluídas —, então a parede de TV exibia um
  // Comercial maior que o do Analytics e não havia nada na tela explicando a
  // diferença. Um número com dois significados é pior que dois números.
  type Agg = { daily: number; weekly: number; monthly: number; nd: number; nw: number; nm: number };
  const agg = new Map<string, Agg>();
  let comTotalR = 0, comTotalN = 0; // total comercial (líquida) do mês
  for (const v of vplan) {
    const id = v.vendedoraId ?? "";
    const liq = v.liquido;
    const dateStr = v.dia;
    const a = agg.get(id) || { daily: 0, weekly: 0, monthly: 0, nd: 0, nw: 0, nm: 0 };
    a.monthly += liq; a.nm += 1;
    if (dateStr >= weekStartDate) { a.weekly += liq; a.nw += 1; }
    if (dateStr === todayDate) { a.daily += liq; a.nd += 1; }
    agg.set(id, a);
    if (teamOf(byId.get(id)) === "comercial") { comTotalR += liq; comTotalN += 1; }
  }
  const salespeople: Salesperson[] = [...agg.entries()]
    .map(([uid, a]) => {
      const u = byId.get(uid);
      const team = teamOf(u);
      if (!u || !team) return null;
      return {
        id: uid,
        name: u.apelido || u.nome || uid.slice(0, 8),
        photoUrl: u.foto_url,
        team,
        sales: { daily: Math.round(a.daily), weekly: Math.round(a.weekly), monthly: Math.round(a.monthly) },
        goal: { daily: 0, weekly: 0, monthly: 0 }, // metas vêm do Supabase (merge na rota)
        orders: { daily: a.nd, weekly: a.nw, monthly: a.nm },
      } as Salesperson;
    })
    .filter((x): x is Salesperson => x !== null)
    .sort((a, b) => b.sales.monthly - a.sales.monthly)
    .slice(0, 12);

  // ── Métricas Fase 2 ──
  let totalRevenue = 0, totalCount = 0;
  let yPaidR = 0, yPaidN = 0, yOrgR = 0, yOrgN = 0;
  for (const p of peds) {
    const v = Number(p.preco_total) || 0;
    totalRevenue += v; totalCount++;
    // Receita de marketing por classificação Yampi — mesma conta do Analytics
    // (lib/vendas.ts): soma por qual_yampi, SEM travar em plataforma_id=6.
    const yv = Number(p.preco_yampi) || 0;
    if (p.qual_yampi === "Carimbos Tridi") { yPaidR += yv; yPaidN++; }
    else if (p.qual_yampi === "Carimbos (Organico)") { yOrgR += yv; yOrgN++; }
  }
  const yTotalR = yPaidR + yOrgR;
  const yTotalN = yPaidN + yOrgN;

  // Gasto Meta Ads (todas as contas/BMs do token). null se sem token/falha.
  const metaSpend = await getMetaSpend(monthStartDate, todayDate);
  const spendMonth = metaSpend ? Math.round(metaSpend.month) : null;
  const spendReal = spendMonth !== null ? Math.round(spendMonth * 1.1383) : null;
  // Vendas Comercial = total do livro do comercial (venda líquida).
  const comR = comTotalR, comN = comTotalN;

  // Projeção run-rate (SP): faturamento ÷ dias decorridos × dias do mês.
  const w = spWall(now);
  const dayOfMonth = w.d;
  const daysInMonth = new Date(Date.UTC(w.y, w.m + 1, 0)).getUTCDate();
  const projection = dayOfMonth > 0 ? Math.round((totalRevenue / dayOfMonth) * daysInMonth) : totalRevenue;

  // ── Séries do MÊS corrente (dia 1 → hoje, fuso SP) ──
  const monthDays: string[] = [];
  for (let d = 1; d <= dayOfMonth; d++) monthDays.push(spDayKey(spMidnight(w.y, w.m, d)));
  const buildSeries = (rows: { created_at: string }[], val: (r: { created_at: string }) => number) => {
    const map = new Map<string, number>(monthDays.map((d) => [d, 0]));
    for (const r of rows) {
      const k = spDayKey(new Date(r.created_at));
      if (map.has(k)) map.set(k, (map.get(k) || 0) + val(r));
    }
    return [...map.entries()].map(([day, value]) => ({ day, value: Math.round(value) }));
  };
  const trafficSeries = buildSeries(paidPeds, (r) => Number((r as { preco_yampi?: number }).preco_yampi) || 0);
  const revenueSeries = buildSeries(allPeds, (r) => Number((r as { preco_total?: number }).preco_total) || 0);
  const last7 = trafficSeries.slice(-7).reduce((s, x) => s + x.value, 0);
  const prev7 = trafficSeries.slice(-14, -7).reduce((s, x) => s + x.value, 0);
  const paidTrendPct = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 1000) / 10 : 0;

  const metrics: Metrics = {
    totalSales: { revenue: Math.round(totalRevenue), count: totalCount },
    yampi: {
      paid: { revenue: Math.round(yPaidR), count: yPaidN },
      organic: { revenue: Math.round(yOrgR), count: yOrgN },
      total: { revenue: Math.round(yTotalR), count: yTotalN },
      ticketMedio: yTotalN > 0 ? Math.round(yTotalR / yTotalN) : 0,
    },
    comercial: { revenue: Math.round(comR), count: comN },
    projection,
    trafficSpend: spendMonth,
    trafficSpendReal: spendReal,
    paidTrendPct,
    trafficSeries,
    revenueSeries,
  };

  // ── Equipes (corrida do foguete): Marketing = tráfego pago; Comercial = setor 2 ──
  const teams: Team[] = [
    { id: "marketing", name: "Marketing", current: Math.round(yPaidR), goal: 0, progressPct: 0 },
    { id: "comercial", name: "Comercial", current: Math.round(comR), goal: 0, progressPct: 0 },
  ];

  // ── Faturamento ──
  const revWeek = peds.filter((p) => new Date(p.created_at) >= weekStart).reduce((s, p) => s + (Number(p.preco_total) || 0), 0);
  const revDay = peds.filter((p) => new Date(p.created_at) >= dayStart).reduce((s, p) => s + (Number(p.preco_total) || 0), 0);
  const revPrev = prevPeds.reduce((s, p) => s + (Number(p.preco_total) || 0), 0);
  const trend = revPrev > 0 ? ((totalRevenue - revPrev) / revPrev) * 100 : 0;

  // ── Produtos mais vendidos (por quantidade de itens no mês) ──
  const cleanName = (s: string) =>
    s
      .replace(/\bn[ãa]o definido\b/gi, "")
      .replace(/\(\s*sem\s*\)/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim() || "Produto";

  const prod = new Map<string, Product>();
  for (const it of itens) {
    const key = cleanName(it.nome_inteiro || it.nome || "Produto");
    const p = prod.get(key) || { id: key, name: key, imageUrl: it.imagem_url, qty: 0, revenue: 0 };
    p.qty += 1;
    p.revenue += Number(it.preco) || 0;
    if (!p.imageUrl && it.imagem_url) p.imageUrl = it.imagem_url;
    prod.set(key, p);
  }
  const topProducts = [...prod.values()].sort((a, b) => b.qty - a.qty).slice(0, 8)
    .map((p, i) => ({ ...p, id: `prod-${i}` }));

  return {
    updatedAt: now.toISOString(),
    salespeople,
    teams,
    revenue: {
      daily: Math.round(revDay),
      weekly: Math.round(revWeek),
      monthly: Math.round(totalRevenue),
      trendPct: Math.round(trend * 10) / 10,
    },
    topProducts,
    metrics,
  };
}
