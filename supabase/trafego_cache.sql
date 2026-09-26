-- Cache persistente do panorama de Tráfego Pago (Meta Ads).
-- O cálculo é caro (dezenas de chamadas ao Graph API); guardamos o resultado por
-- período e servimos na hora, atualizando ao fundo a cada 1h (stale-while-
-- revalidate no lib/meta-ads.ts). Sobrevive a cold start — "deixa carregado".
-- Rodar no Supabase NOVO (tzariztovuuwyeoogbxg).
create table if not exists public.trafego_cache (
  chave      text primary key,          -- "<since>|<until>" (período)
  data       jsonb not null,            -- AdsOverview serializado
  updated_at timestamptz not null default now()
);
