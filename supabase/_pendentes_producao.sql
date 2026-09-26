-- ============================================================================
-- CONSOLIDADO — todas as migrações pendentes das features de produção/tablet,
-- NA ORDEM CERTA (a tabela producao_modelos precisa existir antes de ser alterada).
-- Tudo idempotente (if not exists) → seguro rodar de uma vez / mais de uma vez.
-- Rodar no Supabase NOVO.
-- ============================================================================

-- 1) Tabela de MODELOS de produção editáveis (precisa vir antes das alterações nela).
create table if not exists public.producao_modelos (
  id           uuid primary key default gen_random_uuid(),
  produto      text not null,                         -- 'chancela' | 'cliche' | chave custom
  fase         integer not null default 1,
  categoria    text not null default '',
  tarefa       text not null,
  detalhe      text,
  por_meta     numeric not null default 1,
  controla_qtd boolean not null default true,
  produto_id   integer,
  produto_nome text,
  instrucoes   text,
  demo_url     text,
  ordem        integer not null default 0,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists producao_modelos_produto_idx on public.producao_modelos (produto, ordem);

-- 2) Ordens de produção v2: instruções + demo (gif/foto), aceite, tempo padrão 1h.
alter table public.atividades add column if not exists instrucoes text;
alter table public.atividades add column if not exists demo_url   text;
alter table public.atividades add column if not exists aceita_at  timestamptz;
alter table public.atividades add column if not exists tempo_estimado_min integer;
alter table public.atividades alter column tempo_estimado_min set default 60;

-- 3) Urgência (fura a fila + chama mais forte). Depende de producao_modelos existir.
alter table public.atividades       add column if not exists urgente boolean not null default false;
alter table public.producao_modelos add column if not exists urgente boolean not null default false;

-- 4) Multi-tablet por pessoa (em quais tablets de produção aparece).
alter table public.employees add column if not exists mesas text[];

-- 5) Tipo de dispositivo: 'producao' (mesa) | 'ponto' (bater ponto).
alter table public.devices                add column if not exists tipo text not null default 'producao';
alter table public.device_provision_codes add column if not exists tipo text not null default 'producao';
