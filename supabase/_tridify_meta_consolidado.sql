-- ============================================================================
-- TRIDIFY / TRÁFEGO PAGO + META — SQL CONSOLIDADO (idempotente)
-- Junta as últimas implementações de Tráfego/Tridify e do warehouse da Meta.
-- Seguro rodar de uma vez e/ou várias vezes (if not exists / or replace /
-- add column if not exists). Dependências vêm antes de quem as usa.
-- Fonte: meta_warehouse.sql, meta_agregados.sql, meta_token.sql,
--        marketing_config.sql, trafego_gestao.sql, trafego_cache.sql,
--        trafego_snapshots.sql, trafego_anotacoes.sql
-- ============================================================================

-- gen_random_uuid() precisa do pgcrypto (padrão no Supabase; garante mesmo assim).
create extension if not exists pgcrypto;


-- ============================================================================
-- 1) WAREHOUSE DA META — insights diários por anúncio + jobs + logs
--    A tela lê DAQUI (rápido, filtrável); os jobs de sync gravam aqui.
-- ============================================================================

-- 1.1) Insights DIÁRIOS no nível de ANÚNCIO (grão mais fino).
create table if not exists public.meta_ad_insights_daily (
  ad_account_id   text not null,
  date            date not null,
  campaign_id     text not null default '',
  adset_id        text not null default '',
  ad_id           text not null default '',
  campaign_name   text,
  adset_name      text,
  ad_name         text,
  spend           numeric not null default 0,
  impressions     bigint  not null default 0,
  clicks          bigint  not null default 0,
  reach           bigint  not null default 0,   -- NÃO somar entre dias (deduplicado)
  purchases_meta      numeric not null default 0,
  purchase_value_meta numeric not null default 0,
  leads_meta      numeric not null default 0,
  currency        text,
  updated_at      timestamptz not null default now(),
  -- Chave composta: resincronizar um dia antigo faz UPSERT, nunca duplica.
  primary key (ad_account_id, date, campaign_id, adset_id, ad_id)
);

-- Etapas do funil (aditivo — nasceram depois da tabela). Garantidas ANTES da
-- função meta_totais_periodo, que as referencia.
alter table public.meta_ad_insights_daily add column if not exists lpv numeric not null default 0;              -- landing page view
alter table public.meta_ad_insights_daily add column if not exists add_to_cart numeric not null default 0;
alter table public.meta_ad_insights_daily add column if not exists initiate_checkout numeric not null default 0;
alter table public.meta_ad_insights_daily add column if not exists funnel_metrics_collected boolean;
alter table public.meta_ad_insights_daily add column if not exists video_metrics_collected boolean;
alter table public.meta_ad_insights_daily add column if not exists video_plays numeric;
alter table public.meta_ad_insights_daily add column if not exists video_views_2s numeric;
alter table public.meta_ad_insights_daily add column if not exists video_views_3s numeric;
alter table public.meta_ad_insights_daily add column if not exists video_views_25 numeric;
alter table public.meta_ad_insights_daily add column if not exists video_views_50 numeric;
alter table public.meta_ad_insights_daily add column if not exists video_views_75 numeric;
alter table public.meta_ad_insights_daily add column if not exists video_views_95 numeric;
alter table public.meta_ad_insights_daily add column if not exists video_views_100 numeric;
alter table public.meta_ad_insights_daily add column if not exists video_avg_watch_time numeric;
alter table public.meta_ad_insights_daily add column if not exists video_thruplays numeric;
-- Engajamento do criativo (supabase/criativo_engajamento.sql).
alter table public.meta_ad_insights_daily add column if not exists engagement_metrics_collected boolean;
alter table public.meta_ad_insights_daily add column if not exists post_reactions numeric;
alter table public.meta_ad_insights_daily add column if not exists post_comments numeric;
alter table public.meta_ad_insights_daily add column if not exists post_shares numeric;

create index if not exists meta_ins_conta_data on public.meta_ad_insights_daily (ad_account_id, date);
create index if not exists meta_ins_data on public.meta_ad_insights_daily (date);
create index if not exists meta_ins_campanha on public.meta_ad_insights_daily (campaign_id, date);
-- Índice que serve o filtro real das leituras (data + conta).
create index if not exists meta_ins_data_conta on public.meta_ad_insights_daily (date, ad_account_id);
create index if not exists meta_ins_data_ad on public.meta_ad_insights_daily (date, ad_id);

-- 1.2) Status de sincronização POR CONTA (o job é por conta/período).
create table if not exists public.meta_sync_jobs (
  ad_account_id   text primary key,
  status          text not null default 'ok',      -- ok | erro | rodando
  ultima_sync     timestamptz,
  periodo_de      date,
  periodo_ate     date,
  linhas          int not null default 0,
  duracao_ms      int,
  tentativas      int not null default 0,
  erro            text,                             -- mensagem + fbtrace_id
  updated_at      timestamptz not null default now()
);

-- 1.3) Log de execuções (diagnóstico: o que falhou, quando, com qual trace).
create table if not exists public.meta_sync_logs (
  id            uuid primary key default gen_random_uuid(),
  ad_account_id text,
  periodo_de    date,
  periodo_ate   date,
  ok            boolean not null,
  linhas        int not null default 0,
  duracao_ms    int,
  http_status   int,
  erro_code     text,
  erro_subcode  text,
  fbtrace_id    text,
  erro          text,
  created_at    timestamptz not null default now()
);
create index if not exists meta_sync_logs_conta on public.meta_sync_logs (ad_account_id, created_at desc);


-- ============================================================================
-- 2) AGREGAÇÃO NO POSTGRES — totais + funil numa passada só
--    Corrige totais truncados em 1000 linhas do PostgREST. Depende das colunas
--    do funil (lpv/add_to_cart/initiate_checkout) já garantidas acima.
-- ============================================================================

create or replace function public.meta_totais_periodo(
  p_since date,
  p_until date,
  p_contas text[] default null
)
returns table (
  spend numeric, impressions bigint, clicks bigint,
  purchases_meta numeric, purchase_value_meta numeric, leads_meta numeric,
  lpv numeric, add_to_cart numeric, initiate_checkout numeric,
  dias bigint, linhas bigint
)
language sql
stable
as $$
  select
    coalesce(sum(i.spend), 0),
    coalesce(sum(i.impressions), 0),
    coalesce(sum(i.clicks), 0),
    coalesce(sum(i.purchases_meta), 0),
    coalesce(sum(i.purchase_value_meta), 0),
    coalesce(sum(i.leads_meta), 0),
    coalesce(sum(i.lpv), 0),
    coalesce(sum(i.add_to_cart), 0),
    coalesce(sum(i.initiate_checkout), 0),
    count(distinct i.date),
    count(*)
  from public.meta_ad_insights_daily i
  where i.date between p_since and p_until
    and (p_contas is null or cardinality(p_contas) = 0 or i.ad_account_id = any(p_contas));
$$;


-- ============================================================================
-- 3) TRIDIFY · Registro de ações que mexem nas campanhas da Meta
--    Pausar/reativar/alterar orçamento = DINHEIRO REAL. Fica registrado.
-- ============================================================================

create table if not exists public.meta_acoes_campanha (
  id            uuid primary key default gen_random_uuid(),
  ad_account_id text not null,
  campaign_id   text not null,
  campaign_name text,
  acao          text not null,          -- pausar | ativar | orcamento
  valor_antes   text,                   -- status anterior, ou orçamento em centavos
  valor_depois  text,
  ok            boolean not null default true,
  erro          text,                   -- mensagem da Meta + fbtrace_id (sem token)
  -- Quem fez. Sem FK de propósito: se o colaborador for removido, o registro
  -- da ação PRECISA sobreviver.
  autor_id      uuid,
  autor_nome    text,
  created_at    timestamptz not null default now()
);

create index if not exists meta_acoes_campanha_camp on public.meta_acoes_campanha (campaign_id, created_at desc);
create index if not exists meta_acoes_campanha_data on public.meta_acoes_campanha (created_at desc);
create index if not exists meta_acoes_campanha_autor on public.meta_acoes_campanha (autor_id, created_at desc);

-- Ações valem p/ CONJUNTO (ad set) e ANÚNCIO também (aditivo).
alter table public.meta_acoes_campanha add column if not exists node_tipo text;   -- campaign | adset | ad
alter table public.meta_acoes_campanha add column if not exists node_id   text;
alter table public.meta_acoes_campanha add column if not exists node_name text;
create index if not exists meta_acoes_campanha_node on public.meta_acoes_campanha (node_id, created_at desc);


-- ============================================================================
-- 4) TOKEN META ADS (linha única id=1; só service_role acessa; RLS fecha resto)
-- ============================================================================

create table if not exists public.meta_token (
  id smallint primary key default 1,
  token text not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint meta_token_single check (id = 1)
);

alter table public.meta_token enable row level security;
-- Sem policies = ninguém via anon. O service_role ignora RLS.

-- Semente placeholder: só insere se a linha id=1 ainda não existir. TROQUE pelo
-- token real de 60 dias (o mesmo do .env.local) — deixar o placeholder faz a
-- Meta falhar. Se já existir linha, este insert não faz nada.
insert into public.meta_token (id, token, expires_at)
values (1, 'COLE_AQUI_O_TOKEN_DE_60_DIAS', null)
on conflict (id) do nothing;


-- ============================================================================
-- 5) CONFIG DE MARKETING — teto de gasto + classificação carimbo/chancela
-- ============================================================================

create table if not exists public.marketing_config (
  id  int primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.marketing_config (id, data)
values (1, '{"teto":0,"contas":{}}'::jsonb)
on conflict (id) do nothing;


-- ============================================================================
-- 6) CACHE DO PANORAMA DE TRÁFEGO (stale-while-revalidate a cada 1h)
--    ESTE É O QUE FALTAVA: sem ele todo cold start ressincroniza tudo.
-- ============================================================================

create table if not exists public.trafego_cache (
  chave      text primary key,          -- "<since>|<until>" (período)
  data       jsonb not null,            -- AdsOverview serializado
  updated_at timestamptz not null default now()
);


-- ============================================================================
-- 7) TRIDIFY · Snapshots (§5) — "fotografia" dos KPIs num momento
-- ============================================================================

create table if not exists public.trafego_snapshots (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  periodo     text,                            -- rótulo do período (ex.: "Últimos 7 dias")
  kpis        jsonb not null default '{}',      -- { spend, revenue, roas, purchases, cpa }
  autor_id    uuid,
  autor_nome  text,
  created_at  timestamptz not null default now()
);

create index if not exists trafego_snapshots_at on public.trafego_snapshots (created_at desc);


-- ============================================================================
-- 8) TRIDIFY · Anotações na timeline (§5) — o que explica a mudança nos números
-- ============================================================================

create table if not exists public.trafego_anotacoes (
  id          uuid primary key default gen_random_uuid(),
  dia         date not null default (now() at time zone 'America/Sao_Paulo')::date,
  tipo        text not null default 'outro',   -- orcamento | criativo | promocao | instabilidade | lancamento | outro
  texto       text not null,
  autor_id    uuid,
  autor_nome  text,
  created_at  timestamptz not null default now()
);

create index if not exists trafego_anotacoes_dia on public.trafego_anotacoes (dia desc, created_at desc);

-- ============================================================================
-- FIM. Rode inteiro no SQL editor do Supabase NOVO (projeto de produção).
-- Depois: UPDATE public.meta_token SET token='<token real de 60 dias>' WHERE id=1;
-- ============================================================================
