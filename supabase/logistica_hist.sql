-- Histórico de contagens de logística (snapshot diário gravado pelo cron
-- /api/sync). Usado para o Δ "antes → agora" nos cards de Logística.
create table if not exists public.logistica_hist (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  counts jsonb not null
);
create index if not exists logistica_hist_at_idx on public.logistica_hist (at desc);

alter table public.logistica_hist enable row level security;
-- Sem policies = só o service_role grava/lê (o app usa service role no server).
