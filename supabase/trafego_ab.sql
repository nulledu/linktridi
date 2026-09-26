-- ══════════════════════════════════════════════════════════════════════════════
-- TRIDIFY · Teste A/B (smart link divisor) — SQL idempotente
-- Um link só (/ab/<slug>) divide o tráfego entre variantes (ex.: IG DM × TikTok),
-- registra o clique por variante e mede conversão. Roda no Supabase NOVO.
-- Tolerante: o código não quebra se as tabelas não existirem.
-- ══════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- 1) O teste + suas variantes (destinos). variantes = [{id,nome,url,peso}].
create table if not exists public.trafego_ab_testes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  slug       text not null unique,                -- path do link público /ab/<slug>
  variantes  jsonb not null default '[]'::jsonb,   -- [{ id, nome, url, peso }]
  ativo      boolean not null default true,
  autor_id   uuid,
  autor_nome text,
  created_at timestamptz not null default now()
);

-- 2) Cada CLIQUE no link (uma linha por visita). visitante = cookie (sticky:
--    o mesmo visitante cai sempre na mesma variante).
create table if not exists public.trafego_ab_visitas (
  id          uuid primary key default gen_random_uuid(),
  teste_id    uuid not null,
  variante_id text not null,
  visitante   text,                               -- cookie (atribuição grudada)
  device      text,                               -- mobile | desktop | tablet
  referrer    text,
  created_at  timestamptz not null default now()
);
create index if not exists trafego_ab_visitas_teste on public.trafego_ab_visitas (teste_id, created_at desc);
create index if not exists trafego_ab_visitas_var   on public.trafego_ab_visitas (teste_id, variante_id);

-- 3) Conversões (vendas) por variante. origem = 'manual' (você registra a venda
--    fechada no DM) ou 'utm' (atribuída automática quando a tag chega no checkout).
create table if not exists public.trafego_ab_conversoes (
  id          uuid primary key default gen_random_uuid(),
  teste_id    uuid not null,
  variante_id text not null,
  valor       numeric,                            -- R$ (opcional)
  origem      text not null default 'manual',     -- manual | utm
  autor_nome  text,
  created_at  timestamptz not null default now()
);
create index if not exists trafego_ab_conversoes_teste on public.trafego_ab_conversoes (teste_id, created_at desc);
