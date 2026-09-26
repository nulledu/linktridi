-- Atividades em POOL por setor (modelo Uber: caem pro funcionário livre). Rode no Supabase NOVO.
-- A atividade do pool nasce SEM dono (para_id vazio) + com setor; o tablet "claima".

alter table public.atividades add column if not exists setor text;            -- setor do pool (Produção, etc.)
alter table public.atividades alter column para_id drop not null;             -- pool = sem dono ainda
alter table public.atividades add column if not exists pool boolean default false; -- true = entrou no pool/auto-distribui

-- claimed_at ajuda a auditar/expirar reivindicações órfãs (tablet sumiu no meio).
alter table public.atividades add column if not exists claimed_at timestamptz;

create index if not exists atividades_pool_idx on public.atividades (setor, status, pool, created_at);
