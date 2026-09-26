-- ══════════════════════════════════════════════════════════════════════════════
-- TRIDIFY · Data warehouse local da Meta (SQL ÚNICO, idempotente)
-- Objetivo: parar de tratar a Meta API como banco. Os jobs de sync gravam AQUI;
-- o dashboard lê daqui (rápido, filtrável, sem depender do Graph).
-- ══════════════════════════════════════════════════════════════════════════════

-- 1) Insights DIÁRIOS no nível de ANÚNCIO (grão mais fino — dá pra somar por
--    conjunto, campanha e conta sem perder nada).
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
-- Etapas do funil (aditivo — rode de novo sem medo se já criou a tabela antes).
alter table public.meta_ad_insights_daily add column if not exists lpv numeric not null default 0;              -- landing page view
alter table public.meta_ad_insights_daily add column if not exists add_to_cart numeric not null default 0;
alter table public.meta_ad_insights_daily add column if not exists initiate_checkout numeric not null default 0;

-- Creative Intelligence. As colunas são ANULÁVEIS de propósito: linhas antigas
-- não possuem estas métricas e não podem parecer um zero real. Os marcadores
-- dizem se a família foi solicitada/coletada naquela sincronização.
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

create index if not exists meta_ins_conta_data on public.meta_ad_insights_daily (ad_account_id, date);
create index if not exists meta_ins_data on public.meta_ad_insights_daily (date);
create index if not exists meta_ins_campanha on public.meta_ad_insights_daily (campaign_id, date);
create index if not exists meta_ins_data_ad on public.meta_ad_insights_daily (date, ad_id);

-- 2) Status de sincronização POR CONTA (o job é por conta/período, não "tudo").
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

-- 3) Log de execuções (diagnóstico: o que falhou, quando, com qual trace).
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
