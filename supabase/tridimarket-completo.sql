-- ═════════════════════════════════════════════════════════════════════════════
-- TridiMarket · SQL COMPLETO (Ajustes + Score + Nota→Estoque)
-- ═════════════════════════════════════════════════════════════════════════════
-- Rode no banco do TRIDIMARKET (projeto wcxhyludixozqloqzjpn), no SQL Editor do
-- Supabase. É IDEMPOTENTE: pode rodar quantas vezes quiser, não duplica nada e
-- não apaga dado nenhum. Cobre tudo o que os últimos recursos precisam:
--
--   1) market_settings        → regras globais (cheque especial, limites, etc.)
--   2) market_pessoa_score     → score de cada funcionário
--   3) market_worker_jobs      → fila da leitura de nota (o worker puxa daqui)
--   4) market_product_cost     → custo por produto (pro lucro = preço − custo)
--   5) bucket privado market-notas → onde a foto da nota fica (só o worker baixa)
--
-- O código do painel é tolerante: se você ainda não rodou, nada quebra — só
-- não salva Ajustes/score e o botão "Adicionar nota" avisa que falta o SQL.
-- ═════════════════════════════════════════════════════════════════════════════


-- 1) AJUSTES GLOBAIS (uma linha só, id = 1) ──────────────────────────────────
create table if not exists public.market_settings (
  id                     smallint      primary key default 1 check (id = 1),
  cheque_especial        boolean       not null default false,  -- libera saldo além do limite
  limite_extra           numeric(12,2) not null default 0,      -- quanto de cheque especial
  limite_padrao          numeric(12,2) not null default 500,    -- limite de quem não tem próprio
  bloquear_inadimplente  boolean       not null default false,  -- barra quem tem dívida vencida
  dias_inadimplencia     integer       not null default 30,     -- dias até uma dívida "vencer"
  updated_at             timestamptz   not null default now(),
  updated_by             uuid
);
insert into public.market_settings (id) values (1) on conflict (id) do nothing;


-- 2) SCORE POR FUNCIONÁRIO (usuarios_perfil.id) ──────────────────────────────
create table if not exists public.market_pessoa_score (
  employee_id  bigint       primary key,
  score        integer      not null default 0,
  manual       boolean      not null default false,  -- true = nota do gestor (congela o automático)
  updated_at   timestamptz  not null default now(),
  updated_by   uuid
);


-- 3) FILA DE TRABALHO DO WORKER (leitura de nota; genérica/extensível) ───────
create table if not exists public.market_worker_jobs (
  id           uuid         primary key default gen_random_uuid(),
  kind         text         not null default 'nota_ocr',
  status       text         not null default 'queued',
    -- queued → processing → done → confirmed | error | failed
  profile_id   uuid,                 -- unidade de destino do estoque
  company_id   integer,
  image_path   text,                 -- caminho no bucket privado market-notas
  result       jsonb,                -- itens extraídos
  error        text,
  attempts     integer      not null default 0,
  created_by   uuid,
  claimed_at   timestamptz,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);
create index if not exists market_worker_jobs_queue_idx
  on public.market_worker_jobs (status, created_at);


-- 4) CUSTO POR PRODUTO/UNIDADE (pro lucro = preço − custo) ───────────────────
create table if not exists public.market_product_cost (
  product_id  bigint        not null,
  profile_id  uuid          not null,
  custo       numeric(12,2) not null default 0,
  fonte       text,                  -- 'nota' | 'manual'
  updated_at  timestamptz   not null default now(),
  primary key (product_id, profile_id)
);


-- 5) BUCKET PRIVADO DAS IMAGENS DE NOTA ──────────────────────────────────────
-- Privado de propósito: só o worker baixa, por URL assinada de curta duração
-- gerada pelo servidor. A imagem não fica pública nem vai pro Claude.
insert into storage.buckets (id, name, public)
  values ('market-notas', 'market-notas', false)
  on conflict (id) do nothing;


-- ═════════════════════════════════════════════════════════════════════════════
-- Pronto. Sem RLS nas tabelas: o painel e o servidor acessam com a service_role.
-- O worker NÃO tem a service_role — ele fala só com o seu domínio, autenticado
-- por um token próprio (TRIDIMARKET_WORKER_TOKEN).
-- ═════════════════════════════════════════════════════════════════════════════
