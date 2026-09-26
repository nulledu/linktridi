-- ─────────────────────────────────────────────────────────────────────────────
-- RH → CALENDÁRIO
-- ─────────────────────────────────────────────────────────────────────────────
-- Rode no SQL Editor do Supabase DEPOIS de `supabase/rh.sql` (usa a função
-- `rh_touch()` criada lá). Idempotente: pode reexecutar.
--
-- O que NÃO está aqui, de propósito:
--   • Aniversário — vem de `rh_fichas.data_nascimento`. Tabela própria seria
--     um segundo cadastro da mesma data, e os dois divergiriam.
--   • Feriado do piso (nacional/estadual/municipal calculado) — é código
--     (`lib/rh/calendario/feriados-base.ts`). Só o que veio da fonte externa
--     e o que o RH cadastra à mão ganham linha.
--
-- RLS ligada e sem política = deny-all. O app lê pelo service_role.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ── 1. Eventos: evento interno, data de setor, data comemorativa própria ─────
create table if not exists public.rh_calendario_eventos (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('evento', 'setor', 'comemorativa')),
  -- só para tipo = 'evento'
  categoria      text check (categoria in ('reuniao', 'treinamento', 'comemoracao', 'integracao', 'empresa', 'importante')),
  nome           text not null,
  descricao      text,
  observacoes    text,
  -- primeira ocorrência; `recorrencia = 'anual'` repete a partir deste ano
  dia            date not null,
  hora           time,
  hora_fim       time,
  setor          text,
  colaboradores  uuid[] not null default '{}',
  recorrencia    text not null default 'nenhuma' check (recorrencia in ('nenhuma', 'anual')),
  ativo          boolean not null default true,
  autor_id       uuid,
  autor_nome     text,
  created_by     uuid,
  updated_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- A leitura do ano varre por dia (evento único) e por recorrência (anual, sem
-- olhar o ano). Dois índices baratos cobrem os dois caminhos.
create index if not exists rh_calendario_eventos_dia on public.rh_calendario_eventos (dia) where ativo;
create index if not exists rh_calendario_eventos_anual on public.rh_calendario_eventos (recorrencia) where recorrencia = 'anual';

drop trigger if exists rh_calendario_eventos_touch on public.rh_calendario_eventos;
create trigger rh_calendario_eventos_touch before update on public.rh_calendario_eventos
  for each row execute function public.rh_touch();

alter table public.rh_calendario_eventos enable row level security;

-- ── 2. Feriados: o que veio da fonte externa e o que foi cadastrado à mão ────
create table if not exists public.rh_calendario_feriados (
  id           uuid primary key default gen_random_uuid(),
  dia          date not null,
  nome         text not null,
  esfera       text not null check (esfera in ('nacional', 'estadual', 'municipal')),
  origem       text not null check (origem in ('api', 'manual')),
  ativo        boolean not null default true,
  autor_nome   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (dia, nome)
);

create index if not exists rh_calendario_feriados_dia on public.rh_calendario_feriados (dia);

drop trigger if exists rh_calendario_feriados_touch on public.rh_calendario_feriados;
create trigger rh_calendario_feriados_touch before update on public.rh_calendario_feriados
  for each row execute function public.rh_touch();

alter table public.rh_calendario_feriados enable row level security;

-- ── 3. Carimbo da sincronização com a fonte externa, por ano ────────────────
-- É o que permite dizer na tela "atualizado em 12/09" ou "não foi possível
-- atualizar; os últimos dados continuam valendo" — e é o que decide quando
-- tentar de novo (30 dias) sem chamar a rede a cada carga de página.
create table if not exists public.rh_calendario_sync (
  ano            int primary key,
  fonte          text not null,
  atualizado_em  timestamptz,
  ok             boolean not null default false,
  erro           text,
  updated_at     timestamptz not null default now()
);

alter table public.rh_calendario_sync enable row level security;
