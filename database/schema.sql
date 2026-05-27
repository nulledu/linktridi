-- ============================================================
--  Schema — Profile Link App
--  Execute no SQL Editor do Supabase (Database > SQL Editor)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Extensões
-- ────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- 2. Tabela: profiles
-- ────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id               uuid primary key default gen_random_uuid(),
  username         text not null unique,
  full_name        text not null default '',
  bio              text not null default '',
  avatar_url       text not null default '',
  followers_count  integer not null default 0 check (followers_count >= 0),
  following_count  integer not null default 0 check (following_count >= 0),
  posts_count      integer not null default 0 check (posts_count >= 0),
  instagram_url    text,
  tiktok_url       text,
  updated_at       timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- 3. Tabela: posts
-- ────────────────────────────────────────────────────────────
create table if not exists public.posts (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  type             text not null check (type in ('image', 'video')),
  media_url        text not null,
  thumbnail_url    text,
  destination_url  text not null,
  caption          text,
  order_index      integer not null default 0,
  is_published     boolean not null default false,
  created_at       timestamptz not null default now(),
  -- Campos do card de produto
  badge            text,
  price_prefix     text,
  price            numeric(10,2),
  price_suffix     text,
  cta_label        text
);

create index if not exists posts_profile_published_order
  on public.posts (profile_id, is_published, order_index);

-- ────────────────────────────────────────────────────────────
-- 4. Row Level Security
-- ────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.posts     enable row level security;

-- profiles: leitura pública, escrita apenas autenticado
create policy "profiles_select_public"
  on public.profiles for select
  using (true);

create policy "profiles_update_auth"
  on public.profiles for update
  using (auth.role() = 'authenticated');

-- posts: leitura pública (apenas publicados), escrita apenas autenticado
create policy "posts_select_public"
  on public.posts for select
  using (is_published = true);

create policy "posts_select_auth"
  on public.posts for select
  using (auth.role() = 'authenticated');

create policy "posts_insert_auth"
  on public.posts for insert
  with check (auth.role() = 'authenticated');

create policy "posts_update_auth"
  on public.posts for update
  using (auth.role() = 'authenticated');

create policy "posts_delete_auth"
  on public.posts for delete
  using (auth.role() = 'authenticated');

-- ────────────────────────────────────────────────────────────
-- 5. Storage bucket "media" (imagens e vídeos)
-- ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  52428800,   -- 50 MB
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do nothing;

-- Leitura pública dos arquivos no bucket
create policy "media_storage_select_public"
  on storage.objects for select
  using (bucket_id = 'media');

-- Upload apenas para usuários autenticados
create policy "media_storage_insert_auth"
  on storage.objects for insert
  with check (bucket_id = 'media' and auth.role() = 'authenticated');

create policy "media_storage_update_auth"
  on storage.objects for update
  using (bucket_id = 'media' and auth.role() = 'authenticated');

create policy "media_storage_delete_auth"
  on storage.objects for delete
  using (bucket_id = 'media' and auth.role() = 'authenticated');

-- ────────────────────────────────────────────────────────────
-- 6. Dado inicial de exemplo (remova se preferir começar vazio)
-- ────────────────────────────────────────────────────────────
insert into public.profiles (username, full_name, bio, followers_count, following_count, posts_count)
values (
  'seu_usuario',
  'Seu Nome Completo',
  'Bem-vindo ao meu perfil! 🛍️' || chr(10) || 'Produtos favoritos e links exclusivos.',
  1200,
  480,
  0
)
on conflict (username) do nothing;
