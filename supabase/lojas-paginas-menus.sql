-- ═════════════════════════════════════════════════════════════════════════════
-- PÁGINAS E MENUS DA LOJA
--
-- Rode este arquivo inteiro no SQL Editor do Supabase. É IDEMPOTENTE.
-- Depende de `supabase/lojas.sql`.
--
-- Antes disso, as duas telas abrem e AVISAM que falta rodar este arquivo; a
-- vitrine continua funcionando com o menu deduzido das categorias, que é o
-- comportamento de hoje.
--
-- ── Duas decisões que valem explicação ──────────────────────────────────────
--
-- 1. O ITEM DE MENU É jsonb, não tabela filha. A ORDEM é a informação — é ela
--    que a pessoa arrasta —, e ordem em tabela filha exige uma coluna `posicao`
--    reescrita inteira a cada arrastar. O menu nunca é lido sem os itens, então
--    não há ganho em separar. É a mesma razão de `loja_produtos.imagens` e de
--    `loja_pedidos.itens` serem jsonb.
--
-- 2. O `handle` é ÚNICO POR LOJA, não global. Duas lojas podem ter "sobre-nos",
--    e devem: o endereço é `/l/<loja>/p/<handle>`, então o conflito só existe
--    dentro da mesma vitrine.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Páginas ──────────────────────────────────────────────────────────────
create table if not exists public.loja_paginas (
  id            uuid primary key default gen_random_uuid(),
  loja_id       uuid not null references public.lojas(id) on delete cascade,
  titulo        text not null,
  handle        text not null,                  -- endereço: /l/<loja>/p/<handle>
  conteudo      text not null default '',       -- HTML simples, higienizado ao SAIR
  status        text not null default 'rascunho',  -- rascunho | publicada
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (loja_id, handle)
);

create index if not exists loja_paginas_loja on public.loja_paginas (loja_id, atualizado_em desc);

alter table public.loja_paginas enable row level security;
-- Sem política: o aplicativo lê com `service_role`. A página PÚBLICA é servida
-- pelo servidor, que já filtra por `status = 'publicada'` — rascunho não vaza
-- por não haver caminho de leitura anônima.

comment on table public.loja_paginas is
  'Páginas institucionais da vitrine (sobre, trocas, privacidade). Conteúdo é HTML do lojista, higienizado na renderização.';

-- `atualizado_em` por gatilho e não pelo aplicativo: a coluna existe pra
-- responder "quando isto mudou", e uma escrita que esqueça de setá-la faz a
-- listagem mentir. O banco é quem sabe quando a linha mudou.
create or replace function public.loja_paginas_carimbar()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists loja_paginas_carimbar on public.loja_paginas;
create trigger loja_paginas_carimbar
  before update on public.loja_paginas
  for each row execute function public.loja_paginas_carimbar();

-- ── 2. Menus ────────────────────────────────────────────────────────────────
create table if not exists public.loja_menus (
  id            uuid primary key default gen_random_uuid(),
  loja_id       uuid not null references public.lojas(id) on delete cascade,
  chave         text not null,                  -- principal | rodape | <livre>
  titulo        text not null,
  -- [{ "titulo": "Carimbos", "destino": "/c/carimbos" }, …] — a ordem do array
  -- É a ordem do menu.
  itens         jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now(),
  unique (loja_id, chave)
);

create index if not exists loja_menus_loja on public.loja_menus (loja_id);

alter table public.loja_menus enable row level security;

comment on table public.loja_menus is
  'Menus da vitrine. `itens` é jsonb porque a ORDEM é a informação — e ordem em tabela filha se reescreve inteira a cada arrastar.';

drop trigger if exists loja_menus_carimbar on public.loja_menus;
create trigger loja_menus_carimbar
  before update on public.loja_menus
  for each row execute function public.loja_paginas_carimbar();
