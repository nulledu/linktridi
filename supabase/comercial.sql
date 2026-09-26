-- Módulo Comercial: pedidos lançados por vendedoras/marketing. Rodar no Supabase NOVO.
create table if not exists public.comercial_pedidos (
  id              uuid primary key default gen_random_uuid(),
  vendedor_id     uuid not null references public.profiles(id) on delete set null,
  vendedor_nome   text not null,
  cliente_nome    text not null,
  telefone        text,
  ocupacao        text,
  fonte           text not null,             -- facebook | yampi_laranja | yampi_verde | tiktok | instagram
  forma_pagamento text,
  dias_conversa   integer,                   -- dias de conversa p/ fechar
  valor_pedido    numeric not null default 0, -- valor dos produtos (sem frete)
  tipo_frete      text,
  valor_frete     numeric not null default 0,
  produtos        jsonb not null default '[]'::jsonb,  -- [{nome, qtd, valor}]
  data_venda      date not null default current_date,
  created_at      timestamptz not null default now()
);

create index if not exists comercial_data_idx on public.comercial_pedidos (data_venda desc);
create index if not exists comercial_vend_idx on public.comercial_pedidos (vendedor_id);
