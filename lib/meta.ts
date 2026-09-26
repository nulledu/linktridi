// ── Meta Ads (Marketing API) — gasto agregado de TODAS as contas de TODOS os
// perfis conectados. Cada token (lib/meta-tokens) é um login do Facebook; para
// cada um, /me/adaccounts lista as contas de todas as BMs automaticamente (conta
// nova entra sozinha). Aqui juntamos as contas de todos os perfis, deduplicando
// por account_id, e somamos o gasto. Tokens ficam na tabela meta_token (Supabase),
// renovados pelo cron /api/meta/refresh; sem tabela, cai no env META_ADS_TOKEN.
import { getAllTokens } from "@/lib/meta-tokens";

const GRAPH = "https://graph.facebook.com/v21.0";

export interface MetaSpend {
  month: number; // gasto do mês corrente (R$)
  today: number; // gasto de hoje (R$)
}

export interface MetaAccount {
  id: string;          // account_id (sem o prefixo act_)
  name: string;        // nome da conta no Facebook
  spend: number;       // gasto no período (R$)
  purchases: number;   // compras (omni_purchase) atribuídas pela Meta
  revenue: number;     // valor das compras (R$)
  roas: number | null; // retorno sobre o investimento (Meta purchase_roas)
}

export interface MetaPeriodSpend {
  total: number;                 // gasto total do período
  totalRevenue: number;          // receita atribuída total (Meta)
  totalPurchases: number;        // compras totais (Meta)
  prev: number | null;           // gasto do período anterior (mesmo tamanho), p/ Δ
  accounts: MetaAccount[];       // métricas por conta (só contas com gasto > 0)
}

interface AcctInsight { spend: number; purchases: number; revenue: number; roas: number | null }

function pickAction(arr: Array<{ action_type: string; value: string }> | undefined, types: string[]): number {
  if (!arr) return 0;
  for (const t of types) { const x = arr.find((a) => a.action_type === t); if (x) return parseFloat(x.value) || 0; }
  return 0;
}

// Insights completos de uma conta: gasto + compras + receita + ROAS (Meta).
async function accountInsights(token: string, actId: string, since: string, until: string): Promise<AcctInsight> {
  const tr = encodeURIComponent(JSON.stringify({ since, until }));
  const url = `${GRAPH}/act_${actId}/insights?fields=spend,actions,action_values,purchase_roas&level=account&time_range=${tr}&access_token=${token}`;
  const d = await gj(url);
  if (d.error) return { spend: 0, purchases: 0, revenue: 0, roas: null };
  const row = ((d.data as Array<Record<string, unknown>>) || [])[0] || {};
  const spend = parseFloat((row.spend as string) || "0") || 0;
  const PURCH = ["omni_purchase", "offsite_conversion.fb_pixel_purchase", "purchase"];
  const purchases = pickAction(row.actions as Array<{ action_type: string; value: string }>, PURCH);
  const revenue = pickAction(row.action_values as Array<{ action_type: string; value: string }>, PURCH);
  const roasArr = row.purchase_roas as Array<{ value: string }> | undefined;
  const roas = roasArr && roasArr[0] ? parseFloat(roasArr[0].value) || null : null;
  return { spend, purchases, revenue, roas };
}

// Cache em memória (o módulo vive no processo serverless). Insights de Ads
// acumulam devagar — 20 min é folgado p/ painel e economiza rate-limit.
let cache: { at: number; data: MetaSpend } | null = null;
const TTL_MS = 20 * 60 * 1000;

// ── ETag/304 ──────────────────────────────────────────────────────────────
// Guarda o ETag + corpo da última resposta por URL. Na próxima chamada envia
// If-None-Match; se a Meta responder 304 (Not Modified), reusa o corpo salvo
// sem baixar/parsear de novo. Limite de entradas p/ não vazar memória.
const etagStore = new Map<string, { etag: string; body: Record<string, unknown> }>();
const ETAG_MAX = 300;

async function gj(url: string): Promise<Record<string, unknown>> {
  const prev = etagStore.get(url);
  const headers: Record<string, string> = {};
  if (prev?.etag) headers["If-None-Match"] = prev.etag;
  const res = await fetch(url, { cache: "no-store", headers });
  if (res.status === 304 && prev) return prev.body;
  const body = (await res.json()) as Record<string, unknown>;
  const etag = res.headers.get("etag");
  if (res.ok && etag) {
    if (etagStore.size >= ETAG_MAX) etagStore.clear();
    etagStore.set(url, { etag, body });
  }
  return body;
}

// Segue paginação (`paging.next`) e concatena `data`. Existe porque `gj` sozinho
// devolve só a 1ª página: consulta que passa do `limit` era truncada em silêncio,
// virando número menor que o real sem nenhum erro. Espelha o gjAll do meta-ads.
const MAX_PAGINAS_META = 25;
async function gjTudo(url: string): Promise<Record<string, unknown>> {
  const primeira = await gj(url);
  if (primeira.error) return primeira;
  const acc = [...((primeira.data as unknown[]) || [])];
  let next = (primeira.paging as { next?: string } | undefined)?.next;
  for (let i = 0; next && i < MAX_PAGINAS_META; i++) {
    const pag = await gj(next);
    if (pag.error) break;                       // mantém o que já veio
    acc.push(...((pag.data as unknown[]) || []));
    next = (pag.paging as { next?: string } | undefined)?.next;
  }
  return { ...primeira, data: acc };
}

// Junta as contas de anúncio de TODOS os perfis conectados, deduplicando por
// account_id (uma conta vista por dois perfis conta uma vez). Cada conta carrega
// o token que a enxerga, usado depois pra buscar os insights dela.
export interface AcctRef { account_id: string; name?: string; token: string }
export async function listAccounts(): Promise<AcctRef[]> {
  const tokens = await getAllTokens();
  if (!tokens.length) return [];
  const seen = new Map<string, AcctRef>();
  await Promise.all(tokens.map(async (token) => {
    const resp = await gj(`${GRAPH}/me/adaccounts?fields=account_id,name&limit=500&access_token=${token}`);
    if (resp.error) return; // token expirado/sem permissão → ignora, os outros seguem
    for (const a of (resp.data as Array<{ account_id: string; name?: string }>) || []) {
      if (!seen.has(a.account_id)) seen.set(a.account_id, { account_id: a.account_id, name: a.name, token });
    }
  }));
  return [...seen.values()];
}

/**
 * O gasto do Meta DIA A DIA, da MESMA origem que o total do período.
 *
 * Existe porque o armazém local (`meta_ad_insights_daily`) não serve para isso.
 * A nota logo acima, em `getMetaPeriodSpend`, conta a história: com a carga
 * inicial incompleta ele devolvia gasto MENOR que o real (10,8k contra 36,3k
 * medidos), e o atalho que o lia foi revertido. Medido de novo em 27/08/2026,
 * o buraco continua: R$ 41.200 no armazém contra R$ 85.552 na fatura.
 *
 * Uma série diária tirada dali não erra só o total — erra a FORMA. Os dias que
 * o armazém tem ficam certos e os que faltam ficam zerados, então "hoje" e
 * "esta semana" na parede mostram zero investido num dia em que se investiu, e
 * qualquer tentativa de reconciliar com o total do mês espalha o que falta
 * sobre os dias errados.
 *
 * `time_increment=1` resolve na origem: o Graph devolve uma linha por dia da
 * mesma consulta que dá o total, então a soma dos dias É o total, por
 * construção. Uma requisição por conta, atrás do mesmo cache de 20 min.
 */
export type DiaGastoMeta = { d: string; gasto: number };

const diarioCache = new Map<string, { at: number; data: DiaGastoMeta[] }>();

export async function gastoDiarioMeta(since: string, until: string): Promise<DiaGastoMeta[] | null> {
  const key = `${since}|${until}`;
  const hit = diarioCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  try {
    const accts = await listAccounts();
    if (!accts.length) return null;
    const porDia = new Map<string, number>();
    await Promise.all(
      accts.map(async (a) => {
        const tr = encodeURIComponent(JSON.stringify({ since, until }));
        const url = `${GRAPH}/act_${a.account_id}/insights?fields=spend&level=account&time_increment=1&time_range=${tr}&limit=400&access_token=${a.token}`;
        const d = await gj(url);
        if (d.error) return;      // conta sem permissão → as outras seguem
        for (const r of ((d.data as Array<{ date_start?: string; spend?: string }>) || [])) {
          const dia = r.date_start;
          if (!dia) continue;
          porDia.set(dia, (porDia.get(dia) ?? 0) + (parseFloat(r.spend || "0") || 0));
        }
      }),
    );
    if (porDia.size === 0) return null;
    const data = [...porDia.entries()]
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([d, gasto]) => ({ d, gasto }));
    diarioCache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

async function spendFor(token: string, actId: string, since: string, until: string): Promise<number> {
  const tr = encodeURIComponent(JSON.stringify({ since, until }));
  const url = `${GRAPH}/act_${actId}/insights?fields=spend&level=account&time_range=${tr}&access_token=${token}`;
  const d = await gj(url);
  if (d.error) return 0; // conta sem permissão/insights → ignora
  const data = (d.data as Array<{ spend?: string }>) || [];
  return data.reduce((s, r) => s + (parseFloat(r.spend || "0") || 0), 0);
}

// Retorna o gasto (mês/hoje) ou null se não houver token / falha total.
// monthStartDate/todayDate em "YYYY-MM-DD" no fuso SP.
export async function getMetaSpend(
  monthStartDate: string,
  todayDate: string
): Promise<MetaSpend | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  try {
    const accts = await listAccounts();
    if (!accts.length) return null;

    let month = 0,
      today = 0;
    await Promise.all(
      accts.map(async (a) => {
        const [m, t] = await Promise.all([
          spendFor(a.token, a.account_id, monthStartDate, todayDate),
          spendFor(a.token, a.account_id, todayDate, todayDate),
        ]);
        month += m;
        today += t;
      })
    );

    const data: MetaSpend = { month, today };
    cache = { at: Date.now(), data };
    return data;
  } catch {
    return null;
  }
}

// Gasto por conta no período + comparação com o período anterior (mesmo nº de dias).
// since/until em "YYYY-MM-DD" (fuso SP). Cache por intervalo (TTL_MS) + ETag.
const perCache = new Map<string, { at: number; data: MetaPeriodSpend }>();

function nameOf(a: { name?: string; account_id: string }): string {
  return a.name && a.name.trim() ? a.name.trim() : `Conta ${a.account_id}`;
}
function shiftDate(d: string, days: number): string {
  const t = new Date(d + "T12:00:00Z").getTime() + days * 864e5;
  return new Date(t).toISOString().slice(0, 10);
}

export async function getMetaPeriodSpend(since: string, until: string): Promise<MetaPeriodSpend | null> {
  const key = `${since}|${until}`;
  const hit = perCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  // NB: já houve aqui um fast-path lendo o warehouse. REVERTIDO: com a carga
  // inicial incompleta ele devolvia gasto MENOR que o real (10.8k vs 36.3k
  // medidos) e o lucro saía errado. Só volta quando houver verificação de
  // cobertura do período. O caminho Graph é ~1s (nível conta, sem paginação).
  try {
    const accts = await listAccounts();
    if (!accts.length) return null;

    // período anterior: mesmo nº de dias imediatamente antes de `since`.
    const days = Math.max(1, Math.round((Date.parse(until) - Date.parse(since)) / 864e5) + 1);
    const prevUntil = shiftDate(since, -1);
    const prevSince = shiftDate(prevUntil, -(days - 1));

    let total = 0, prev = 0, totalRevenue = 0, totalPurchases = 0;
    const accounts: MetaAccount[] = [];
    await Promise.all(
      accts.map(async (a) => {
        const [cur, pv] = await Promise.all([
          accountInsights(a.token, a.account_id, since, until),
          spendFor(a.token, a.account_id, prevSince, prevUntil),
        ]);
        total += cur.spend; prev += pv;
        totalRevenue += cur.revenue; totalPurchases += cur.purchases;
        if (cur.spend > 0) accounts.push({
          id: a.account_id, name: nameOf(a), spend: Math.round(cur.spend),
          purchases: cur.purchases, revenue: Math.round(cur.revenue),
          roas: cur.roas != null ? Math.round(cur.roas * 100) / 100 : (cur.spend > 0 ? Math.round((cur.revenue / cur.spend) * 100) / 100 : null),
        });
      })
    );
    accounts.sort((x, y) => y.spend - x.spend);
    const data: MetaPeriodSpend = {
      total: Math.round(total), totalRevenue: Math.round(totalRevenue), totalPurchases,
      prev: Math.round(prev), accounts,
    };
    perCache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

// ── Gasto de campanhas com {MKT} no nome (gera leads p/ o Comercial) ──
// Retorna o gasto por dia (YYYY-MM-DD) somando todas as campanhas {MKT} de
// todas as contas. Usa time_increment=1 p/ permitir agregar por dia/semana/mês.
const mktCache = new Map<string, { at: number; data: Record<string, number> }>();

export async function getMktSpendDaily(since: string, until: string): Promise<Record<string, number>> {
  const key = `${since}|${until}`;
  const hit = mktCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  try {
    const accts = await listAccounts();
    if (!accts.length) return {};
    const tr = encodeURIComponent(JSON.stringify({ since, until }));
    const porDia: Record<string, number> = {};
    await Promise.all(accts.map(async (a) => {
      const url = `${GRAPH}/act_${a.account_id}/insights?level=campaign&fields=spend,campaign_name&time_range=${tr}&time_increment=1&limit=500&access_token=${a.token}`;
      // gjTudo, não gj: level=campaign + time_increment=1 gera 1 linha por
      // campanha POR DIA. 30 dias × 50 campanhas = 1500 linhas, e o limit=500
      // cortava silenciosamente — o gasto {MKT} saía ~1/3 do real, sem erro.
      const d = await gjTudo(url);
      if (d.error) return;
      for (const row of (d.data as Array<{ spend?: string; campaign_name?: string; date_start?: string }>) || []) {
        if (!/\{mkt\}/i.test(row.campaign_name || "")) continue;
        const day = row.date_start || since;
        porDia[day] = (porDia[day] || 0) + (parseFloat(row.spend || "0") || 0);
      }
    }));
    mktCache.set(key, { at: Date.now(), data: porDia });
    return porDia;
  } catch {
    return {};
  }
}
