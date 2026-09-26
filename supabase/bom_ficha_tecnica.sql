-- BOM Fase 1 — ficha técnica + tipo de item + setor responsável. Rode no Supabase NOVO.

-- Tipo do item (árvore de produção) e setor que produz/repõe.
alter table public.estoque_itens add column if not exists tipo_item text;        -- Produto personalizado | Produto padrão | Peça montada | Componente | Matéria-prima
alter table public.estoque_itens add column if not exists setor_responsavel text; -- Máquinas | Montagem de Peças | Montagem Final | Estoque / Compras

-- Migração leve a partir do tipo antigo (componente/peca/produto).
update public.estoque_itens set tipo_item = 'Componente'   where tipo_item is null and tipo = 'componente';
update public.estoque_itens set tipo_item = 'Peça montada' where tipo_item is null and tipo = 'peca';
update public.estoque_itens set tipo_item = 'Produto padrão' where tipo_item is null and tipo = 'produto';

-- Ficha técnica: "item_id USA quantidade DE componente_id".
create table if not exists public.ficha_tecnica (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.estoque_itens(id) on delete cascade,
  componente_id uuid not null references public.estoque_itens(id) on delete cascade,
  quantidade numeric(12,3) not null default 1,
  created_at timestamptz not null default now(),
  unique (item_id, componente_id)
);
create index if not exists ficha_tecnica_item_idx on public.ficha_tecnica (item_id);
