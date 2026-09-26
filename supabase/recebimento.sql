-- ── Recebimento de Produtos / Entrada de Materiais ───────────────────────────
-- Fluxo: alguém solicita → financeiro compra e registra (com códigos) → o pedido
-- vira uma COMPRA "aguardando entrega" → aparece no tablet e no dashboard →
-- quando chega, o responsável confirma no tablet (foto + checklist + quantidade)
-- → o estoque (estoque_itens) é atualizado; item criado se não existir.
-- Rode no Supabase NOVO (mesmo do estoque_itens / ponto).

-- Ordem de compra (uma linha por item comprado).
create table if not exists public.compras (
  id                   uuid primary key default gen_random_uuid(),
  item_nome            text not null,
  categoria            text,
  unidade              text not null default 'un',
  -- vínculo com o catálogo de estoque (se o item já existe lá).
  estoque_item_id      uuid references public.estoque_itens(id) on delete set null,

  quantidade_comprada  numeric(12,2) not null default 0,
  quantidade_recebida  numeric(12,2) not null default 0,

  fornecedor           text,
  preco_unit           numeric(12,2),
  preco_total          numeric(12,2),

  -- códigos da entrega (qualquer um pode existir ou não).
  codigo_rastreio      text,
  codigo_recebimento   text,
  nota_fiscal          text,
  pedido_ref           text,

  prioridade           text not null default 'normal'
                         check (prioridade in ('baixa','normal','alta','critica')),
  previsao_entrega     date,

  status               text not null default 'comprado'
                         check (status in ('solicitado','comprado','aguardando_entrega',
                                           'chegou_parcial','divergencia','recebido','cancelado')),
  foto_obrigatoria     boolean not null default true,

  solicitante          text,          -- quem pediu (nome livre)
  solicitante_id       uuid,          -- profile.id de quem pediu (p/ notificar)
  criado_por           text,          -- quem registrou a compra (financeiro)
  criado_por_id        uuid,          -- profile.id de quem registrou (p/ notificar)
  observacoes          text,

  comprado_em          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists compras_status_idx    on public.compras (status, prioridade desc, created_at desc);
create index if not exists compras_rastreio_idx   on public.compras (codigo_rastreio);

-- Evento de recebimento (uma compra pode ter vários — recebimento parcial).
create table if not exists public.recebimentos (
  id                   uuid primary key default gen_random_uuid(),
  compra_id            uuid not null references public.compras(id) on delete cascade,
  device_id            uuid,
  recebido_por         text,               -- quem conferiu/recebeu
  quantidade_recebida  numeric(12,2) not null default 0,
  correto              boolean not null default true,   -- false = divergência
  divergencia_motivo   text,               -- motivo rápido (quando correto=false)
  observacoes          text,
  foto_url             text,               -- foto dos itens recebidos (auditoria)
  -- checklist de conferência {produto_correto, quantidade_correta, embalagem_ok,
  -- bom_estado, nota_recebida, foto}.
  checklist            jsonb,
  local                text,
  created_at           timestamptz not null default now()
);
create index if not exists recebimentos_compra_idx on public.recebimentos (compra_id, created_at desc);

alter table public.compras       enable row level security;
alter table public.recebimentos  enable row level security;
-- Acesso só via service role nas rotas /api/* (RLS bloqueia o resto), igual ao
-- estoque_itens e ao ponto.

-- ── Seed de exemplo (idempotente) — 3 compras aguardando entrega p/ testar ────
insert into public.compras (item_nome, categoria, unidade, quantidade_comprada, fornecedor,
    codigo_rastreio, prioridade, status, comprado_em)
select * from (values
  ('Almofada N.3 Vermelha', 'Almofadas', 'un', 100, 'Feltros Brasil', 'BR123456789BR', 'alta', 'aguardando_entrega', now()),
  ('Cola silicone', 'Colas', 'cx', 20, 'Química Sul', 'AB987654321BR', 'normal', 'aguardando_entrega', now()),
  ('MDF 6mm', 'Insumos', 'ch', 50, 'Madeireira Central', null, 'critica', 'aguardando_entrega', now())
) as v(item_nome, categoria, unidade, quantidade_comprada, fornecedor, codigo_rastreio, prioridade, status, comprado_em)
where not exists (select 1 from public.compras);
