-- ═════════════════════════════════════════════════════════════════════════════
-- CRIADOR DE LOJAS — /lojas
--
-- Rode este arquivo inteiro no SQL Editor do Supabase. Ele é IDEMPOTENTE: pode
-- rodar de novo sem apagar nada e sem quebrar se metade já existir.
--
-- Antes disso o módulo funciona com dados de exemplo e as telas avisam que não
-- gravam. Depois disso ele passa a gravar de verdade, sem nenhuma outra
-- mudança no app.
--
-- Quatro decisões que valem explicação:
--
-- 1. `imagens` é jsonb e não uma tabela filha. A ordem É a informação (a
--    primeira é a capa da vitrine), e ordem em tabela filha exige uma coluna
--    `posicao` que precisa ser reescrita inteira a cada arrastar. O produto
--    nunca é lido sem as fotos, então não há ganho em separar.
--
-- 2. `loja_pedidos.itens` também é jsonb, e isso é DELIBERADO: o pedido
--    congela título e preço unitário do momento da compra. Se apontasse pro
--    produto por referência, renomear ou reajustar um produto reescreveria o
--    histórico de vendas — a nota fiscal de março passaria a dizer outro preço.
--
-- 3. `numero` é max+1 por loja, com UNIQUE, e não uma sequence. Sequence é
--    global e deixaria buraco entre lojas ("#1" e depois "#57"); o UNIQUE é
--    quem garante a corrida, não o SELECT.
--
-- 4. O endereço da loja NÃO ganha tabela nova: entra como uma coluna em
--    `tridiflow_dominios`, o cadastro de endereços que já existe. Endereço é do
--    sistema, não do módulo — dois cadastros deixariam o mesmo host apontado em
--    dois lugares sem um saber do outro.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Lojas ────────────────────────────────────────────────────────────────
create table if not exists public.lojas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  slug        text not null unique,          -- caminho público: /l/<slug>
  status      text not null default 'rascunho',
  -- Cor de destaque. Guarda cor CSS (token ou hex): o painel pinta com ela nos
  -- dois temas, e hex calibrado no escuro reprova em contraste no claro.
  cor         text not null default 'var(--primary-texto)',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

do $$ begin
  alter table public.lojas add constraint lojas_status_chk
    check (status in ('rascunho', 'publicada', 'pausada'));
exception when duplicate_object then null; end $$;

-- ── 2. Produtos ─────────────────────────────────────────────────────────────
create table if not exists public.loja_produtos (
  id                 uuid primary key default gen_random_uuid(),
  loja_id            uuid not null references public.lojas(id) on delete cascade,
  titulo             text not null,
  descricao          text not null default '',
  imagens            jsonb not null default '[]'::jsonb,   -- [{id,url,alt}] — [0] é a capa
  preco              numeric(12,2) not null,
  preco_promocional  numeric(12,2),
  custo              numeric(12,2),                        -- confidencial: não vai pra vitrine
  estoque            integer not null default 0,
  vender_sem_estoque boolean not null default false,
  sku                text not null default '',
  codigo_barras      text not null default '',
  categorias         text[] not null default '{}',
  status             text not null default 'rascunho',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

do $$ begin
  alter table public.loja_produtos add constraint loja_produtos_status_chk
    check (status in ('ativo', 'rascunho', 'inativo'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.loja_produtos add constraint loja_produtos_preco_chk
    check (preco >= 0);
exception when duplicate_object then null; end $$;

-- Promoção que não desconta não é promoção. A validação já existe na tela
-- (lib/lojas.ts), mas quem escreve no banco nem sempre passa pela tela — a
-- importação em massa e o SQL Editor entram por aqui.
do $$ begin
  alter table public.loja_produtos add constraint loja_produtos_promo_chk
    check (preco_promocional is null or preco_promocional < preco);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.loja_produtos add constraint loja_produtos_estoque_chk
    check (estoque >= 0);
exception when duplicate_object then null; end $$;

create index if not exists loja_produtos_loja_idx
  on public.loja_produtos (loja_id, updated_at desc);

-- SKU é único DENTRO da loja, e só quando existe: duas lojas podem usar o mesmo
-- código, e produto sem SKU não pode colidir com outro sem SKU.
create unique index if not exists loja_produtos_sku_idx
  on public.loja_produtos (loja_id, sku) where sku <> '';

-- ── 3. Pedidos ──────────────────────────────────────────────────────────────
create table if not exists public.loja_pedidos (
  id          uuid primary key default gen_random_uuid(),
  loja_id     uuid not null references public.lojas(id) on delete cascade,
  numero      integer not null,                      -- o que o cliente vê: "#1042"
  cliente     text not null,
  itens       jsonb not null default '[]'::jsonb,    -- congelado na compra (ver cabeçalho)
  total       numeric(12,2) not null default 0,
  pagamento   text not null default 'pendente',
  envio       text not null default 'nao_enviado',
  feito_em    timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (loja_id, numero)
);

do $$ begin
  alter table public.loja_pedidos add constraint loja_pedidos_pagamento_chk
    check (pagamento in ('pago', 'pendente', 'estornado'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.loja_pedidos add constraint loja_pedidos_envio_chk
    check (envio in ('nao_enviado', 'preparando', 'enviado', 'entregue'));
exception when duplicate_object then null; end $$;

create index if not exists loja_pedidos_loja_idx
  on public.loja_pedidos (loja_id, feito_em desc);

-- ── 4. Endereço da loja ─────────────────────────────────────────────────────
-- Coluna no cadastro que já existe. `if not exists` porque este arquivo pode
-- rodar antes ou depois do supabase/tridiflow.sql; se a tabela ainda não
-- existir, o bloco não faz nada e o arquivo segue — rode o tridiflow.sql e
-- rode este de novo.
do $$ begin
  if to_regclass('public.tridiflow_dominios') is not null then
    alter table public.tridiflow_dominios
      add column if not exists loja_id uuid references public.lojas(id) on delete set null;
    create index if not exists tridiflow_dominios_loja_idx
      on public.tridiflow_dominios (loja_id) where loja_id is not null;
  end if;
end $$;

-- ── 5. `updated_at` que se mantém sozinho ───────────────────────────────────
-- Em gatilho e não na aplicação: quem escreve pelo SQL Editor ou por uma
-- importação também precisa carimbar, e essas nunca passam pelo código do app.
create or replace function public.lojas_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists lojas_touch_trg          on public.lojas;
drop trigger if exists loja_produtos_touch_trg  on public.loja_produtos;
drop trigger if exists loja_pedidos_touch_trg   on public.loja_pedidos;

create trigger lojas_touch_trg         before update on public.lojas
  for each row execute function public.lojas_touch();
create trigger loja_produtos_touch_trg before update on public.loja_produtos
  for each row execute function public.lojas_touch();
create trigger loja_pedidos_touch_trg  before update on public.loja_pedidos
  for each row execute function public.lojas_touch();

-- ── 6. RLS ──────────────────────────────────────────────────────────────────
-- Ligada e SEM policy, de propósito. O app inteiro lê e escreve com
-- `service_role`, que passa por cima da RLS; a chave anônima não passa. Ou
-- seja: ligar aqui não tira nada do ERP e fecha a porta de fora.
--
-- A vitrine pública (/l/<slug>) também NÃO precisa de policy: ela é renderizada
-- no servidor, com service_role, e filtra o que pode aparecer na própria
-- consulta (loja `publicada`, produto `ativo`, e nunca a coluna `custo`). Só
-- crie policy se um dia o navegador for falar direto com o Supabase — e aí ela
-- é de LEITURA e só do que está publicado.
alter table public.lojas         enable row level security;
alter table public.loja_produtos enable row level security;
alter table public.loja_pedidos  enable row level security;
