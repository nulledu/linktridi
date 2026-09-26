-- ── Comercial: pedidos puxados automaticamente do ERP por responsável ──────
-- Em vez de lançar pedido na mão, o sistema lista os pedidos do ERP vinculados
-- aos responsáveis escolhidos (ex.: Letícia Valentim). Campos extras (dias de
-- conversa, fonte do lead) ficam aqui, atrelados ao id do pedido do ERP.

-- Quem o sistema puxa automaticamente (responsavel_id do ERP).
create table if not exists public.comercial_responsaveis (
  user_id     text primary key,           -- responsavel_id no ERP (uuid em texto)
  nome        text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Campos extras por pedido (preenchidos pela vendedora no painel).
create table if not exists public.comercial_pedido_extra (
  pedido_ref     text primary key,         -- id do pedido no ERP (em texto)
  dias_conversa  int,
  fonte          text,
  ocupacao       text,
  updated_at     timestamptz not null default now()
);
alter table public.comercial_pedido_extra add column if not exists ocupacao text;

alter table public.comercial_responsaveis enable row level security;
alter table public.comercial_pedido_extra enable row level security;

-- Seed: Letícia Valentim (todos os pedidos dela entram automaticamente).
insert into public.comercial_responsaveis (user_id, nome) values
  ('064c8ce2-789d-45c8-97d0-00cbb1f18506', 'Letícia Valentim')
on conflict (user_id) do nothing;
