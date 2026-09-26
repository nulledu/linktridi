-- ─────────────────────────────────────────────────────────────────────────────
-- TridiFlow — projetos do tipo PÁGINA (landing / VSL / captura / obrigado)
-- ─────────────────────────────────────────────────────────────────────────────
-- Rode no MESMO banco do TridiFlow (o do supabase/tridiflow.sql).
--
-- ADITIVO e IDEMPOTENTE: pode rodar mais de uma vez. Nenhum dado atual muda —
-- todos os bots existentes viram tipo='flow' automaticamente (default), e o
-- comportamento dos fluxos conversacionais continua idêntico.
--
-- Por que a página mora na MESMA tabela dos fluxos (e não numa tabela nova):
-- o caminho público é (domínio + slug). Com tudo na mesma tabela, o unique
-- (dominio_id, slug) que já existe impede de graça que um fluxo e uma página
-- disputem o mesmo endereço. Em tabelas separadas isso viraria trigger. De
-- quebra, tridiflow_sessoes.bot_id continua valendo — analytics, leads,
-- webhook de lead e Meta CAPI funcionam sem duplicar nada.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Tipo do projeto + documento da página ───────────────────────────────────
alter table public.tridiflow_bots
  add column if not exists tipo   text  not null default 'flow',
  add column if not exists pagina jsonb not null default '{"versao":1,"secoes":[],"config":{}}'::jsonb;

do $$ begin
  alter table public.tridiflow_bots
    add constraint tridiflow_bots_tipo_chk check (tipo in ('flow','page'));
exception when duplicate_object then null; end $$;

create index if not exists tridiflow_bots_tipo_idx
  on public.tridiflow_bots (tipo, updated_at desc);

-- 2) Quem mexeu (exigência de auditoria: "registrar quem publicou ou alterou")
alter table public.tridiflow_bots
  add column if not exists atualizado_por uuid,
  add column if not exists publicado_por  uuid;

-- 2b) Arquivar: tira da lista sem excluir. Vale pros DOIS tipos de projeto —
-- campanha velha que ninguém quer apagar (o link publicado continua no ar até
-- despublicar; arquivar é organização da lista, não desativação).
alter table public.tridiflow_bots
  add column if not exists arquivado boolean not null default false;

-- 3) Unicidade REAL do caminho ───────────────────────────────────────────────
-- O unique(dominio_id, slug) que já existe NÃO cobre dominio_id IS NULL —
-- no Postgres NULL <> NULL, então hoje dois bots SEM domínio podem ter o mesmo
-- slug (o /f/<slug> serviria um deles por sorte). Com páginas entrando no mesmo
-- espaço de nomes isso vira colisão de verdade. Este índice fecha o buraco.
--
-- Se falhar por duplicidade, rode o SELECT do rodapé, renomeie os slugs
-- repetidos e execute de novo. NÃO apaga nada sozinho de propósito.
do $$ begin
  create unique index tridiflow_bots_caminho_uk
    on public.tridiflow_bots
       (coalesce(dominio_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
exception
  when duplicate_table  then null;
  when unique_violation then
    raise notice 'ATENCAO: ha slugs duplicados. Rode o SELECT do rodape, renomeie e reexecute este arquivo.';
end $$;

-- 4) Eventos da página (métricas de VSL/CTA/oferta) ──────────────────────────
-- tridiflow_sessoes só sabe "começou/terminou/última etapa" — serve pro chat,
-- não pra página, onde o que importa é 25%/50%/75% do vídeo, oferta vista e
-- clique no CTA. Tabela append-only, uma linha por evento.
create table if not exists public.tridiflow_eventos (
  id         bigserial   primary key,
  bot_id     uuid        not null references public.tridiflow_bots(id) on delete cascade,
  sessao_id  uuid,                                  -- liga em tridiflow_sessoes quando houver
  visitante  text,                                  -- id anônimo do navegador (localStorage)
  evento     text        not null,                  -- page_view | video_started | video_25 | … | cta_clicked | form_submitted
  url        text,
  utm        jsonb       not null default '{}',
  dispositivo text,                                 -- mobile | desktop
  meta       jsonb       not null default '{}',     -- extras do evento (ex.: id do bloco)
  criado_em  timestamptz not null default now()
);
create index if not exists tridiflow_eventos_bot_idx  on public.tridiflow_eventos (bot_id, criado_em desc);
create index if not exists tridiflow_eventos_tipo_idx on public.tridiflow_eventos (bot_id, evento);
-- Visitantes únicos por página sem varrer a tabela toda.
create index if not exists tridiflow_eventos_visit_idx on public.tridiflow_eventos (bot_id, visitante);

-- ─────────────────────────────────────────────────────────────────────────────
-- Diagnóstico de slugs duplicados (rode SÓ se o notice acima apareceu):
--
-- select coalesce(dominio_id,'00000000-0000-0000-0000-000000000000'::uuid) as dominio,
--        slug, count(*), array_agg(nome)
--   from public.tridiflow_bots
--  group by 1,2 having count(*) > 1;
-- ─────────────────────────────────────────────────────────────────────────────
