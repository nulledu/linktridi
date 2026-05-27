-- ============================================================
--  Schema — Vitrine / Catálogo de Vendas
--  Execute no SQL Editor do Supabase após landing_schema.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Tabela: store_configs
-- Toda a configuração da loja (cores, hero, produtos) em JSONB
-- ────────────────────────────────────────────────────────────
create table if not exists public.store_configs (
  id          uuid primary key default gen_random_uuid(),
  config      jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- Row Level Security
-- ────────────────────────────────────────────────────────────
alter table public.store_configs enable row level security;

create policy "store_configs_select_public"
  on public.store_configs for select
  using (true);

create policy "store_configs_insert_auth"
  on public.store_configs for insert
  with check (auth.role() = 'authenticated');

create policy "store_configs_update_auth"
  on public.store_configs for update
  using (auth.role() = 'authenticated');

create policy "store_configs_delete_auth"
  on public.store_configs for delete
  using (auth.role() = 'authenticated');

-- ────────────────────────────────────────────────────────────
-- Nota: reutiliza o bucket "media" de schema.sql.
-- Uploads da loja são salvos em storage/media/store/
-- ────────────────────────────────────────────────────────────
