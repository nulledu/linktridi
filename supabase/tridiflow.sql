-- TridiFlow — construtor de chatbots de venda. Rode no Supabase NOVO.
-- Bot = JSON serializável (groups/edges/variables) + tema + settings.
-- `fluxo` é o rascunho (auto-save); `published` é o snapshot congelado no publicar.

create table if not exists public.tridiflow_dominios (
  id          uuid primary key default gen_random_uuid(),
  host        text not null unique,          -- ex.: chat.carimbostridi.com
  verificado  boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.tridiflow_bots (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  slug        text not null,                 -- caminho público: /f/<slug>
  dominio_id  uuid references public.tridiflow_dominios(id) on delete set null,
  status      text not null default 'rascunho',   -- rascunho | publicado
  pasta       text,                          -- organização por coleção
  fluxo       jsonb not null default '{"groups":[],"edges":[],"variables":[]}',
  theme       jsonb not null default '{}',
  settings    jsonb not null default '{}',
  published   jsonb,                         -- snapshot do publicar (fluxo+theme+settings)
  published_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (dominio_id, slug)
);
create index if not exists tridiflow_bots_slug_idx on public.tridiflow_bots (slug);

-- Sessões do player público (uma por visitante que abre o bot).
create table if not exists public.tridiflow_sessoes (
  id           uuid primary key default gen_random_uuid(),
  bot_id       uuid not null references public.tridiflow_bots(id) on delete cascade,
  iniciada_em  timestamptz not null default now(),
  concluida_em timestamptz,
  ultima_etapa text,                         -- id do grupo onde parou (drop-off)
  utm          jsonb not null default '{}',  -- utm_*, fbclid, ttclid…
  respostas    jsonb not null default '{}'   -- variável → valor (lead)
);
create index if not exists tridiflow_sessoes_bot_idx on public.tridiflow_sessoes (bot_id, iniciada_em desc);
