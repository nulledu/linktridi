-- Integração de Marketplaces (Mercado Livre, Shopee, TikTok Shop). Rode no Supabase NOVO.
-- Modelo: cada CONTA conectada guarda tokens; cada PEDIDO recebido (webhook/sync) cai aqui.

create table if not exists public.marketplace_contas (
  id uuid primary key default gen_random_uuid(),
  provider text not null,                 -- mercado_livre | shopee | tiktok_shop
  nome text,                              -- apelido da loja
  external_shop_id text,                  -- user_id (ML) / shop_id (Shopee/TikTok)
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  status text not null default 'desconectado',  -- conectado | desconectado | erro
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_shop_id)
);

create table if not exists public.marketplace_pedidos (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  conta_id uuid references public.marketplace_contas(id) on delete set null,
  external_id text not null,              -- nº do pedido no marketplace
  status text,                            -- pago | enviado | cancelado | ... (normalizado)
  status_raw text,
  valor numeric(12,2) not null default 0, -- total do pedido
  frete numeric(12,2) not null default 0,
  comprador text,
  itens jsonb,                            -- [{nome, qtd, preco}]
  raw jsonb,                              -- payload bruto do marketplace
  criado_em timestamptz,                  -- data do pedido no marketplace
  importado_em timestamptz not null default now(),
  pedido_ref text,                        -- vínculo ao pedido interno (quando integrado ao Comercial)
  unique (provider, external_id)
);
create index if not exists mp_pedidos_provider_idx on public.marketplace_pedidos (provider, criado_em desc);

-- Log de notificações cruas (auditoria/replay).
create table if not exists public.marketplace_webhooks (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  topico text,
  payload jsonb,
  processado boolean not null default false,
  erro text,
  created_at timestamptz not null default now()
);
