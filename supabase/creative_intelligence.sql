-- TRIDIFY · Creative Intelligence Center
-- Migração idempotente e segura para bancos que já possuem o warehouse.

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

create index if not exists meta_ins_data_ad on public.meta_ad_insights_daily (date, ad_id);

comment on column public.meta_ad_insights_daily.funnel_metrics_collected is
  'true quando actions foi coletado nesta sincronização; null identifica histórico anterior à coleta explícita';
comment on column public.meta_ad_insights_daily.video_metrics_collected is
  'true quando a Meta devolveu ao menos uma métrica de vídeo; null identifica histórico anterior à migração';
