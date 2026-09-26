// ── Gerenciador paralelo de Meta Ads ────────────────────────────────────────
// Puxa do Graph API o panorama de todas as contas conectadas (lib/meta-tokens):
// KPIs da conta → campanhas → melhores anúncios (com criativo) + recomendações
// automáticas (o que escalar, pausar, trocar criativo). Objetivo: analisar tudo
// que o Gerenciador de Anúncios mostra, mas por aqui e com sugestões.
import { listAccounts, type AcctRef } from "@/lib/meta";
import { arvoreBateComContas } from "@/lib/meta-arvore-cobertura";
import { totaisDoPeriodo, serieDiariaLocal, arvoreLocal, type ArvoreLocal, type CampanhaLocal } from "@/lib/meta-warehouse";
import { getMarketingConfig } from "@/lib/marketing-config";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const GRAPH = "https://graph.facebook.com/v21.0";

// ── Tetos de linhas devolvidas ao client ────────────────────────────────────
const LIM_CAMPANHAS = 300;
const LIM_CONJUNTOS = 300;
// Todos os anúncios precisam chegar ao client: cortar por gasto ANTES da
// ordenação fazia "Mais vendas", "Melhor ROAS" e "Maior CTR" ignorarem os
// vencedores fora do top de investimento. Limitamos somente quantos recebem a
// consulta visual (thumb/vídeo), em união das quatro ordenações.
const LIM_VISUAIS_POR_ORDEM = 120;

// Extrai as tags {XXX} do nome da campanha (ex.: {MKT}, {SM-8660}).
function tagsDoNome(nome: string): string[] {
  const m = (nome || "").match(/\{[^}]+\}/g);
  return m ? [...new Set(m)] : [];
}
// Categoria da conta: classificação do admin (marketing_config) ou derivada do
// nome da conta (contém "carimbo"/"chancela"), senão null.
function categoriaDaConta(accountId: string, nome: string | undefined, cfg: Record<string, string>): string | null {
  if (cfg[accountId]) return cfg[accountId];
  const n = (nome || "").toLowerCase();
  if (n.includes("carimbo")) return "carimbo";
  if (n.includes("chancela")) return "chancela";
  return null;
}

async function gj(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { cache: "no-store" });
  return (await res.json()) as Record<string, unknown>;
}

// A Meta PAGINA as listas: um `limit` alto NÃO substitui seguir `paging.next`.
// Sem isto, período longo com time_increment=1 devolvia só o 1º lote e o painel
// perdia dados EM SILÊNCIO (gasto/vendas menores que a realidade).
// Segue os cursores até acabar, com teto de páginas pra não travar em loop.
const MAX_PAGINAS = 25;
async function gjAll(url: string): Promise<Record<string, unknown>> {
  const primeira = await gj(url);
  const linhas = Array.isArray(primeira.data) ? [...(primeira.data as unknown[])] : [];
  if (primeira.error || !Array.isArray(primeira.data)) return primeira;   // erro/formato inesperado → devolve como veio
  let next = (primeira.paging as { next?: string } | undefined)?.next;
  for (let i = 0; next && i < MAX_PAGINAS; i++) {
    const pag = await gj(next);
    if (pag.error || !Array.isArray(pag.data)) break;   // para na 1ª falha: melhor dado parcial que quebrar
    linhas.push(...(pag.data as unknown[]));
    next = (pag.paging as { next?: string } | undefined)?.next;
  }
  return { ...primeira, data: linhas, paging: undefined };
}

// Ações de compra e lead (nomes variam por pixel/conta).
const PURCH = ["omni_purchase", "offsite_conversion.fb_pixel_purchase", "purchase"];
const LEADS = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];
// Etapas do funil (cada uma tem vários nomes possíveis; pega o 1º que existir).
const LINKCLICK = ["link_click"];
const LPV = ["landing_page_view", "omni_landing_page_view"];
const ADDCART = ["omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"];
const CHECKOUT = ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"];
type ActionArr = Array<{ action_type: string; value: string }> | undefined;
function pickAction(arr: ActionArr, types: string[]): number {
  if (!arr) return 0;
  for (const t of types) { const x = arr.find((a) => a.action_type === t); if (x) return parseFloat(x.value) || 0; }
  return 0;
}

// Etapas do funil somadas de várias linhas de insight (nível conta).
export interface Funil {
  spend: number; revenue: number;
  impressions: number; reach: number; cliques: number; lpv: number; addCart: number; checkout: number; purchases: number;
  leads: number;   // etapa terminal dos funis de Lead/Formulário (campanhas que geram lead, não compra)
}
// Um funil rotulado por chave (uma tag {MKT} ou uma categoria Carimbo/Chancela).
export interface FunilTag { chave: string; funil: Funil }
function funilDeRows(rows: Array<Record<string, unknown>>): Funil {
  const f: Funil = { spend: 0, revenue: 0, impressions: 0, reach: 0, cliques: 0, lpv: 0, addCart: 0, checkout: 0, purchases: 0, leads: 0 };
  for (const row of rows) {
    const acts = row.actions as ActionArr;
    f.spend += parseFloat((row.spend as string) || "0") || 0;
    f.revenue += pickAction(row.action_values as ActionArr, PURCH);
    f.impressions += parseFloat((row.impressions as string) || "0") || 0;
    f.reach += parseFloat((row.reach as string) || "0") || 0;
    f.cliques += pickAction(acts, LINKCLICK) || (parseFloat((row.clicks as string) || "0") || 0);
    f.lpv += pickAction(acts, LPV);
    f.addCart += pickAction(acts, ADDCART);
    f.checkout += pickAction(acts, CHECKOUT);
    f.purchases += pickAction(acts, PURCH);
    f.leads += pickAction(acts, LEADS);
  }
  return f;
}

// Métricas normalizadas de uma linha de insight (conta/campanha/anúncio).
export interface AdMetrics {
  spend: number; impressions: number; reach: number; frequency: number;
  clicks: number; ctr: number; cpc: number; cpm: number;
  purchases: number; revenue: number; roas: number | null; leads: number;
  cpa: number | null; cpl: number | null;
  // Etapas do funil POR LINHA (conta/campanha/anúncio) — pro drill-down do Funil
  // reconciliar com o total da etapa. Opcionais: linha sem `actions` fica sem.
  lpv?: number; addCart?: number; checkout?: number;
  // Última EDIÇÃO do objeto na Meta (updated_time), em epoch ms. Reflete qualquer
  // alteração — orçamento, status, segmentação. Não há timestamp só de orçamento.
  updatedTime?: number;
}
export function parseMetrics(row: Record<string, unknown>): AdMetrics {
  const num = (k: string) => parseFloat((row[k] as string) || "0") || 0;
  const acts = row.actions as ActionArr;
  const spend = num("spend");
  const impressions = num("impressions");
  const reach = num("reach");
  const clicks = num("clicks");
  const purchases = pickAction(acts, PURCH);
  const revenue = pickAction(row.action_values as ActionArr, PURCH);
  const leads = pickAction(acts, LEADS);
  const roasArr = row.purchase_roas as Array<{ value: string }> | undefined;
  const roas = roasArr && roasArr[0] ? parseFloat(roasArr[0].value) || null : (spend > 0 ? revenue / spend : null);
  return {
    spend, impressions, reach, frequency: num("frequency"),
    clicks, ctr: num("ctr"), cpc: num("cpc"), cpm: num("cpm"),
    purchases, revenue, roas: roas != null ? Math.round(roas * 100) / 100 : null, leads,
    cpa: purchases > 0 ? spend / purchases : null,
    cpl: leads > 0 ? spend / leads : null,
    lpv: pickAction(acts, LPV), addCart: pickAction(acts, ADDCART), checkout: pickAction(acts, CHECKOUT),
  };
}
const zero: AdMetrics = { spend: 0, impressions: 0, reach: 0, frequency: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, purchases: 0, revenue: 0, roas: null, leads: 0, cpa: null, cpl: null };

// Mini-série diária por campanha (sparkline na tabela de campanhas).
export interface SparkPonto { d: string; spend: number; revenue: number }
export interface CampaignRow extends AdMetrics { id: string; name: string; accountId: string; account: string; status: string | null; objetivo: string | null; categoria: string | null; tags: string[]; spark?: SparkPonto[] }
export interface AdRow extends AdMetrics {
  id: string; name: string; account: string; campaign: string;
  status: string | null; thumb: string | null; videoId: string | null;
  permalink: string | null; tipo: "video" | "imagem";
  criadoEm: string | null;    // created_time do anúncio (ISO) — define a SAFRA no agrupamento
  categoria: string | null;   // carimbo | chancela | … (classificação da conta)
  tags: string[];             // {MKT} {SM-xxxx} extraídas do nome da campanha
}
// Conjunto (ad set) — nível entre campanha e anúncio.
export interface AdSetRow extends AdMetrics { id: string; name: string; account: string; campaign: string }
export interface Recomendacao {
  tipo: "escalar" | "pausar" | "criativo" | "ok" | "alerta" | "realocar";
  nivel: "campanha" | "anuncio" | "conta";
  ref: string; titulo: string; detalhe: string; severidade: "alta" | "media" | "boa";
  impacto?: string;   // impacto estimado em R$ (ex.: "+R$ 1.200/mês est.")
}
// Agregado por tag/categoria: soma das campanhas que têm aquela tag/categoria.
export interface TagAgg { chave: string; spend: number; revenue: number; roas: number | null; purchases: number; ctr: number; campanhas: number }

// Um ponto do gráfico diário (série temporal do período).
// Um dia da série. Os campos opcionais existem porque a série tem DUAS
// origens com coberturas diferentes: o Graph devolve o `AdMetrics` inteiro, o
// armazém local guarda só seis colunas. Opcional é a resposta honesta pra
// "este dia veio de uma fonte que não tem esse número" — quem consome trata
// ausente como `null` e não desenha linha, em vez de desenhar um zero que
// afirma que não houve clique nenhum.
//
// Nenhum deles custa chamada nova: o `parseMetrics` já os extrai da MESMA
// resposta de insights que a série sempre pediu. Só passavam a vida sendo
// jogados fora no `.map` logo abaixo — e era por isso que metade dos KPIs do
// painel não tinha como desenhar a própria curva.
export interface SeriePonto {
  day: string; spend: number; revenue: number; purchases: number;
  roas: number | null; ctr: number; cpm: number; impressions: number;
  clicks?: number; reach?: number; cpc?: number; leads?: number;
  lpv?: number; addCart?: number; checkout?: number;
}

/** AdMetrics de um dia → ponto da série. Uma conversão só, três chamadores. */
export function pontoDaSerie(day: string, m: AdMetrics): SeriePonto {
  return {
    day, spend: m.spend, revenue: m.revenue, purchases: m.purchases,
    roas: m.roas, ctr: m.ctr, cpm: m.cpm, impressions: m.impressions,
    clicks: m.clicks, reach: m.reach, cpc: m.cpc, leads: m.leads,
    lpv: m.lpv, addCart: m.addCart, checkout: m.checkout,
  };
}

// Saúde da conta (0–100) com os fatores que puxam pra cima/baixo.
export interface SaudeConta {
  score: number; nivel: "excelente" | "boa" | "atencao" | "critica";
  fatores: { label: string; ok: boolean; detalhe: string }[];
  tendenciaRoas: number | null;   // variação % do ROAS (2ª metade vs 1ª metade do período)
  tendenciaCtr: number | null;    // idem CTR (queda = possível fadiga de criativo)
}

export interface AdsOverview {
  cacheSchemaVersion?: number;
  updatedAt: string;
  periodLabel: string;
  since: string;
  until: string;
  contasAtivas: number;
  contasComGasto?: string[];
  kpis: AdMetrics & { prevSpend: number | null };
  kpisPrev?: AdMetrics;      // período anterior (mesma duração) — p/ deltas
  serie?: SeriePonto[];      // série diária (gráfico de tendência)
  seriePrev?: SeriePonto[];  // série diária do período ANTERIOR (comparação no gráfico)
  saude?: SaudeConta;        // health score da conta
  campanhas: CampaignRow[];
  conjuntos: AdSetRow[];     // ad sets (nível conjunto)
  anuncios: AdRow[];
  recomendacoes: Recomendacao[];
  tagsAgg: TagAgg[];         // por tag {MKT}/{SM-xxxx}
  categoriasAgg: TagAgg[];   // por categoria da conta (carimbo/chancela)
  funil: Funil;              // funil completo agregado (impressões → compra)
  funisPorTag: FunilTag[];       // um funil por tag (funil personalizado)
  funisPorCategoria: FunilTag[]; // um funil por categoria (carimbo, chancela…)
}

// Período anterior de mesma duração, terminando 1 dia antes de `since`.
function periodoAnterior(since: string, until: string): { since: string; until: string } {
  const s = new Date(since + "T00:00:00Z"), u = new Date(until + "T00:00:00Z");
  const dias = Math.round((u.getTime() - s.getTime()) / 86400000) + 1;
  const pu = new Date(s.getTime() - 86400000);
  const ps = new Date(pu.getTime() - (dias - 1) * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { since: iso(ps), until: iso(pu) };
}

export const INSIGHT_FIELDS = "spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas";

// Campos de retenção usados pelo warehouse diário. Mantidos fora de
// INSIGHT_FIELDS porque o overview consulta conta/campanha/conjunto ao vivo e
// não precisa pagar esse payload; Creative Intelligence lê tudo do banco.
// A lista acompanha os nomes publicados no SDK oficial da Meta.
export const VIDEO_INSIGHT_FIELDS = [
  "video_play_actions",
  "video_continuous_2_sec_watched_actions",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p95_watched_actions",
  "video_p100_watched_actions",
  "video_avg_time_watched_actions",
  "video_thruplay_watched_actions",
].join(",");

// Soma métricas ADITIVAS (gasto, impressões, cliques, compras, receita, leads).
// ATENÇÃO ao `reach`: é DEDUPLICADO por pessoa — somar o alcance de vários dias
// conta a mesma pessoa N vezes e infla o número. Aqui usamos o MAIOR alcance
// visto (piso realista do alcance único) em vez da soma; o alcance exato do
// período exigiria uma consulta separada com time_increment=all_days.
function agg(base: AdMetrics, m: AdMetrics): AdMetrics {
  const spend = base.spend + m.spend, impressions = base.impressions + m.impressions;
  const clicks = base.clicks + m.clicks, revenue = base.revenue + m.revenue, purchases = base.purchases + m.purchases;
  const reach = Math.max(base.reach, m.reach), leads = base.leads + m.leads;
  return {
    spend, impressions, reach, frequency: reach > 0 ? impressions / reach : 0,
    clicks, ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0, cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    purchases, revenue, roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : null, leads,
    cpa: purchases > 0 ? spend / purchases : null, cpl: leads > 0 ? spend / leads : null,
  };
}

// ── Cache do panorama (stale-while-revalidate) ──────────────────────────────
// O Ads acumula devagar e o cálculo é caro (dezenas de chamadas ao Graph). Então
// guardamos o resultado e servimos na hora; atualiza a cada 1h (ou quando não há
// nada em cache). Duas camadas: L1 em memória (rápida, por instância) e L2
// persistente no Supabase (sobrevive a cold start — "deixa carregado"). Se a
// tabela trafego_cache não existir, cai no cálculo direto sem quebrar.
const FRESH_MS = 60 * 60 * 1000; // 1 hora
const CACHE_SCHEMA_VERSION = 2;
const mem = new Map<string, { at: number; data: AdsOverview }>();
const inflight = new Map<string, Promise<AdsOverview | null>>();

async function lerPersistente(key: string): Promise<{ at: number; data: AdsOverview } | null> {
  try {
    const db = createSupabaseAdminClient();
    const { data, error } = await db.from("trafego_cache").select("data,updated_at").eq("chave", key).maybeSingle();
    if (error || !data) return null;
    const overview = data.data as AdsOverview;
    if (overview.cacheSchemaVersion !== CACHE_SCHEMA_VERSION) return null;
    return { at: new Date(data.updated_at as string).getTime(), data: overview };
  } catch { return null; }
}
async function salvarPersistente(key: string, data: AdsOverview): Promise<void> {
  try {
    const db = createSupabaseAdminClient();
    await db.from("trafego_cache").upsert({ chave: key, data, updated_at: new Date().toISOString() }, { onConflict: "chave" });
  } catch { /* tabela ausente → ignora */ }
}

// Recalcula (deduplicando chamadas simultâneas) e atualiza L1 + L2.
function revalidar(key: string, since: string, until: string, periodLabel: string, accounts?: string[] | null, force = false): Promise<AdsOverview | null> {
  // Dedup separado por `force`: "Atualizar agora" (force=Graph fresco) NÃO pode
  // pegar carona numa compute non-force (warehouse) em andamento e devolver banco.
  const ik = force ? `${key}|force` : key;
  let f = inflight.get(ik);
  if (!f) {
    f = computeAdsOverview(key, since, until, periodLabel, accounts, force).finally(() => inflight.delete(ik));
    inflight.set(ik, f);
  }
  return f;
}

// Ponto de entrada: serve do cache na hora e atualiza em segundo plano se velho.
// `force` recalcula agora INTEIRO contra o Graph (~200 chamadas): é o cron de
//   aquecimento, que roda de madrugada e tem a função só pra ele.
// `recalcular` recalcula agora a partir do WAREHOUSE (campanhas, conjuntos e
//   anúncios do banco local; só o insight leve de conta e os criativos vão ao
//   Graph), ignorando o cache de 1h. É o "Atualizar" da tela — que era `force`,
//   levava 20–40 s e passava dos 60 s da função em período longo: o fetch
//   morria e, como já havia dado na tela, ninguém via erro nenhum.
// `semBloquear` NUNCA chama a Meta: sem cache devolve null e quem chamou decide
// (a TELA usa isso — dashboard lê o banco local, nunca espera a API da Meta).
export async function buildAdsOverview(since: string, until: string, periodLabel: string, opts?: { force?: boolean; recalcular?: boolean; accounts?: string[]; semBloquear?: boolean }): Promise<AdsOverview | null> {
  // Filtro por conta (§1): sufixo no cache key SÓ quando filtra — assim o cache de
  // "todas as contas" (key sem sufixo) continua igual e válido.
  const accs = opts?.accounts?.length ? [...new Set(opts.accounts.map((a) => a.replace(/^act_/, "")))].sort() : null;
  // "v2": descarta o panorama guardado antes de a árvore conferir com a Meta
  // (anúncios com 1/3 das compras). Sem trocar a chave, ele seguia servido.
  const key = `v2|${since}|${until}${accs ? `|acc:${accs.join(",")}` : ""}`;
  const now = Date.now();
  if (opts?.force) return revalidar(key, since, until, periodLabel, accs, true);
  if (opts?.recalcular) return revalidar(key, since, until, periodLabel, accs, false);

  // L1 — fresco em memória.
  const h = mem.get(key);
  if (h && now - h.at < FRESH_MS) return h.data;

  // L2 — persistente. Aquece L1; se velho, serve mesmo assim e revalida ao fundo.
  const p = await lerPersistente(key);
  if (p) {
    mem.set(key, p);
    if (now - p.at >= FRESH_MS) void revalidar(key, since, until, periodLabel, accs);
    return p.data;
  }

  // Nada em cache. A TELA (semBloquear) não espera a Meta: devolve null e o
  // cliente mostra "sincronizando" e dispara o sync. Só o cron/sync calcula aqui.
  if (opts?.semBloquear) return null;
  return revalidar(key, since, until, periodLabel, accs);
}

// Faz o trabalho pesado: puxa tudo do Graph e monta o panorama.
async function computeAdsOverview(key: string, since: string, until: string, periodLabel: string, accounts?: string[] | null, force = false): Promise<AdsOverview | null> {
  const [contasTodas, mktCfg] = await Promise.all([listAccounts(), getMarketingConfig()]);
  // Filtro §1: só as contas pedidas (normaliza act_). Vazio/null = todas.
  const contas = accounts && accounts.length
    ? contasTodas.filter((a) => accounts.includes(String(a.account_id).replace(/^act_/, "")))
    : contasTodas;
  if (!contas.length) return null;
  const cfgContas = mktCfg.contas as Record<string, string>;
  const tr = encodeURIComponent(JSON.stringify({ since, until }));
  const accById = new Map(contas.map((a) => [String(a.account_id), a]));

  // ── Campanhas/conjuntos/anúncios: PRIMEIRO do banco (warehouse local) ────────
  // "Atualizar agora" (force) pula o banco e vai fresco no Graph; senão lê a
  // árvore local (grão diário já sincronizado) e o Graph vira só fallback quando
  // o período ainda não foi pro banco. Um só query destrava campanha+conjunto+
  // anúncio; os criativos (thumb/vídeo/status) seguem vindo do Graph (não moram
  // no warehouse). É o "primeiro do banco, e só pega do Facebook o que faltar".
  const idsFiltro = accounts?.length ? accounts.map((a) => a.replace(/^act_/, "")) : undefined;
  let arvore: ArvoreLocal | null = force ? null : await arvoreLocal(since, until, idsFiltro);
  // Métricas (AdMetrics) a partir de uma linha agregada do warehouse.
  // reach/frequency ficam 0 de propósito: o grão é diário e reach é DEDUPLICADO
  // pela Meta — não dá pra derivar o alcance/frequência do período somando ou
  // tirando o MÁX das linhas (inflava a frequência e disparava "fadiga" falsa).
  // Esses dois só têm valor real pelo Graph ("Atualizar agora"). frequency=0
  // mantém os gatilhos de fadiga (>=3) quietos no caminho local, como deve ser.
  const metricsDeLocal = (a: { spend: number; impressions: number; clicks: number; purchases: number; revenue: number; leads: number; lpv?: number; addCart?: number; checkout?: number }): AdMetrics => ({
    spend: a.spend, impressions: a.impressions, reach: 0, frequency: 0,
    clicks: a.clicks, ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0,
    cpc: a.clicks > 0 ? a.spend / a.clicks : 0, cpm: a.impressions > 0 ? (a.spend / a.impressions) * 1000 : 0,
    purchases: a.purchases, revenue: a.revenue, roas: a.spend > 0 ? Math.round((a.revenue / a.spend) * 100) / 100 : null,
    leads: a.leads, cpa: a.purchases > 0 ? a.spend / a.purchases : null, cpl: a.leads > 0 ? a.spend / a.leads : null,
    lpv: a.lpv, addCart: a.addCart, checkout: a.checkout,
  });

  // 1) Insight da conta (leve) — descobre quais têm gasto no período.
  const contasInsight = await Promise.all(contas.map(async (a) => {
    const d = await gjAll(`${GRAPH}/act_${a.account_id}/insights?level=account&fields=${INSIGHT_FIELDS}&time_range=${tr}&access_token=${a.token}`);
    const row = ((d.data as Array<Record<string, unknown>>) || [])[0];
    return { acct: a, m: row ? parseMetrics(row) : zero, row };
  }));
  const comGasto = contasInsight.filter((c) => c.m.spend > 0).sort((x, y) => y.m.spend - x.m.spend);

  // O armazém só vale se BATE com o insight ao vivo da conta. Ele tem buraco
  // (dia que o sync não trouxe, "hoje" ainda não gravado) e servia mesmo assim:
  // "7 dias" mostrava investido/compras/ROAS de cada anúncio com dias faltando.
  // Não bateu em alguma conta → a árvore inteira vem do Graph.
  if (arvore && !arvoreBateComContas(arvore, contasInsight.map((c) => ({ accountId: String(c.acct.account_id), spend: c.m.spend, purchases: c.m.purchases })))) {
    console.warn(`[meta-ads] armazém não bate com o insight da conta (${since}..${until}); árvore vem do Graph.`);
    arvore = null;
  }

  // KPIs agregados de todas as contas.
  let kpis = { ...zero };
  for (const c of contasInsight) kpis = agg(kpis, c.m);

  // Funil completo agregado (impressões → alcance → cliques → LPV → carrinho → checkout → compra).
  const funil = funilDeRows(contasInsight.map((c) => c.row).filter((r): r is Record<string, unknown> => !!r));

  const pa = periodoAnterior(since, until);
  const trPrev = encodeURIComponent(JSON.stringify({ since: pa.since, until: pa.until }));
  // PARALELO: os estágios abaixo (kpisPrev, séries, campanhas, anúncios,
  // conjuntos) só dependem de contas/comGasto — rodavam em SÉRIE e a soma
  // das esperas dava dezenas de segundos. Cada um vira uma promise; o
  // Promise.all no fim espera tudo de uma vez (custo = o estágio mais lento).
  const pPrev = (async () => {
  // ── Período ANTERIOR (mesma duração) — pra mostrar deltas (▲/▼ vs antes) ────
  // Vem do WAREHOUSE local, não do Graph: eram N chamadas (uma por conta, até
  // ×25 páginas) só pra montar comparativo — metade do custo do rebuild. O dado
  // anterior é estável e o sync diário já o gravou. Deltas não usam
  // reach/frequency, então esses ficam 0 sem prejuízo. Se o warehouse ainda não
  // tem o período (carga inicial pendente), cai no Graph como antes.
    let kpisPrev = { ...zero };
  try {
    const idsFiltro = accounts?.length ? accounts.map((a) => a.replace(/^act_/, "")) : undefined;
    const t = await totaisDoPeriodo(pa.since, pa.until, idsFiltro);
    if (t && t.linhas > 0) {
      kpisPrev = {
        ...zero,
        spend: t.spend, impressions: t.impressions, clicks: t.clicks,
        purchases: t.purchasesMeta, revenue: t.purchaseValueMeta, leads: t.leadsMeta,
        ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
        cpc: t.clicks > 0 ? t.spend / t.clicks : 0,
        cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0,
        roas: t.spend > 0 ? t.purchaseValueMeta / t.spend : null,
        cpa: t.purchasesMeta > 0 ? t.spend / t.purchasesMeta : null,
        cpl: t.leadsMeta > 0 ? t.spend / t.leadsMeta : null,
      };
    } else {
      const prevRows = await Promise.all(contas.map(async (a) => {
        const d = await gjAll(`${GRAPH}/act_${a.account_id}/insights?level=account&fields=${INSIGHT_FIELDS}&time_range=${trPrev}&access_token=${a.token}`);
        const row = ((d.data as Array<Record<string, unknown>>) || [])[0];
        return row ? parseMetrics(row) : zero;
      }));
      for (const m of prevRows) kpisPrev = agg(kpisPrev, m);
    }
  } catch { /* sem período anterior → segue sem deltas */ }
    return kpisPrev;
  })();

  const pSerie = (async () => {
  // ── Série DIÁRIA (gráfico de tendência) — só das contas com gasto ───────────
  const serieMap = new Map<string, AdMetrics>();
  try {
    await Promise.all(comGasto.map(async ({ acct }) => {
      const d = await gjAll(`${GRAPH}/act_${acct.account_id}/insights?level=account&fields=${INSIGHT_FIELDS}&time_range=${tr}&time_increment=1&limit=400&access_token=${acct.token}`);
      for (const row of (d.data as Array<Record<string, unknown>>) || []) {
        const day = (row.date_start as string) || "";
        if (!day) continue;
        const m = parseMetrics(row);
        serieMap.set(day, serieMap.has(day) ? agg(serieMap.get(day)!, m) : m);
      }
    }));
  } catch { /* sem série → gráfico some, resto funciona */ }
  const serie: SeriePonto[] = [...serieMap.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([day, m]) => pontoDaSerie(day, m));
    return serie;
  })();

  const pSeriePrev = (async () => {
  // ── Série DIÁRIA do período ANTERIOR — do WAREHOUSE (era 1 chamada por conta
  // com gasto, ×25 páginas). O período anterior é estável; o sync já o gravou.
  // Warehouse vazio (carga inicial pendente) → cai no Graph como antes.
  let seriePrev: SeriePonto[] = [];
  try {
    const local = await serieDiariaLocal(pa.since, pa.until, accounts?.length ? accounts.map((a) => a.replace(/^act_/, "")) : undefined);
    if (local?.length) {
      // O armazém guarda seis colunas; o resto fica AUSENTE de propósito (ver
      // SeriePonto) em vez de virar zero.
      seriePrev = local.map((p) => ({
        day: p.day, spend: p.spend, revenue: p.revenue, purchases: p.purchases,
        roas: p.spend > 0 ? p.revenue / p.spend : null,
        ctr: p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0,
        cpm: p.impressions > 0 ? (p.spend / p.impressions) * 1000 : 0,
        impressions: p.impressions, clicks: p.clicks,
        cpc: p.clicks > 0 ? p.spend / p.clicks : undefined,
      }));
    } else {
      const seriePrevMap = new Map<string, AdMetrics>();
      await Promise.all(comGasto.map(async ({ acct }) => {
        const d = await gjAll(`${GRAPH}/act_${acct.account_id}/insights?level=account&fields=${INSIGHT_FIELDS}&time_range=${trPrev}&time_increment=1&limit=400&access_token=${acct.token}`);
        for (const row of (d.data as Array<Record<string, unknown>>) || []) {
          const day = (row.date_start as string) || "";
          if (!day) continue;
          const m = parseMetrics(row);
          seriePrevMap.set(day, seriePrevMap.has(day) ? agg(seriePrevMap.get(day)!, m) : m);
        }
      }));
      seriePrev = [...seriePrevMap.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([day, m]) => pontoDaSerie(day, m));
    }
  } catch { /* sem série anterior → gráfico só mostra o período atual */ }
    return seriePrev;
  })();

  const pCampanhas = (async () => {
  // ── Caminho LOCAL (banco): campanhas + spark + funis vêm da árvore do warehouse.
  // Zero chamada ao Graph pra montar a tabela de campanhas. status/objetivo já
  // eram null aqui (o status vem do /api/trafego/campanha/status na tela), então
  // nada se perde. reach/frequency saem aproximados (MÁX diário do grão local).
  if (arvore) {
    // Sem cortar em 40 aqui: o assembly final já faz .slice(0,40) pra exibir, e
    // tagsAgg/funis precisam do MESMO conjunto (todas as campanhas) pra bater.
    const campanhas: CampaignRow[] = arvore.campanhas.map((c) => {
      const acct = accById.get(c.accountId);
      const cr: CampaignRow = {
        ...metricsDeLocal(c), id: c.id, name: c.name,
        accountId: c.accountId, account: acct?.name || `Conta ${c.accountId}`,
        status: null, objetivo: null, categoria: categoriaDaConta(c.accountId, acct?.name || "", cfgContas), tags: tagsDoNome(c.name),
      };
      if (c.spark.length > 1) cr.spark = c.spark.map((s) => ({ d: s.d, spend: s.spend, revenue: s.revenue }));
      return cr;
    });
    // Funis por tag/categoria: soma os campos de funil por campanha (local).
    const funisLocais = (chaveDe: (c: CampanhaLocal, categoria: string | null) => string[]): FunilTag[] => {
      const groups = new Map<string, Funil>();
      for (const c of arvore.campanhas) {
        const categoria = categoriaDaConta(c.accountId, accById.get(c.accountId)?.name || "", cfgContas);
        for (const k of chaveDe(c, categoria)) {
          const f = groups.get(k) || { spend: 0, revenue: 0, impressions: 0, reach: 0, cliques: 0, lpv: 0, addCart: 0, checkout: 0, purchases: 0, leads: 0 };
          // reach fica 0 (deduplicado, não somável do grão diário — igual aos KPIs locais).
          f.spend += c.spend; f.revenue += c.revenue; f.impressions += c.impressions;
          f.cliques += c.clicks; f.lpv += c.lpv; f.addCart += c.addCart; f.checkout += c.checkout; f.purchases += c.purchases; f.leads += c.leads;
          groups.set(k, f);
        }
      }
      return [...groups.entries()].map(([chave, funil]) => ({ chave, funil })).filter((x) => x.funil.spend > 0).sort((a, b) => b.funil.spend - a.funil.spend);
    };
    return {
      campanhas,
      campanhaRows: [] as Array<{ row: Record<string, unknown>; tags: string[]; categoria: string | null }>,
      funisPorTag: funisLocais((c) => tagsDoNome(c.name)),
      funisPorCategoria: funisLocais((_c, categoria) => (categoria ? [categoria] : [])),
    };
  }

  // ── Caminho GRAPH (fallback): warehouse ainda sem o período OU "Atualizar agora". ──
  // 2) Campanhas — das contas com gasto (cap 8 contas p/ não estourar rate-limit).
  // Guarda também a LINHA crua (com actions) + tags/categoria p/ montar funis por tag.
  const campanhas: CampaignRow[] = [];
  const campanhaRows: Array<{ row: Record<string, unknown>; tags: string[]; categoria: string | null }> = [];
  await Promise.all(comGasto.slice(0, 8).map(async ({ acct }) => {
    const d = await gjAll(`${GRAPH}/act_${acct.account_id}/insights?level=campaign&fields=campaign_id,campaign_name,${INSIGHT_FIELDS}&time_range=${tr}&limit=200&access_token=${acct.token}`);
    if (d.error) return;
    const categoria = categoriaDaConta(acct.account_id, acct.name, cfgContas);
    const locais: CampaignRow[] = [];
    for (const row of (d.data as Array<Record<string, unknown>>) || []) {
      const m = parseMetrics(row);
      if (m.spend <= 0) continue;
      const nome = (row.campaign_name as string) || "Campanha";
      const tags = tagsDoNome(nome);
      const cr: CampaignRow = { ...m, id: (row.campaign_id as string) || "", name: nome, accountId: acct.account_id, account: acct.name || `Conta ${acct.account_id}`, status: null, objetivo: null, categoria, tags };
      campanhas.push(cr); locais.push(cr);
      campanhaRows.push({ row, tags, categoria });
    }
    // Última edição de cada campanha (updated_time).
    const tempos = await buscarUpdatedTimes(locais.map((x) => x.id), acct.token);
    for (const cr of locais) { const t = tempos.get(cr.id); if (t) cr.updatedTime = t; }
  }));
  campanhas.sort((a, b) => b.spend - a.spend);

  // ── Mini-série diária por campanha (sparkline na tabela) — 1 chamada extra por
  // conta (level=campaign + time_increment=1). Best-effort: se falhar, a tabela
  // funciona sem o mini-gráfico. Só as campanhas que já entraram (com gasto).
  try {
    const idsComGasto = new Set(campanhas.map((c) => c.id));
    const sparkMap = new Map<string, Map<string, { spend: number; revenue: number }>>();
    await Promise.all(comGasto.slice(0, 8).map(async ({ acct }) => {
      const d = await gjAll(`${GRAPH}/act_${acct.account_id}/insights?level=campaign&fields=campaign_id,spend,action_values&time_range=${tr}&time_increment=1&limit=600&access_token=${acct.token}`);
      if (d.error) return;
      for (const row of (d.data as Array<Record<string, unknown>>) || []) {
        const id = (row.campaign_id as string) || "";
        const day = (row.date_start as string) || "";
        if (!id || !day || !idsComGasto.has(id)) continue;
        const spend = parseFloat((row.spend as string) || "0") || 0;
        const revenue = pickAction(row.action_values as ActionArr, PURCH);
        const per = sparkMap.get(id) || new Map<string, { spend: number; revenue: number }>();
        const prev = per.get(day) || { spend: 0, revenue: 0 };
        per.set(day, { spend: prev.spend + spend, revenue: prev.revenue + revenue });
        sparkMap.set(id, per);
      }
    }));
    for (const c of campanhas) {
      const per = sparkMap.get(c.id);
      if (per && per.size > 1) c.spark = [...per.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ d, spend: v.spend, revenue: v.revenue }));
    }
  } catch { /* sem sparkline → tabela de campanhas segue normal */ }

  // Funis personalizados: um funil completo por tag e por categoria (agrupa as
  // linhas de campanha com aquela chave e roda o mesmo funilDeRows).
  const funisPor = (chaves: (i: { tags: string[]; categoria: string | null }) => string[]): FunilTag[] => {
    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const item of campanhaRows) for (const k of chaves(item)) {
      const arr = groups.get(k) || []; arr.push(item.row); groups.set(k, arr);
    }
    return [...groups.entries()]
      .map(([chave, rows]) => ({ chave, funil: funilDeRows(rows) }))
      .filter((x) => x.funil.spend > 0)
      .sort((a, b) => b.funil.spend - a.funil.spend);
  };
  const funisPorTag = funisPor((i) => i.tags);
  const funisPorCategoria = funisPor((i) => (i.categoria ? [i.categoria] : []));
    return { campanhas, campanhaRows, funisPorTag, funisPorCategoria };
  })();

  // updated_time (última edição) de vários objetos por lote (?ids=). id → epoch ms.
  const buscarUpdatedTimes = async (ids: string[], token: string): Promise<Map<string, number>> => {
    const out = new Map<string, number>();
    const limpos = ids.filter(Boolean);
    for (let i = 0; i < limpos.length; i += 50) {
      const lote = limpos.slice(i, i + 50);
      const d = await gj(`${GRAPH}/?ids=${encodeURIComponent(lote.join(","))}&fields=updated_time&access_token=${token}`);
      if (!d || d.error) continue;
      for (const id of lote) {
        const o = (d as Record<string, unknown>)[id] as Record<string, unknown> | undefined;
        const t = o?.updated_time ? new Date(o.updated_time as string).getTime() : NaN;
        if (Number.isFinite(t)) out.set(id, t);
      }
    }
    return out;
  };

  const pAds = (async () => {
  // 3) Todos os anúncios com entrega — a interface decide a ordenação.
  const adsRaw: Array<AdRow & { _acct: AcctRef }> = [];
  if (arvore) {
    // LOCAL: métricas completas da árvore; só os destaques de cada ordenação
    // buscam a mídia no Graph para manter o custo controlado.
    for (const a of arvore.anuncios) {
      const acct = accById.get(a.accountId); if (!acct) continue;
      adsRaw.push({ ...metricsDeLocal(a), _acct: acct, id: a.id, name: a.name, account: acct.name || "", campaign: a.campaign, status: null, thumb: null, videoId: null, permalink: null, criadoEm: null, tipo: "imagem", categoria: categoriaDaConta(a.accountId, acct.name || "", cfgContas), tags: tagsDoNome(a.campaign) });
    }
  } else {
    await Promise.all(comGasto.map(async ({ acct }) => {
      const d = await gjAll(`${GRAPH}/act_${acct.account_id}/insights?level=ad&fields=ad_id,ad_name,campaign_name,${INSIGHT_FIELDS}&time_range=${tr}&limit=300&access_token=${acct.token}`);
      if (d.error) return;
      const categoria = categoriaDaConta(acct.account_id, acct.name, cfgContas);
      for (const row of (d.data as Array<Record<string, unknown>>) || []) {
        const m = parseMetrics(row);
        if (m.spend <= 0) continue;
        const campanha = (row.campaign_name as string) || "";
        adsRaw.push({ ...m, _acct: acct, id: (row.ad_id as string) || "", name: (row.ad_name as string) || "Anúncio", account: acct.name || "", campaign: campanha, status: null, thumb: null, videoId: null, permalink: null, criadoEm: null, tipo: "imagem", categoria, tags: tagsDoNome(campanha) });
      }
    }));
  }
  adsRaw.sort((a, b) => b.spend - a.spend);

  const valorRoas = (ad: AdRow) => ad.spend > 0 ? ad.revenue / ad.spend : -1;
  const valorCtr = (ad: AdRow) => ad.impressions > 0 ? ad.clicks / ad.impressions : -1;
  const destaques = new Set<string>();
  const incluir = (comparar: (a: AdRow, b: AdRow) => number) => {
    for (const ad of [...adsRaw].sort(comparar).slice(0, LIM_VISUAIS_POR_ORDEM)) destaques.add(ad.id);
  };
  incluir((a, b) => b.spend - a.spend);
  incluir((a, b) => b.purchases - a.purchases || b.spend - a.spend);
  incluir((a, b) => valorRoas(b) - valorRoas(a) || b.spend - a.spend);
  incluir((a, b) => valorCtr(b) - valorCtr(a) || b.spend - a.spend);
  const comVisual = adsRaw.filter((ad) => destaques.has(ad.id));

  // Criativos dos top anúncios (thumbnail/vídeo/link).
  // O comentário aqui dizia "Batch por conta", mas o código fazia
  // top.map(ad => gj(...)): UMA requisição HTTP por anúncio (24 no total).
  // Agora é batch de verdade — o Graph aceita ?ids=a,b,c e devolve um mapa.
  // Agrupa por CONTA porque o token é por conta: mandar id de outra conta no
  // mesmo lote faz a Meta recusar o lote inteiro.
  // created_time: a SAFRA do anúncio. É o que impede o agrupamento por nome de
  // fundir criativos de anos diferentes (a equipe reusa os mesmos nomes a cada ano).
  const CRIATIVO_FIELDS = "effective_status,updated_time,created_time,creative{thumbnail_url,image_url,video_id,effective_object_story_id,instagram_permalink_url}";
  const LOTE_IDS = 50;   // teto prático do ?ids= da Graph

  const porToken = new Map<string, { token: string; ads: typeof comVisual }>();
  for (const ad of comVisual) {
    if (!ad.id) continue;
    const k = String(ad._acct.account_id);
    const e = porToken.get(k) || { token: ad._acct.token, ads: [] as typeof comVisual };
    e.ads.push(ad);
    porToken.set(k, e);
  }

  const aplicar = (ad: (typeof comVisual)[number], d: Record<string, unknown> | undefined) => {
    if (!d || d.error) return;
    ad.status = (d.effective_status as string) || null;
    if (d.updated_time) { const t = new Date(d.updated_time as string).getTime(); if (Number.isFinite(t)) ad.updatedTime = t; }
    if (d.created_time) ad.criadoEm = String(d.created_time);
    const cr = d.creative as Record<string, unknown> | undefined;
    if (!cr) return;
    ad.thumb = (cr.thumbnail_url as string) || (cr.image_url as string) || null;
    ad.videoId = (cr.video_id as string) || null;
    ad.tipo = cr.video_id ? "video" : "imagem";
    ad.permalink = (cr.instagram_permalink_url as string) || (cr.effective_object_story_id ? `https://www.facebook.com/${cr.effective_object_story_id}` : null);
  };

  await Promise.all([...porToken.values()].flatMap(({ token, ads }) => {
    const lotes: Array<typeof ads> = [];
    for (let i = 0; i < ads.length; i += LOTE_IDS) lotes.push(ads.slice(i, i + LOTE_IDS));
    return lotes.map(async (lote) => {
      const ids = lote.map((a) => a.id).join(",");
      const d = await gj(`${GRAPH}/?ids=${encodeURIComponent(ids)}&fields=${CRIATIVO_FIELDS}&access_token=${token}`);
      // Lote inteiro falhou (token expirado, id inválido): degrada pra 1-a-1 em
      // vez de deixar TODOS os anúncios sem criativo por causa de um id ruim.
      if (d.error) {
        await Promise.all(lote.map(async (ad) => {
          const u = await gj(`${GRAPH}/${ad.id}?fields=${CRIATIVO_FIELDS}&access_token=${token}`);
          aplicar(ad, u);
        }));
        return;
      }
      for (const ad of lote) aplicar(ad, d[ad.id] as Record<string, unknown> | undefined);
    });
  }));
  const anuncios: AdRow[] = adsRaw.map(({ _acct, ...rest }) => { void _acct; return rest; });
    return anuncios;
  })();

  const pAdsets = (async () => {
  // LOCAL: conjuntos direto da árvore do warehouse (sem Graph).
  if (arvore) {
    return arvore.conjuntos.slice(0, LIM_CONJUNTOS).map((s): AdSetRow => {
      const acct = accById.get(s.accountId);
      return { ...metricsDeLocal(s), id: s.id, name: s.name, account: acct?.name || "", campaign: s.campaign };
    });
  }
  // 3b) Conjuntos (ad sets) — nível adset das top 8 contas; junta e ordena por gasto.
  const conjuntos: AdSetRow[] = [];
  await Promise.all(comGasto.slice(0, 8).map(async ({ acct }) => {
    const d = await gjAll(`${GRAPH}/act_${acct.account_id}/insights?level=adset&fields=adset_id,adset_name,campaign_name,${INSIGHT_FIELDS}&time_range=${tr}&limit=200&access_token=${acct.token}`);
    if (d.error) return;
    const locais: AdSetRow[] = [];
    for (const row of (d.data as Array<Record<string, unknown>>) || []) {
      const m = parseMetrics(row);
      if (m.spend <= 0) continue;
      const s: AdSetRow = { ...m, id: (row.adset_id as string) || "", name: (row.adset_name as string) || "Conjunto", account: acct.name || "", campaign: (row.campaign_name as string) || "" };
      conjuntos.push(s); locais.push(s);
    }
    const tempos = await buscarUpdatedTimes(locais.map((x) => x.id), acct.token);
    for (const s of locais) { const t = tempos.get(s.id); if (t) s.updatedTime = t; }
  }));
  conjuntos.sort((a, b) => b.spend - a.spend);

    return conjuntos;
  })();

  // Espera todos os estágios paralelos de uma vez.
  const [kpisPrev, serie, seriePrev, camp, anuncios, conjuntos] = await Promise.all([pPrev, pSerie, pSeriePrev, pCampanhas, pAds, pAdsets]);
  const { campanhas, campanhaRows, funisPorTag, funisPorCategoria } = camp;
  void campanhaRows;

  // Saúde da conta (score + tendências) a partir de tudo que foi coletado.
  const saude = calcSaude(kpis, campanhas, serie);
  // 4) Recomendações (motor de regras) — agora com deltas do período anterior.
  const recomendacoes = gerarRecomendacoes(campanhas, anuncios, kpis, kpisPrev, saude);

  // 5) Agregação por tag e por categoria (soma das campanhas com aquela chave).
  const aggPor = (chaves: (c: CampaignRow) => string[]): TagAgg[] => {
    const m = new Map<string, { spend: number; revenue: number; purchases: number; clicks: number; impressions: number; campanhas: number }>();
    for (const c of campanhas) for (const k of chaves(c)) {
      const e = m.get(k) || { spend: 0, revenue: 0, purchases: 0, clicks: 0, impressions: 0, campanhas: 0 };
      e.spend += c.spend; e.revenue += c.revenue; e.purchases += c.purchases; e.clicks += c.clicks; e.impressions += c.impressions; e.campanhas += 1;
      m.set(k, e);
    }
    return [...m.entries()].map(([chave, e]) => ({
      chave, spend: e.spend, revenue: e.revenue,
      roas: e.spend > 0 ? Math.round((e.revenue / e.spend) * 100) / 100 : null,
      purchases: e.purchases, ctr: e.impressions > 0 ? (e.clicks / e.impressions) * 100 : 0, campanhas: e.campanhas,
    })).sort((a, b) => b.spend - a.spend);
  };
  const tagsAgg = aggPor((c) => c.tags);
  const categoriasAgg = aggPor((c) => (c.categoria ? [c.categoria] : []));

  const data: AdsOverview = {
    cacheSchemaVersion: CACHE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    periodLabel,
    since, until,
    contasAtivas: comGasto.length,
    contasComGasto: comGasto.map(({ acct }) => String(acct.account_id).replace(/^act_/, "")),
    kpis: { ...kpis, prevSpend: kpisPrev.spend || null },
    kpisPrev,
    serie,
    seriePrev,
    saude,
    campanhas: campanhas.slice(0, LIM_CAMPANHAS),
    conjuntos: conjuntos.slice(0, LIM_CONJUNTOS),
    anuncios,
    recomendacoes,
    tagsAgg,
    categoriasAgg,
    funil,
    funisPorTag,
    funisPorCategoria,
  };
  mem.set(key, { at: Date.now(), data });
  void salvarPersistente(key, data);   // L2: "deixa carregado" p/ o próximo cold start
  return data;
}

// Meta de ROAS de referência (usada no health score e nos alertas).
const ROAS_META = 2;
const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const limparNomeCamp = (n: string) => (n || "").replace(/\{[^}]+\}/g, "").replace(/\s{2,}/g, " ").trim() || n;

// Variação % entre a 2ª metade e a 1ª metade da série (média por dia) — detecta
// tendência (ex.: CTR caindo = fadiga de criativo; ROAS caindo = piora).
function tendencia(serie: SeriePonto[], campo: "ctr" | "roas"): number | null {
  if (serie.length < 4) return null;
  const mid = Math.floor(serie.length / 2);
  const val = (p: SeriePonto) => campo === "ctr" ? p.ctr : (p.spend > 0 ? p.revenue / p.spend : 0);
  const med = (arr: SeriePonto[]) => { const xs = arr.map(val).filter((x) => x > 0); return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0; };
  const a = med(serie.slice(0, mid)), b = med(serie.slice(mid));
  if (a <= 0) return null;
  return ((b - a) / a) * 100;
}

// Health score da conta (0–100): ROAS vs meta, verba desperdiçada, fadiga e tendência.
function calcSaude(kpis: AdMetrics, campanhas: CampaignRow[], serie: SeriePonto[]): SaudeConta {
  const fatores: SaudeConta["fatores"] = [];
  let score = 100;

  const roas = kpis.roas ?? 0;
  fatores.push({ label: "ROAS vs meta", ok: roas >= ROAS_META, detalhe: `${roas.toFixed(2)}x (meta ${ROAS_META}x)` });
  if (roas < 1) score -= 40; else if (roas < ROAS_META) score -= 18;

  const gastoRuim = campanhas.filter((c) => c.roas != null && c.roas < 1).reduce((s, c) => s + c.spend, 0);
  const pctRuim = kpis.spend > 0 ? gastoRuim / kpis.spend : 0;
  fatores.push({ label: "Verba em campanhas no prejuízo", ok: pctRuim < 0.15, detalhe: `${Math.round(pctRuim * 100)}% do investimento` });
  score -= Math.min(25, Math.round(pctRuim * 60));

  const fadiga = campanhas.filter((c) => c.frequency >= 3 && c.spend >= 30).length;
  fatores.push({ label: "Fadiga de criativo", ok: fadiga === 0, detalhe: fadiga ? `${fadiga} campanha(s) com frequência ≥3` : "sem sinais" });
  score -= Math.min(18, fadiga * 6);

  const tendenciaRoas = tendencia(serie, "roas");
  const tendenciaCtr = tendencia(serie, "ctr");
  if (tendenciaRoas != null) {
    fatores.push({ label: "Tendência do ROAS", ok: tendenciaRoas >= -5, detalhe: `${tendenciaRoas > 0 ? "+" : ""}${tendenciaRoas.toFixed(0)}% na 2ª metade` });
    if (tendenciaRoas < -10) score -= 12;
  }
  if (tendenciaCtr != null && tendenciaCtr < -12) score -= 8;

  score = Math.max(0, Math.min(100, Math.round(score)));
  const nivel = score >= 80 ? "excelente" : score >= 60 ? "boa" : score >= 40 ? "atencao" : "critica";
  return { score, nivel, fatores, tendenciaRoas, tendenciaCtr };
}

// Regras acionáveis: alertas de conta (vs período anterior), realocação de verba,
// escalar/pausar/criativo — cada uma com o IMPACTO estimado em R$.
function gerarRecomendacoes(campanhas: CampaignRow[], anuncios: AdRow[], kpis: AdMetrics, kpisPrev: AdMetrics, saude: SaudeConta): Recomendacao[] {
  const out: Recomendacao[] = [];

  // Alertas de CONTA comparando com o período anterior (anomalias).
  if (kpisPrev.spend > 0) {
    const dSpend = (kpis.spend - kpisPrev.spend) / kpisPrev.spend;
    const rNow = kpis.roas ?? 0, rPrev = kpisPrev.roas ?? 0;
    if (dSpend >= 0.25 && rPrev > 0 && rNow < rPrev * 0.8) {
      out.push({ tipo: "alerta", nivel: "conta", ref: "Conta", severidade: "alta", titulo: "Gastando mais, retornando menos",
        detalhe: `Investimento ${(dSpend * 100).toFixed(0)}% acima do período anterior, mas o ROAS caiu de ${rPrev.toFixed(2)}x pra ${rNow.toFixed(2)}x. Segure a escala e revise o que mudou.` });
    }
    if (kpisPrev.cpa != null && kpis.cpa != null && kpis.cpa > kpisPrev.cpa * 1.3) {
      out.push({ tipo: "alerta", nivel: "conta", ref: "Conta", severidade: "media", titulo: "CPA subiu",
        detalhe: `Custo por compra passou de ${brl(kpisPrev.cpa)} pra ${brl(kpis.cpa)} (+${(((kpis.cpa / kpisPrev.cpa) - 1) * 100).toFixed(0)}%). Cheque criativos e a concorrência no leilão.` });
    }
  }
  if (saude.tendenciaCtr != null && saude.tendenciaCtr <= -15) {
    out.push({ tipo: "criativo", nivel: "conta", ref: "Conta", severidade: "media", titulo: "CTR do conjunto caindo — fadiga",
      detalhe: `O CTR caiu ${Math.abs(saude.tendenciaCtr).toFixed(0)}% na 2ª metade do período. Sinal clássico de fadiga: renove os criativos antes do CPM subir.` });
  }

  // Realocação: tira da pior campanha e põe na melhor.
  const pior = [...campanhas].filter((c) => c.roas != null && c.roas < 1 && c.spend >= 50).sort((a, b) => b.spend - a.spend)[0];
  const melhor = [...campanhas].filter((c) => c.roas != null && c.roas >= 3 && c.spend >= 20).sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))[0];
  if (pior && melhor && pior.id !== melhor.id) {
    out.push({ tipo: "realocar", nivel: "campanha", ref: melhor.name, severidade: "media", titulo: "Realoque verba",
      detalhe: `"${limparNomeCamp(pior.name)}" está no prejuízo (${pior.roas!.toFixed(2)}x). Mova parte da verba pra "${limparNomeCamp(melhor.name)}" (${melhor.roas!.toFixed(2)}x).`,
      impacto: `~${brl(Math.min(pior.spend, melhor.spend) * Math.max(0, melhor.roas! - 1))} a mais no período` });
  }

  for (const c of campanhas) {
    if (c.spend >= 50 && c.roas != null && c.roas < 1) {
      out.push({ tipo: "pausar", nivel: "campanha", ref: c.name, severidade: "alta", titulo: "Campanha no prejuízo",
        detalhe: `ROAS ${c.roas.toFixed(2)}x com ${brl(c.spend)} gastos. Revise segmentação/criativo ou pause.`,
        impacto: `economiza ${brl(c.spend)} de verba mal usada` });
    } else if (c.roas != null && c.roas >= 3 && c.spend >= 20) {
      out.push({ tipo: "escalar", nivel: "campanha", ref: c.name, severidade: "boa", titulo: "Campanha vencedora — escale",
        detalhe: `ROAS ${c.roas.toFixed(2)}x. Aumente o orçamento aos poucos (20–30%/vez) pra escalar sem quebrar o resultado.`,
        impacto: `+30% de verba ≈ +${brl(0.3 * c.spend * c.roas)} em receita est.` });
    }
    if (c.frequency >= 3 && c.spend >= 30) {
      out.push({ tipo: "criativo", nivel: "campanha", ref: c.name, severidade: "media", titulo: "Fadiga de criativo",
        detalhe: `Frequência ${c.frequency.toFixed(1)} — o público já viu demais. Troque a arte/vídeo.` });
    }
  }
  for (const a of anuncios.slice(0, 6)) {
    if (a.spend >= 30 && a.ctr < 1) {
      out.push({ tipo: "criativo", nivel: "anuncio", ref: a.name, severidade: "media", titulo: "CTR baixo",
        detalhe: `CTR ${a.ctr.toFixed(2)}% — o criativo não está prendendo. Teste um novo gancho/thumbnail.` });
    } else if (a.roas != null && a.roas >= 3 && a.spend >= 15) {
      out.push({ tipo: "escalar", nivel: "anuncio", ref: a.name, severidade: "boa", titulo: "Melhor anúncio",
        detalhe: `ROAS ${a.roas.toFixed(2)}x — replique esse padrão de criativo em novos anúncios.`,
        impacto: `+30% ≈ +${brl(0.3 * a.spend * a.roas)} est.` });
    }
  }
  const ordem = { alta: 0, media: 1, boa: 2 } as const;
  return out.sort((x, y) => ordem[x.severidade] - ordem[y.severidade]).slice(0, 14);
}
