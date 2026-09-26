-- ══════════════════════════════════════════════════════════════════════════════
-- MARKETING · STORIES (rodar 1x; idempotente — pode rodar de novo)
--
-- O quadro do Miro virou tabela: um story por linha, com a mídia no B2 (área
-- `stories/`; o banco guarda só /api/arquivos/<chave>), o instante em que foi
-- ao ar, o que vendia e os dois números anotados à mão — cliques no link e
-- vendas. A conversão NÃO é digitada: é coluna gerada (vendas ÷ cliques × 100).
--
-- Produto é o MESMO cadastro da Biblioteca de Criativos
-- (marketing_criativos_produtos). A criação dele se repete aqui, idêntica à de
-- marketing_criativos_ano_variacao.sql, pra este arquivo rodar sozinho onde
-- aquele ainda não rodou. `if not exists` + `on conflict` = não duplica nada.
--
-- origem/externo_id são o gancho da integração com o Instagram: hoje tudo
-- nasce 'manual'; quando a Meta entrar, o story importado chega com o id dele
-- e o índice único impede importar o mesmo story duas vezes.
--
-- RLS ligado e SEM política: o app lê e grava com a service_role (que ignora
-- RLS), e a chave anônima não enxerga nada — igual às outras tabelas do
-- Marketing.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Produtos (o cadastro da Biblioteca) ──────────────────────────────────────
create table if not exists public.marketing_criativos_produtos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  tag         text not null,                 -- CRB, CH… (MAIÚSCULO, sem chaves)
  criador_nome text,
  created_at  timestamptz not null default now()
);
create unique index if not exists marketing_criativos_produtos_nome on public.marketing_criativos_produtos (lower(nome));
create unique index if not exists marketing_criativos_produtos_tag  on public.marketing_criativos_produtos (tag);

insert into public.marketing_criativos_produtos (nome, tag) values
  ('Carimbo', 'CRB'),
  ('Chancela', 'CH')
on conflict do nothing;

-- ── Stories ──────────────────────────────────────────────────────────────────
create table if not exists public.marketing_stories (
  id           uuid primary key default gen_random_uuid(),
  publicado_em timestamptz not null,
  status       text not null default 'publicado'
               check (status in ('planejado', 'publicado', 'encerrado')),

  midia_url    text,                         -- /api/arquivos/stories/aaaa/mm/<uuid>.<ext>
  midia_tipo   text check (midia_tipo in ('imagem', 'video')),
  capa_url     text,                         -- miniatura de ~540 px (o que o quadro desenha)
  largura      integer,
  altura       integer,
  duracao      numeric(6,1),                 -- segundos, só vídeo
  hash_visual  text,                         -- dHash 64 bits da miniatura (16 hex): "mesma arte"

  produto_id   uuid references public.marketing_criativos_produtos (id) on delete set null,
  tipo         text,                         -- oferta, produto, prova_social… (lib/marketing-stories/tipos.ts)
  campanha     text,
  tema         text,
  cta          text,
  link_url     text,

  cliques      integer not null default 0 check (cliques >= 0),
  vendas       integer not null default 0 check (vendas >= 0),
  conversao    numeric generated always as
                 (case when cliques > 0 then round(vendas::numeric * 100 / cliques, 2) end) stored,

  observacoes  text,
  origem       text not null default 'manual',
  externo_id   text,
  criador_id   uuid,
  criador_nome text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists marketing_stories_publicado_em on public.marketing_stories (publicado_em desc);
create index if not exists marketing_stories_produto      on public.marketing_stories (produto_id, publicado_em desc);
create unique index if not exists marketing_stories_externo
  on public.marketing_stories (origem, externo_id) where externo_id is not null;

-- updated_at de verdade: o app não precisa lembrar de mandar.
create or replace function public.marketing_stories_carimbo() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists marketing_stories_carimbo on public.marketing_stories;
create trigger marketing_stories_carimbo
  before update on public.marketing_stories
  for each row execute function public.marketing_stories_carimbo();

alter table public.marketing_stories enable row level security;
