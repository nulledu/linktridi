-- ============================================================
--  Schema — Landing Page B2B
--  Execute no SQL Editor do Supabase após rodar schema.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Tabela: landing_configs
-- Armazena toda a configuração da LP como JSONB (cores, hero,
-- soluções). Uma única linha representa a config publicada.
-- ────────────────────────────────────────────────────────────
create table if not exists public.landing_configs (
  id          uuid primary key default gen_random_uuid(),
  config      jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- Row Level Security
-- ────────────────────────────────────────────────────────────
alter table public.landing_configs enable row level security;

-- Leitura pública (a landing page pública lê a config)
create policy "landing_configs_select_public"
  on public.landing_configs for select
  using (true);

-- Escrita apenas para usuários autenticados (admin)
create policy "landing_configs_insert_auth"
  on public.landing_configs for insert
  with check (auth.role() = 'authenticated');

create policy "landing_configs_update_auth"
  on public.landing_configs for update
  using (auth.role() = 'authenticated');

create policy "landing_configs_delete_auth"
  on public.landing_configs for delete
  using (auth.role() = 'authenticated');

-- ────────────────────────────────────────────────────────────
-- Nota: o bucket "media" criado em schema.sql já é reutilizado
-- para uploads de mídia da landing page (pasta landing/).
-- ────────────────────────────────────────────────────────────
