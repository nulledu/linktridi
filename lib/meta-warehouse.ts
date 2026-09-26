// ── Tridify · warehouse local da Meta ────────────────────────────────────────
// Os JOBS gravam aqui; o dashboard LÊ daqui. A tela nunca chama o Graph.
// Grão: 1 linha por (conta, dia, campanha, conjunto, anúncio) — dá pra somar por
// qualquer nível sem perder nada. Upsert por chave composta: resincronizar um dia
// antigo corrige, nunca duplica.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { listAccounts } from "@/lib/meta";
import { INSIGHT_FIELDS, VIDEO_INSIGHT_FIELDS } from "@/lib/meta-ads";
import { extractEngagementMetrics, extractVideoMetrics } from "@/lib/creative-intelligence/meta-fields";
import { readSupabasePages } from "@/lib/supabase-pages";

const GRAPH = "https://graph.facebook.com/v21.0";
const MAX_PAGINAS = 40;

// Compras/leads: pega o 1º tipo por PRIORIDADE (somar duplicaria — omni_purchase
// já engloba o pixel).
const PURCH = ["omni_purchase", "offsite_conversion.fb_pixel_purchase", "purchase"];
const LEADS = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];
// Etapas do funil (mesmos nomes usados pelo overview).
const LPV = ["landing_page_view", "omni_landing_page_view"];
const ADDCART = ["omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"];
const CHECKOUT = ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"];
type ActionArr = Array<{ action_type: string; value: string }> | undefined;
function pick(arr: ActionArr, tipos: string[]): number {
  if (!arr) return 0;
  for (const t of tipos) { const x = arr.find((a) => a.action_type === t); if (x) return parseFloat(x.value) || 0; }
  return 0;
}

export interface SyncResultado {
  contaId: string; ok: boolean; linhas: number; duracaoMs: number; erro?: string;
}

interface GraphErro { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string }

// Busca TODAS as páginas de um endpoint de lista (paging.next).
async function buscarTudo(url: string): Promise<{ linhas: Record<string, unknown>[]; erro?: GraphErro; status?: number }> {
  const linhas: Record<string, unknown>[] = [];
  let proxima: string | undefined = url;
  for (let i = 0; proxima && i < MAX_PAGINAS; i++) {
    const res = await fetch(proxima, { cache: "no-store" });
    const j = (await res.json()) as { data?: Record<string, unknown>[]; paging?: { next?: string }; error?: GraphErro };
    if (j.error) return { linhas, erro: j.error, status: res.status };
    linhas.push(...(j.data ?? []));
    proxima = j.paging?.next;
  }
  return { linhas };
}

// Dias (YYYY-MM-DD) de since..until, inclusive (teto de segurança de 400).
function listarDatas(since: string, until: string): string[] {
  const out: string[] = [];
  let d = since;
  for (let i = 0; d <= until && i < 400; i++) {
    out.push(d);
    d = new Date(Date.parse(d + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
  }
  return out;
}

// Datas que JÁ têm linha no warehouse pra esta conta no intervalo. "Presente" =
// já sincronizado aquele dia; o sync incremental pula esses. (É o "só pega o que
// ainda não tem do Facebook".)
async function datasPresentes(contaId: string, since: string, until: string): Promise<Set<string>> {
  try {
    const data = await lerInsights("date", since, until, { contaId });
    if (!data) return new Set();
    return new Set((data as Array<{ date: string }>).map((r) => String(r.date)));
  } catch { return new Set(); }
}

// Sincroniza UMA conta num período (nível anúncio, dia a dia) → upsert.
// Período curto de propósito: o chamador fatia (7–15 dias) em vez de pedir tudo.
// opts.incremental: só baixa os dias que FALTAM no banco (+ os de opts.refazer,
// tipicamente hoje/ontem, que são sempre rebaixados porque a Meta ainda mexe
// neles). Intervalo já todo salvo e nada forçado → nem abre chamada ao Graph.
export async function syncConta(
  conta: { account_id: string; token: string }, since: string, until: string,
  opts: { incremental?: boolean; refazer?: string[] } = {},
): Promise<SyncResultado> {
  const t0 = Date.now();
  const db = createSupabaseAdminClient();

  // Janela EFETIVA a baixar (de..ate): pode encolher no modo incremental.
  let de = since, ate = until;
  if (opts.incremental) {
    const refazer = new Set(opts.refazer ?? []);
    const todas = listarDatas(since, until);
    // Se a janela inteira é forçada (ex.: [hoje,hoje]), nem consulta o que já tem.
    const todasForcadas = todas.length > 0 && todas.every((d) => refazer.has(d));
    const presentes = todasForcadas ? new Set<string>() : await datasPresentes(conta.account_id, since, until);
    const faltantes = todas.filter((d) => refazer.has(d) || !presentes.has(d));
    if (faltantes.length === 0) {
      // Tudo já no banco e nada a refazer: marca como sincronizada e sai barato.
      const dur = Date.now() - t0;
      await db.from("meta_sync_jobs").upsert({
        ad_account_id: conta.account_id, status: "ok", ultima_sync: new Date().toISOString(),
        periodo_de: since, periodo_ate: until, duracao_ms: dur, erro: null, updated_at: new Date().toISOString(),
      }, { onConflict: "ad_account_id" });
      return { contaId: conta.account_id, ok: true, linhas: 0, duracaoMs: dur };
    }
    // Baixa o menor span contíguo que cobre os faltantes (upsert corrige o meio).
    de = faltantes[0]; ate = faltantes[faltantes.length - 1];
  }

  await db.from("meta_sync_jobs").upsert({ ad_account_id: conta.account_id, status: "rodando", updated_at: new Date().toISOString() }, { onConflict: "ad_account_id" });

  const tr = encodeURIComponent(JSON.stringify({ since: de, until: ate }));

  // ── Portão barato: esta conta gastou algo no período? ─────────────────────
  // level=account devolve UMA linha e não pagina. O nível de anúncio com
  // time_increment=1 é o oposto: dezenas de páginas por conta. A maioria das
  // contas não gasta no período, e antes disto todas pagavam o caminho caro
  // pra trazer zero linha. Uma chamada leve decide se vale abrir a cara.
  try {
    const rc = await fetch(
      `${GRAPH}/act_${conta.account_id}/insights?level=account&fields=spend,impressions&time_range=${tr}&access_token=${conta.token}`,
      { cache: "no-store" },
    );
    const jc = (await rc.json()) as { data?: Array<{ spend?: string; impressions?: string }>; error?: unknown };
    if (rc.ok && !jc.error) {
      const linha = jc.data?.[0];
      const gastou = (Number(linha?.spend ?? 0) || 0) > 0 || (Number(linha?.impressions ?? 0) || 0) > 0;
      if (!gastou) {
        // Sem entrega no período: registra como sincronizada (o "nada" também é
        // resultado) e devolve. Sem isto a conta voltava pro fim da fila e era
        // reconsultada a cada rodada, pra sempre.
        const dur = Date.now() - t0;
        await db.from("meta_sync_jobs").upsert({
          ad_account_id: conta.account_id, status: "ok", ultima_sync: new Date().toISOString(),
          periodo_de: since, periodo_ate: until, linhas: 0, duracao_ms: dur, erro: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "ad_account_id" });
        return { contaId: conta.account_id, ok: true, linhas: 0, duracaoMs: dur };
      }
    }
    // Erro no portão não bloqueia: cai no caminho normal e deixa ele decidir.
  } catch { /* rede instável: segue pelo caminho completo */ }

  const campos = `account_currency,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,date_start,${INSIGHT_FIELDS},${VIDEO_INSIGHT_FIELDS}`;
  const url = `${GRAPH}/act_${conta.account_id}/insights?level=ad&fields=${campos}&time_range=${tr}&time_increment=1&limit=500&access_token=${conta.token}`;

  const { linhas, erro, status } = await buscarTudo(url);
  const duracaoMs = Date.now() - t0;

  if (erro) {
    const msg = `${erro.message ?? "erro"}${erro.fbtrace_id ? ` (trace ${erro.fbtrace_id})` : ""}`;
    await db.from("meta_sync_jobs").upsert({
      ad_account_id: conta.account_id, status: "erro", erro: msg.slice(0, 300),
      duracao_ms: duracaoMs, updated_at: new Date().toISOString(),
    }, { onConflict: "ad_account_id" });
    await db.from("meta_sync_logs").insert({
      ad_account_id: conta.account_id, periodo_de: since, periodo_ate: until, ok: false, duracao_ms: duracaoMs,
      http_status: status ?? null, erro_code: erro.code != null ? String(erro.code) : null,
      erro_subcode: erro.error_subcode != null ? String(erro.error_subcode) : null,
      fbtrace_id: erro.fbtrace_id ?? null, erro: msg.slice(0, 500),
    }).then(() => {}, () => {});
    return { contaId: conta.account_id, ok: false, linhas: 0, duracaoMs, erro: msg };
  }

  const rows = linhas.map((r) => {
    const num = (k: string) => Number(r[k] ?? 0) || 0;
    const video = extractVideoMetrics(r);
    const engajamento = extractEngagementMetrics(r);
    return {
      ad_account_id: conta.account_id,
      date: String(r.date_start ?? de),
      campaign_id: String(r.campaign_id ?? ""), adset_id: String(r.adset_id ?? ""), ad_id: String(r.ad_id ?? ""),
      campaign_name: (r.campaign_name as string) ?? null, adset_name: (r.adset_name as string) ?? null, ad_name: (r.ad_name as string) ?? null,
      spend: num("spend"), impressions: num("impressions"), clicks: num("clicks"), reach: num("reach"),
      purchases_meta: pick(r.actions as ActionArr, PURCH),
      purchase_value_meta: pick(r.action_values as ActionArr, PURCH),
      leads_meta: pick(r.actions as ActionArr, LEADS),
      lpv: pick(r.actions as ActionArr, LPV),
      add_to_cart: pick(r.actions as ActionArr, ADDCART),
      initiate_checkout: pick(r.actions as ActionArr, CHECKOUT),
      funnel_metrics_collected: true,
      video_metrics_collected: video.videoMetricsCollected,
      video_plays: video.videoPlays,
      video_views_3s: video.videoViews3s,
      video_views_2s: video.videoViews2s,
      video_views_25: video.videoViews25,
      video_views_50: video.videoViews50,
      video_views_75: video.videoViews75,
      video_views_95: video.videoViews95,
      video_views_100: video.videoViews100,
      video_avg_watch_time: video.videoAvgWatchTime,
      video_thruplays: video.thruPlays,
      engagement_metrics_collected: true,
      post_reactions: engajamento.reactions,
      post_comments: engajamento.comments,
      post_shares: engajamento.shares,
      currency: (r.account_currency as string) ?? null,
      updated_at: new Date().toISOString(),
    };
  });

  // Upsert em lotes (nunca insert puro → resync não duplica). Tolerante: se as
  // colunas mais novas ainda não existem (SQL não rodado), reenvia sem elas —
  // do estágio mais novo (engajamento) pro mais antigo (funil).
  const CHAVES_ENGAJAMENTO = ["engagement_metrics_collected", "post_reactions", "post_comments", "post_shares"];
  const CHAVES_VIDEO = ["video_metrics_collected", "video_plays", "video_views_3s", "video_views_2s", "video_views_25", "video_views_50", "video_views_75", "video_views_95", "video_views_100", "video_avg_watch_time", "video_thruplays"];
  const CHAVES_FUNIL = ["lpv", "add_to_cart", "initiate_checkout", "funnel_metrics_collected"];
  const semChaves = (lote: typeof rows, chaves: string[]) => lote.map((r) => {
    const copy: Record<string, unknown> = { ...r };
    for (const chave of chaves) delete copy[chave];
    return copy;
  });
  for (let i = 0; i < rows.length; i += 500) {
    const lote = rows.slice(i, i + 500);
    let { error } = await db.from("meta_ad_insights_daily")
      .upsert(lote, { onConflict: "ad_account_id,date,campaign_id,adset_id,ad_id" });
    if (error && /column|schema cache/i.test(error.message)) {
      // Sem as colunas de engajamento (criativo_engajamento.sql não rodado):
      // grava todo o resto e a tela mostra "–" nas curtidas até o SQL.
      ({ error } = await db.from("meta_ad_insights_daily")
        .upsert(semChaves(lote, CHAVES_ENGAJAMENTO), { onConflict: "ad_account_id,date,campaign_id,adset_id,ad_id" }));
    }
    if (error && /column|schema cache/i.test(error.message)) {
      // Banco no estágio anterior: preserva o funil e tenta apenas sem vídeo.
      ({ error } = await db.from("meta_ad_insights_daily")
        .upsert(semChaves(lote, [...CHAVES_ENGAJAMENTO, ...CHAVES_VIDEO]), { onConflict: "ad_account_id,date,campaign_id,adset_id,ad_id" }));
    }
    if (error && /column|schema cache/i.test(error.message)) {
      // Banco legado: ainda sincroniza as métricas básicas em vez de abortar.
      ({ error } = await db.from("meta_ad_insights_daily")
        .upsert(semChaves(lote, [...CHAVES_ENGAJAMENTO, ...CHAVES_VIDEO, ...CHAVES_FUNIL]), { onConflict: "ad_account_id,date,campaign_id,adset_id,ad_id" }));
    }
    if (error) {
      await db.from("meta_sync_jobs").upsert({ ad_account_id: conta.account_id, status: "erro", erro: error.message.slice(0, 300), duracao_ms: Date.now() - t0, updated_at: new Date().toISOString() }, { onConflict: "ad_account_id" });
      return { contaId: conta.account_id, ok: false, linhas: 0, duracaoMs: Date.now() - t0, erro: error.message };
    }
  }

  const dur = Date.now() - t0;
  await db.from("meta_sync_jobs").upsert({
    ad_account_id: conta.account_id, status: "ok", ultima_sync: new Date().toISOString(),
    periodo_de: since, periodo_ate: until, linhas: rows.length, duracao_ms: dur, erro: null, updated_at: new Date().toISOString(),
  }, { onConflict: "ad_account_id" });
  await db.from("meta_sync_logs").insert({
    ad_account_id: conta.account_id, periodo_de: since, periodo_ate: until, ok: true, linhas: rows.length, duracao_ms: dur,
  }).then(() => {}, () => {});

  return { contaId: conta.account_id, ok: true, linhas: rows.length, duracaoMs: dur };
}

// ── Sync em FATIAS, com prazo ───────────────────────────────────────────────
// (Havia aqui um syncTodasContas() que percorria TODAS as contas sem prazo.
// Removido: no Hobby ele estoura os 60s da função e morre no meio, deixando as
// últimas contas eternamente sem sincronizar. Use syncFatia.)
// A Vercel no plano Hobby corta a função em 60s, e são dezenas de contas: uma
// passada só nunca termina. Então cada invocação trabalha até o prazo e PARA
// num limite de conta (nunca no meio de uma), deixando o resto pra próxima.
// A fila é ordenada pela conta mais DESATUALIZADA, então nenhuma fica pra trás
// por azar de ordem — é isso que garante que a fila drena mesmo sem cron.
export interface FatiaResultado {
  processadas: number; restantes: number; linhas: number;
  expirou: boolean; erros: string[];
}

// ── RODADA de dreno ─────────────────────────────────────────────────────────
// `restantes` só serve pra alguma coisa se ele CAIR a cada volta. Antes ele era
// `todas as contas - processadas nesta chamada`, com a fila recontada inteira a
// cada requisição: com 21 contas (~100s) e prazo de 45s (~13 contas), ele
// travava em 8 pra sempre, `concluido` nunca vinha e a tela ficava
// "Sincronizando…" por 25 voltas (~19min) com os botões desabilitados.
//
// A rodada é o instante em que o dreno começou. Cada volta só pega quem ainda
// não foi TENTADO depois daquele instante — e como toda tentativa carimba
// `updated_at` (inclusive erro e "rodando"), a fila encolhe de verdade.
const JANELA_RODADA_MS = 30 * 60 * 1000;

/** Contas que ainda faltam nesta rodada (nunca tentadas ou tentadas antes dela). */
export function filaDaRodada<T extends { account_id: string }>(
  contas: T[],
  ultimaTentativa: Map<string, string>,
  desdeRodada?: string,
): T[] {
  const corte = desdeRodada ? Date.parse(desdeRodada) : NaN;
  if (!Number.isFinite(corte)) return [...contas];
  return contas.filter((c) => {
    const t = ultimaTentativa.get(String(c.account_id));
    if (!t) return true;                       // nunca tentada
    const ms = Date.parse(t);
    return !Number.isFinite(ms) || ms < corte; // carimbo estranho não some com a conta
  });
}

/** Carimbo da rodada a usar nesta requisição. Sem carimbo (ou fora da janela) começa uma nova. */
export function rodadaDeSync(bruto: string | null | undefined, agora: number): string {
  const ms = bruto ? Date.parse(bruto) : NaN;
  // Relógio do cliente adiantado pularia TODAS as contas; rodada velha demais
  // reviveria uma fila que já não vale. Nos dois casos: rodada nova.
  if (!Number.isFinite(ms) || ms > agora + 60_000 || agora - ms > JANELA_RODADA_MS) {
    return new Date(agora).toISOString();
  }
  return new Date(ms).toISOString();
}

export async function syncFatia(
  janelas: Array<[string, string]>,
  opts: { prazoMs?: number; maxContas?: number; pularJanelaJaFeita?: boolean; incremental?: boolean; refazer?: string[]; desdeRodada?: string; contas?: string[]; paralelo?: number } = {},
): Promise<FatiaResultado> {
  const prazo = Date.now() + (opts.prazoMs ?? 45_000);
  // `opts.contas`: só estas (ids sem "act_"). É o "Atualizar" com filtro de
  // conta ligado — rebaixar as 21 da casa para olhar uma leva três fatias.
  const so = opts.contas?.length ? new Set(opts.contas.map((c) => c.replace(/^act_/, ""))) : null;
  const contas = (await listAccounts()).filter((a) => !so || so.has(String(a.account_id).replace(/^act_/, "")));

  // Ordena por quem sincronizou há mais tempo (sem registro = nunca sincronizou
  // = prioridade máxima). Sem isso a fila sempre começaria pela mesma conta e o
  // fim da lista nunca seria alcançado.
  let ordem = new Map<string, string>();
  let ultimoPeriodo = new Map<string, string>();
  // Última TENTATIVA (não último sucesso): `updated_at` é carimbado em todo
  // caminho de syncConta, inclusive erro e "rodando". É o que impede uma conta
  // com token vencido de voltar pro topo da fila e comer o prazo toda volta.
  let ultimaTentativa = new Map<string, string>();
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("meta_sync_jobs").select("ad_account_id,ultima_sync,periodo_de,periodo_ate,status,updated_at");
    for (const r of (data ?? []) as Array<{ ad_account_id: string; ultima_sync: string | null; periodo_de: string | null; periodo_ate: string | null; status: string | null; updated_at: string | null }>) {
      const id = String(r.ad_account_id);
      if (r.ultima_sync) ordem.set(id, r.ultima_sync);
      const tentativa = r.updated_at ?? r.ultima_sync;
      if (tentativa) ultimaTentativa.set(id, tentativa);
      // Só conta como "já feito" se terminou OK — erro tem que ser retentado.
      if (r.status === "ok" && r.periodo_de && r.periodo_ate) ultimoPeriodo.set(id, `${r.periodo_de}..${r.periodo_ate}`);
    }
  } catch { ordem = new Map(); ultimoPeriodo = new Map(); ultimaTentativa = new Map(); }

  // Só o que ainda falta NESTA rodada (ver JANELA_RODADA_MS acima). Sem isto a
  // fila era recontada inteira toda volta e `restantes` nunca zerava.
  let fila = filaDaRodada([...contas], ultimaTentativa, opts.desdeRodada)
    .sort((a, b) => (ordem.get(String(a.account_id)) ?? "").localeCompare(ordem.get(String(b.account_id)) ?? ""));

  // Backfill: pula quem JÁ gravou exatamente esta janela. Sem isso, quando as
  // contas não cabem no prazo, cada chamada refazia o mesmo bloco desde o
  // início e o backfill nunca passava do primeiro — travava pra sempre.
  if (opts.pularJanelaJaFeita && janelas.length === 1) {
    const alvo = `${janelas[0][0]}..${janelas[0][1]}`;
    fila = fila.filter((c) => ultimoPeriodo.get(String(c.account_id)) !== alvo);
  }

  const limite = opts.maxContas ?? fila.length;
  let processadas = 0, linhas = 0;
  const erros: string[] = [];

  const umaConta = async (c: { account_id: string | number; token: string }) => {
    for (const [de, ate] of janelas) {
      const r = await syncConta({ account_id: String(c.account_id), token: c.token }, de, ate, { incremental: opts.incremental, refazer: opts.refazer });
      linhas += r.linhas;
      if (!r.ok) erros.push(`${r.contaId}: ${r.erro}`);
    }
    processadas++;
  };

  // ── Em SÉRIE por padrão; em paralelo só quando quem chamou pede ────────────
  // O cron continua serial de propósito: ele varre as 21 contas da casa e a
  // Meta já responde "Application request limit reached" para a maior delas —
  // disparar tudo de uma vez transformaria um erro ocasional em erro de todas.
  //
  // `paralelo` existe pro caminho INTERATIVO (o "Atualizar" da tela), onde a
  // fila é pequena (só as contas que estão na tela) e alguém está esperando
  // olhando. Medido em 5 contas: 31 s em série, porque UMA delas gasta ~24 s
  // pra terminar em erro e as outras quatro ficam na fila atrás dela. Em
  // paralelo o custo passa a ser o da conta mais lenta, não a soma.
  const largura = Math.max(1, Math.min(opts.paralelo ?? 1, fila.length));
  if (largura > 1) {
    const pendentes = fila.slice(0, limite);
    let proxima = 0;
    const trabalhador = async () => {
      for (;;) {
        // Checa ANTES de começar: parar no meio de uma conta deixaria o período
        // dela pela metade sem ninguém saber.
        if (Date.now() >= prazo) return;
        const i = proxima++;
        if (i >= pendentes.length) return;
        await umaConta(pendentes[i]);
      }
    };
    await Promise.all(Array.from({ length: largura }, trabalhador));
  } else {
    for (const c of fila) {
      // Checa ANTES de começar: parar no meio de uma conta deixaria o período
      // dela pela metade sem ninguém saber.
      if (processadas >= limite || Date.now() >= prazo) break;
      await umaConta(c);
    }
  }

  return { processadas, restantes: Math.max(0, fila.length - processadas), linhas, expirou: Date.now() >= prazo, erros };
}

// ── Leitura (o dashboard usa isto — SQL local, sem Graph) ────────────────────
export interface TotaisPeriodo {
  spend: number; impressions: number; clicks: number;
  purchasesMeta: number; purchaseValueMeta: number; leadsMeta: number;
  dias: number; linhas: number;
}

// Totais do período (opcionalmente filtrando contas). Soma só o que é ADITIVO —
// `reach` fica de fora porque é deduplicado e somar entre dias infla.
// Teto do fallback. NUNCA some sem limite explícito: o PostgREST corta em 1000
// por padrão e o total sai truncado SEM erro — foi exatamente o bug que estas
// duas funções tinham. Com limite explícito dá pra DETECTAR o corte.
const TETO_LINHAS = 50_000;

// Lê meta_ad_insights_daily em páginas ORDENADAS. O PostgREST corta cada
// resposta em 1000 linhas (max-rows) e `.limit()` não sobe esse teto; sem
// `.order()` o heap devolve o dia de hoje (reescrito pelo sync) por último e
// era ele que sumia. Devolve null em erro OU se passou do teto — total parcial
// não é número.
type FiltroInsights = { campaignId?: string; contaId?: string; contas?: string[] };
async function lerInsights(select: string, since: string, until: string, f: FiltroInsights = {}): Promise<Array<Record<string, unknown>> | null> {
  const db = createSupabaseAdminClient();
  const r = await readSupabasePages<Record<string, unknown>>((from, to) => {
    let q = db.from("meta_ad_insights_daily").select(select).gte("date", since).lte("date", until);
    if (f.campaignId) q = q.eq("campaign_id", f.campaignId);
    if (f.contaId) q = q.eq("ad_account_id", f.contaId);
    if (f.contas?.length) q = q.in("ad_account_id", f.contas.map((c) => c.replace(/^act_/, "")));
    return q.order("date", { ascending: true }).order("ad_account_id", { ascending: true }).order("ad_id", { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
  }, TETO_LINHAS);
  if (r.error) return null;
  if (r.truncated) {
    console.warn(`[meta-warehouse] passou de ${TETO_LINHAS} linhas (${since}..${until}); devolvendo null em vez de total parcial.`);
    return null;
  }
  return r.data;
}

interface AgregadoBruto {
  spend: number; impressions: number; clicks: number;
  purchases_meta: number; purchase_value_meta: number; leads_meta: number;
  lpv: number; add_to_cart: number; initiate_checkout: number;
  dias: number; linhas: number;
}

// Soma no POSTGRES (uma passada, sem trafegar linha). Devolve null se a função
// ainda não existe no banco — aí o chamador cai no fallback.
async function agregadoSQL(since: string, until: string, contas?: string[]): Promise<AgregadoBruto | null> {
  try {
    const db = createSupabaseAdminClient();
    const { data, error } = await db.rpc("meta_totais_periodo", {
      p_since: since, p_until: until,
      p_contas: contas?.length ? contas.map((c) => c.replace(/^act_/, "")) : null,
    });
    if (error || !data) return null;
    const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    if (!r) return null;
    const n = (k: string) => Number(r[k]) || 0;
    return {
      spend: n("spend"), impressions: n("impressions"), clicks: n("clicks"),
      purchases_meta: n("purchases_meta"), purchase_value_meta: n("purchase_value_meta"), leads_meta: n("leads_meta"),
      lpv: n("lpv"), add_to_cart: n("add_to_cart"), initiate_checkout: n("initiate_checkout"),
      dias: n("dias"), linhas: n("linhas"),
    };
  } catch { return null; }
}

// Fallback: baixa as linhas e soma em JS. Só roda enquanto o SQL de agregação
// não foi aplicado. Se bater no teto, AVISA — melhor log feio que número errado.
async function agregadoJS(since: string, until: string, contas?: string[]): Promise<AgregadoBruto | null> {
  const data = await lerInsights("date,spend,impressions,clicks,lpv,add_to_cart,initiate_checkout,purchases_meta,purchase_value_meta,leads_meta", since, until, { contas });
  if (!data) return null;
  const linhas = data as Array<Record<string, number | string>>;
  const soma = (k: string) => linhas.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  return {
    spend: soma("spend"), impressions: soma("impressions"), clicks: soma("clicks"),
    purchases_meta: soma("purchases_meta"), purchase_value_meta: soma("purchase_value_meta"), leads_meta: soma("leads_meta"),
    lpv: soma("lpv"), add_to_cart: soma("add_to_cart"), initiate_checkout: soma("initiate_checkout"),
    dias: new Set(linhas.map((r) => String(r.date))).size, linhas: linhas.length,
  };
}

const agregado = async (since: string, until: string, contas?: string[]) =>
  (await agregadoSQL(since, until, contas)) ?? (await agregadoJS(since, until, contas));

export async function totaisDoPeriodo(since: string, until: string, contas?: string[]): Promise<TotaisPeriodo | null> {
  try {
    const a = await agregado(since, until, contas);
    if (!a) return null;
    return {
      spend: a.spend, impressions: a.impressions, clicks: a.clicks,
      purchasesMeta: a.purchases_meta, purchaseValueMeta: a.purchase_value_meta, leadsMeta: a.leads_meta,
      dias: a.dias, linhas: a.linhas,
    };
  } catch { return null; }
}

// ── Totais POR CONTA de anúncios (local) ────────────────────────────────────
// O grão do warehouse é o anúncio-dia; aqui só as colunas que o widget de BM
// usa (nada de campaign_name/adset_name, que é texto e não entra em soma).
// Devolve null quando não há linha no período — o chamador cai no que tiver.
export interface ContaPeriodo {
  contaId: string;
  spend: number; impressions: number; clicks: number;
  purchases: number; revenue: number; leads: number;
}

export async function porContaDoPeriodo(since: string, until: string, contas?: string[]): Promise<ContaPeriodo[] | null> {
  try {
    const data = await lerInsights("ad_account_id,spend,impressions,clicks,purchases_meta,purchase_value_meta,leads_meta", since, until, { contas });
    if (!data?.length) return null;

    const mapa = new Map<string, ContaPeriodo>();
    for (const r of data as Array<Record<string, unknown>>) {
      const id = String(r.ad_account_id ?? "");
      if (!id) continue;
      const num = (k: string) => Number(r[k]) || 0;
      const c = mapa.get(id) ?? { contaId: id, spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, leads: 0 };
      c.spend += num("spend"); c.impressions += num("impressions"); c.clicks += num("clicks");
      c.purchases += num("purchases_meta"); c.revenue += num("purchase_value_meta"); c.leads += num("leads_meta");
      mapa.set(id, c);
    }
    return [...mapa.values()].sort((a, b) => b.spend - a.spend);
  } catch { return null; }
}

// ── Funil do período (local) ────────────────────────────────────────────────
// Impressões → cliques → LPV → carrinho → checkout → compra. Alcance fica de
// fora: é deduplicado pela Meta, somar entre dias infla. Devolve null se o
// banco ainda não tem as colunas do funil (SQL antigo) — a tela cai no Graph.
export interface FunilLocal {
  impressions: number; clicks: number; lpv: number; addCart: number; checkout: number;
  purchases: number; revenue: number; spend: number;
}
export async function funilDoPeriodo(since: string, until: string, contas?: string[]): Promise<FunilLocal | null> {
  try {
    const a = await agregado(since, until, contas);
    if (!a || !a.linhas) return null;
    return {
      spend: a.spend, impressions: a.impressions, clicks: a.clicks,
      lpv: a.lpv, addCart: a.add_to_cart, checkout: a.initiate_checkout,
      purchases: a.purchases_meta, revenue: a.purchase_value_meta,
    };
  } catch { return null; }
}

// ── Série diária (gráfico de tendência) ─────────────────────────────────────
// Soma por DIA a partir do grão de anúncio. Limite explícito sempre (a lição
// do truncamento silencioso) — e se bater no teto, avisa.
export interface DiaPonto { day: string; spend: number; revenue: number; purchases: number; impressions: number; clicks: number }
export async function serieDiariaLocal(since: string, until: string, contas?: string[]): Promise<DiaPonto[] | null> {
  try {
    const data = await lerInsights("date,spend,purchase_value_meta,purchases_meta,impressions,clicks", since, until, { contas });
    if (!data?.length) return null;
    const porDia = new Map<string, DiaPonto>();
    for (const r of data as Array<Record<string, number | string>>) {
      const day = String(r.date);
      const e = porDia.get(day) || { day, spend: 0, revenue: 0, purchases: 0, impressions: 0, clicks: 0 };
      e.spend += Number(r.spend) || 0; e.revenue += Number(r.purchase_value_meta) || 0;
      e.purchases += Number(r.purchases_meta) || 0; e.impressions += Number(r.impressions) || 0;
      e.clicks += Number(r.clicks) || 0;
      porDia.set(day, e);
    }
    return [...porDia.values()].sort((a, b) => a.day.localeCompare(b.day));
  } catch { return null; }
}

// ── Relatório hierárquico (campanha → conjunto → anúncio) ───────────────────
// 100% SQL local: sem Graph, sem espera. É o que a tabela diária destrava.
export interface LinhaRel {
  id: string; nome: string;
  spend: number; impressions: number; clicks: number;
  purchases: number; revenue: number; leads: number;
  roas: number | null; cpa: number | null; cpc: number | null; cpm: number; ctr: number; ticket: number | null;
  filhos?: LinhaRel[];
}

function derivadas(a: { spend: number; impressions: number; clicks: number; purchases: number; revenue: number }) {
  return {
    roas: a.spend > 0 ? Math.round((a.revenue / a.spend) * 100) / 100 : null,
    cpa: a.purchases > 0 ? a.spend / a.purchases : null,
    cpc: a.clicks > 0 ? a.spend / a.clicks : null,
    cpm: a.impressions > 0 ? (a.spend / a.impressions) * 1000 : 0,
    ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0,
    ticket: a.purchases > 0 ? a.revenue / a.purchases : null,
  };
}

// Monta a árvore somando as linhas diárias por nível. Só métricas ADITIVAS.
export async function relatorioHierarquico(since: string, until: string, contas?: string[]): Promise<LinhaRel[] | null> {
  try {
    const data = await lerInsights("campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,purchases_meta,purchase_value_meta,leads_meta", since, until, { contas });
    if (!data) return null;

    const zero = () => ({ spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, leads: 0 });
    type No = ReturnType<typeof zero> & { nome: string; filhos: Map<string, No> };
    const novo = (nome: string): No => ({ ...zero(), nome, filhos: new Map() });
    const somar = (n: No, r: Record<string, unknown>) => {
      n.spend += Number(r.spend) || 0; n.impressions += Number(r.impressions) || 0;
      n.clicks += Number(r.clicks) || 0; n.purchases += Number(r.purchases_meta) || 0;
      n.revenue += Number(r.purchase_value_meta) || 0; n.leads += Number(r.leads_meta) || 0;
    };

    const campanhas = new Map<string, No>();
    for (const r of data as Record<string, unknown>[]) {
      const cId = String(r.campaign_id || "—"), aId = String(r.adset_id || "—"), adId = String(r.ad_id || "—");
      let c = campanhas.get(cId); if (!c) { c = novo((r.campaign_name as string) || "Sem campanha"); campanhas.set(cId, c); }
      let cj = c.filhos.get(aId); if (!cj) { cj = novo((r.adset_name as string) || "Sem conjunto"); c.filhos.set(aId, cj); }
      let ad = cj.filhos.get(adId); if (!ad) { ad = novo((r.ad_name as string) || "Sem anúncio"); cj.filhos.set(adId, ad); }
      somar(c, r); somar(cj, r); somar(ad, r);
    }

    const paraLinha = (id: string, n: No): LinhaRel => ({
      id, nome: n.nome, spend: n.spend, impressions: n.impressions, clicks: n.clicks,
      purchases: n.purchases, revenue: n.revenue, leads: n.leads, ...derivadas(n),
      filhos: n.filhos.size ? [...n.filhos.entries()].map(([k, v]) => paraLinha(k, v)).sort((a, b) => b.spend - a.spend) : undefined,
    });
    return [...campanhas.entries()].map(([k, v]) => paraLinha(k, v)).sort((a, b) => b.spend - a.spend);
  } catch { return null; }
}

// ── Árvore local do período (campanha → conjunto → anúncio) — para a aba Campanhas ──
// É o "primeiro do banco" do overview: métricas somadas do grão diário, funil por
// campanha e mini-série (spark) por campanha, sem tocar o Graph. reach por MÁX
// diário (somar entre dias infla — a Meta deduplica), então reach/frequency saem
// aproximados; todo o resto é exato. Devolve null se não há dado local no período.
export interface CampanhaLocal {
  accountId: string; id: string; name: string;
  spend: number; impressions: number; clicks: number; reach: number;
  purchases: number; revenue: number; leads: number;
  lpv: number; addCart: number; checkout: number;
  spark: Array<{ d: string; spend: number; revenue: number }>;
}
export interface NoLocal {
  accountId: string; id: string; name: string; campaign: string;
  spend: number; impressions: number; clicks: number; reach: number;
  purchases: number; revenue: number; leads: number;
}
export interface ArvoreLocal { campanhas: CampanhaLocal[]; conjuntos: NoLocal[]; anuncios: NoLocal[] }

export async function arvoreLocal(since: string, until: string, contas?: string[]): Promise<ArvoreLocal | null> {
  try {
    const db = createSupabaseAdminClient();
    const result = await readSupabasePages<Record<string, unknown>>((from, to) => {
      let q = db.from("meta_ad_insights_daily")
        .select("ad_account_id,date,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,reach,purchases_meta,purchase_value_meta,leads_meta,lpv,add_to_cart,initiate_checkout")
        .gte("date", since).lte("date", until)
        .order("date", { ascending: true })
        .order("ad_account_id", { ascending: true })
        .order("ad_id", { ascending: true });
      if (contas?.length) q = q.in("ad_account_id", contas.map((c) => c.replace(/^act_/, "")));
      return q.range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
    }, TETO_LINHAS);
    const { data, error } = result;
    if (error || !data?.length) return null;
    if (result.truncated) {
      console.warn(`[meta-warehouse] arvoreLocal excedeu ${TETO_LINHAS} linhas (${since}..${until}); usando o fallback para não exibir totais parciais.`);
      return null;
    }

    interface Agg { accountId: string; id: string; name: string; campaign: string; spend: number; impressions: number; clicks: number; reach: number; purchases: number; revenue: number; leads: number; lpv: number; addCart: number; checkout: number; spark: Map<string, { spend: number; revenue: number }> }
    const novo = (accountId: string, id: string, name: string, campaign: string): Agg => ({ accountId, id, name, campaign, spend: 0, impressions: 0, clicks: 0, reach: 0, purchases: 0, revenue: 0, leads: 0, lpv: 0, addCart: 0, checkout: 0, spark: new Map() });
    const somar = (n: Agg, r: Record<string, unknown>, dia?: string) => {
      const num = (k: string) => Number(r[k]) || 0;
      n.spend += num("spend"); n.impressions += num("impressions"); n.clicks += num("clicks");
      n.reach = Math.max(n.reach, num("reach"));   // reach é deduplicado: MÁX, nunca soma
      n.purchases += num("purchases_meta"); n.revenue += num("purchase_value_meta"); n.leads += num("leads_meta");
      n.lpv += num("lpv"); n.addCart += num("add_to_cart"); n.checkout += num("initiate_checkout");
      if (dia) { const e = n.spark.get(dia) || { spend: 0, revenue: 0 }; e.spend += num("spend"); e.revenue += num("purchase_value_meta"); n.spark.set(dia, e); }
    };

    const camps = new Map<string, Agg>(), sets = new Map<string, Agg>(), anun = new Map<string, Agg>();
    for (const r of data as Array<Record<string, unknown>>) {
      const acc = String(r.ad_account_id ?? "");
      const cId = String(r.campaign_id || ""), aId = String(r.adset_id || ""), adId = String(r.ad_id || "");
      const cNome = (r.campaign_name as string) || "Campanha";
      const dia = String(r.date || "");
      if (cId) { let c = camps.get(cId); if (!c) { c = novo(acc, cId, cNome, ""); camps.set(cId, c); } if (r.campaign_name) c.name = cNome; somar(c, r, dia); }
      if (aId) { let s = sets.get(aId); if (!s) { s = novo(acc, aId, (r.adset_name as string) || "Conjunto", cNome); sets.set(aId, s); } somar(s, r); }
      if (adId) { let a = anun.get(adId); if (!a) { a = novo(acc, adId, (r.ad_name as string) || "Anúncio", cNome); anun.set(adId, a); } somar(a, r); }
    }
    const toNo = (a: Agg): NoLocal => ({ accountId: a.accountId, id: a.id, name: a.name, campaign: a.campaign, spend: a.spend, impressions: a.impressions, clicks: a.clicks, reach: a.reach, purchases: a.purchases, revenue: a.revenue, leads: a.leads });
    const campanhas: CampanhaLocal[] = [...camps.values()].filter((c) => c.spend > 0).map((c) => ({
      accountId: c.accountId, id: c.id, name: c.name, spend: c.spend, impressions: c.impressions, clicks: c.clicks, reach: c.reach,
      purchases: c.purchases, revenue: c.revenue, leads: c.leads, lpv: c.lpv, addCart: c.addCart, checkout: c.checkout,
      spark: [...c.spark.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ d, spend: v.spend, revenue: v.revenue })),
    })).sort((a, b) => b.spend - a.spend);
    if (!campanhas.length) return null;
    return {
      campanhas,
      conjuntos: [...sets.values()].filter((s) => s.spend > 0).map(toNo).sort((a, b) => b.spend - a.spend),
      anuncios: [...anun.values()].filter((a) => a.spend > 0).map(toNo).sort((a, b) => b.spend - a.spend),
    };
  } catch { return null; }
}

// ── Série DIÁRIA de UMA campanha (drill-down "dia a dia" da aba Campanhas) ──────
// Some por dia todas as linhas (anúncios/conjuntos) daquela campanha. reach de
// fora (deduplicado). Devolve null se não há dado local — o chamador cai no Graph.
export interface DiaCampanha {
  day: string; spend: number; revenue: number; purchases: number;
  clicks: number; impressions: number; leads: number; lpv: number; addCart: number; checkout: number;
}
export async function serieCampanha(campaignId: string, since: string, until: string): Promise<DiaCampanha[] | null> {
  try {
    const data = await lerInsights("date,spend,purchase_value_meta,purchases_meta,clicks,impressions,leads_meta,lpv,add_to_cart,initiate_checkout", since, until, { campaignId });
    if (!data?.length) return null;
    const porDia = new Map<string, DiaCampanha>();
    for (const r of data as Array<Record<string, unknown>>) {
      const day = String(r.date); const num = (k: string) => Number(r[k]) || 0;
      const e = porDia.get(day) || { day, spend: 0, revenue: 0, purchases: 0, clicks: 0, impressions: 0, leads: 0, lpv: 0, addCart: 0, checkout: 0 };
      e.spend += num("spend"); e.revenue += num("purchase_value_meta"); e.purchases += num("purchases_meta");
      e.clicks += num("clicks"); e.impressions += num("impressions"); e.leads += num("leads_meta");
      e.lpv += num("lpv"); e.addCart += num("add_to_cart"); e.checkout += num("initiate_checkout");
      porDia.set(day, e);
    }
    return [...porDia.values()].sort((a, b) => a.day.localeCompare(b.day));
  } catch { return null; }
}

// Status de sync por conta (pra tela mostrar "atualizado há X" e erros).
export async function statusSync(): Promise<Array<{ contaId: string; status: string; ultimaSync: string | null; linhas: number; erro: string | null }>> {
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("meta_sync_jobs").select("ad_account_id,status,ultima_sync,linhas,erro").order("updated_at", { ascending: false });
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      contaId: String(r.ad_account_id), status: String(r.status ?? "?"),
      ultimaSync: (r.ultima_sync as string) ?? null, linhas: Number(r.linhas) || 0, erro: (r.erro as string) ?? null,
    }));
  } catch { return []; }
}
