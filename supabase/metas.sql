-- Sistema de Metas por setor (diária/semanal/mensal). Rodar no Supabase NOVO.
create table if not exists public.metas (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null,
  metrica       text not null,        -- key do catálogo (vetores, fabricados, ...)
  periodicidade text not null,        -- diaria | semanal | mensal
  alvo          integer not null check (alvo > 0),
  setor         text,
  ativo         boolean not null default true,
  por_nome      text,
  created_at    timestamptz not null default now()
);

create index if not exists metas_ativo_idx on public.metas (ativo);
