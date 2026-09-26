-- App do colaborador (tablet): foto na conclusão da atividade + pedidos de insumo.

-- 1) Foto que comprova o que foi produzido (URL no storage 'photos', já comprimida).
alter table if exists public.atividades
  add column if not exists foto_url text;

-- 2) Pedidos de insumo feitos pelo colaborador (ex.: almofada, tinta, etiqueta).
create table if not exists public.pedidos_insumos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null,
  colaborador_nome text,
  produto_nome text not null,
  quantidade int not null default 1,
  observacao text,
  status text not null default 'aberto',          -- aberto | atendido | cancelado
  atendido_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pedidos_insumos_colab_idx on public.pedidos_insumos (colaborador_id, created_at desc);
create index if not exists pedidos_insumos_status_idx on public.pedidos_insumos (status, created_at desc);

alter table public.pedidos_insumos enable row level security;
-- service_role (usado pelas rotas /api) ignora RLS; sem policies públicas.
