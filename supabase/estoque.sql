-- Movimentos de estoque (produção via atividades + ajustes manuais).
-- Base de quantidade vem do ERP; aqui só registramos as variações. Rodar no Supabase NOVO.
create table if not exists public.estoque_movimentos (
  id           uuid primary key default gen_random_uuid(),
  produto_id   integer not null,
  produto_nome text not null,
  delta        integer not null,            -- +produzido / -consumido
  motivo       text not null,               -- ex: "Produção: Montar carcaça"
  origem       text not null default 'manual', -- manual | atividade
  por_nome     text,
  created_at   timestamptz not null default now()
);

create index if not exists estoque_mov_prod_idx on public.estoque_movimentos (produto_id);
create index if not exists estoque_mov_created_idx on public.estoque_movimentos (created_at desc);

-- Vínculo de atividade com produto do estoque (produção contabiliza na conclusão).
alter table public.atividades add column if not exists produto_id   integer;
alter table public.atividades add column if not exists produto_nome text;
alter table public.atividades add column if not exists estoque_lancado boolean not null default false;
