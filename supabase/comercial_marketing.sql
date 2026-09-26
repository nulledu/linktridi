-- Lançamentos diários de marketing do Comercial: valor usado (gasto) + leads.
-- Uma linha por dia (upsert). Rodar no Supabase NOVO.
create table if not exists public.comercial_marketing (
  data        date primary key,
  valor_usado numeric not null default 0,   -- gasto manual do dia
  leads       integer not null default 0,   -- leads que chegaram no dia
  por_nome    text,
  updated_at  timestamptz not null default now()
);
