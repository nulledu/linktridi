-- ─────────────────────────────────────────────────────────────────────────────
-- TridiMarket · Nota do supermercado → estoque (worker self-hosted)
-- ─────────────────────────────────────────────────────────────────────────────
-- Rode no banco do TRIDIMARKET (wcxhyludixozqloqzjpn). Idempotente.
--
-- A imagem da nota NÃO vai pro Claude. Ela fica num bucket privado e só um
-- worker rodando num PC da empresa (ligado 24h) baixa e lê. O worker puxa
-- trabalho desta fila; o painel só enfileira e depois mostra o resultado pra
-- pessoa conferir antes de dar entrada no estoque.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Fila de trabalho do worker (genérica — hoje só 'nota_ocr', extensível). ──
create table if not exists public.market_worker_jobs (
  id           uuid         primary key default gen_random_uuid(),
  kind         text         not null default 'nota_ocr',
  status       text         not null default 'queued',
    -- queued → processing → done → confirmed | error | failed
  profile_id   uuid,                 -- unidade de destino do estoque
  company_id   integer,
  image_path   text,                 -- caminho no bucket privado market-notas
  result       jsonb,                -- itens extraídos {fonte, itens:[{nome,qtd,preco,...}]}
  error        text,
  attempts     integer      not null default 0,
  created_by   uuid,
  claimed_at   timestamptz,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

-- O worker pega "o mais antigo em queued": índice pra esse acesso.
create index if not exists market_worker_jobs_queue_idx
  on public.market_worker_jobs (status, created_at);

-- 2) Custo por produto/unidade — pra aparecer o LUCRO (preço − custo). ────────
create table if not exists public.market_product_cost (
  product_id  bigint       not null,
  profile_id  uuid         not null,
  custo       numeric(12,2) not null default 0,
  fonte       text,                  -- 'nota' | 'manual'
  updated_at  timestamptz  not null default now(),
  primary key (product_id, profile_id)
);

-- 3) Bucket privado das imagens de nota. Privado de propósito: só o worker
--    baixa, via URL assinada de curta duração gerada pelo servidor.
insert into storage.buckets (id, name, public)
  values ('market-notas', 'market-notas', false)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Sem RLS nas tabelas: o painel e o worker acessam com a service_role. O worker
-- NÃO recebe a service_role — ele fala só com o seu domínio, autenticado por um
-- token próprio (TRIDIMARKET_WORKER_TOKEN), e é o servidor que toca no banco.
-- ─────────────────────────────────────────────────────────────────────────────
