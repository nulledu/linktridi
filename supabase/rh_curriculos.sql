-- ─────────────────────────────────────────────────────────────────────────────
-- RH → CURRÍCULOS
-- ─────────────────────────────────────────────────────────────────────────────
-- Rode no SQL Editor do Supabase DEPOIS de `supabase/rh.sql` (usa a função
-- `rh_touch()` criada lá). Idempotente: pode reexecutar.
--
-- O MVP recebe candidatos de duas portas e guarda tudo numa tabela só:
--   • o formulário de candidatura fixo (/candidatura), copiado do quiz do
--     TridiFlow — 12 etapas, currículo no B2 (área privada `curriculos`);
--   • o webhook de lead de qualquer bot do TridiFlow (POST /api/candidatura/webhook
--     com o token gerado na tela de integração).
--
-- `respostas` é jsonb de propósito: pergunta nova no formulário ou no bot
-- entra sem coluna nova. `dados` guarda o que ainda não tem casa (campo extra,
-- utm, sessão de origem). `vaga_id` já existe para o dia em que Vagas virar
-- tela — hoje é só referência.
--
-- RLS ligada e sem política = deny-all. O app lê pelo service_role.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ── 1. Vagas — só a referência, o cadastro completo vem depois ──────────────
create table if not exists public.rh_vagas (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  setor       text,
  descricao   text,
  status      text not null default 'aberta' check (status in ('aberta', 'pausada', 'encerrada')),
  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists rh_vagas_touch on public.rh_vagas;
create trigger rh_vagas_touch before update on public.rh_vagas
  for each row execute function public.rh_touch();

alter table public.rh_vagas enable row level security;

-- ── 2. Candidatos ────────────────────────────────────────────────────────────
create table if not exists public.rh_candidatos (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  email          text,
  telefone       text,
  cidade         text,
  vaga_id        uuid references public.rh_vagas (id) on delete set null,
  status         text not null default 'novo'
                 check (status in ('novo', 'em_analise', 'pre_selecionado', 'entrevista', 'aprovado', 'reprovado', 'arquivado')),
  -- de onde veio: 'tridiflow' hoje; 'site', 'instagram', 'indicacao', 'indeed',
  -- 'linkedin', 'outro' quando essas portas existirem. Texto livre de
  -- propósito: origem nova não exige migração.
  origem         text not null default 'tridiflow',
  -- detalhe da origem: { fonte: 'formulario' | 'webhook', bot, bot_id, utm… }
  origem_detalhe jsonb not null default '{}'::jsonb,
  -- identificador na origem (ex.: 'tridiflow:<sessao_id>'). É o que impede o
  -- mesmo lead entrar duas vezes quando o webhook reenvia.
  externo_id     text,
  -- [{ chave, pergunta, resposta }] na ordem em que foram respondidas
  respostas      jsonb not null default '[]'::jsonb,
  -- { chave, url, nome, tipo, tamanho, enviado_em } ou null
  curriculo      jsonb,
  -- campos que ainda não têm coluna (conhece alguém, como conheceu, extras)
  dados          jsonb not null default '{}'::jsonb,
  recebido_em    timestamptz not null default now(),
  -- primeira vez que alguém do RH abriu o perfil — é o que apaga o "novo" do menu
  visto_em       timestamptz,
  visto_por      uuid,
  arquivado_em   timestamptz,
  -- reservado: quando "converter em colaborador" existir, aponta pra ficha
  colaborador_id uuid,
  updated_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists rh_candidatos_externo on public.rh_candidatos (externo_id) where externo_id is not null;
create index if not exists rh_candidatos_recebido on public.rh_candidatos (recebido_em desc);
create index if not exists rh_candidatos_status on public.rh_candidatos (status);
create index if not exists rh_candidatos_vaga on public.rh_candidatos (vaga_id);
create index if not exists rh_candidatos_novos on public.rh_candidatos (status) where status = 'novo' and visto_em is null;

drop trigger if exists rh_candidatos_touch on public.rh_candidatos;
create trigger rh_candidatos_touch before update on public.rh_candidatos
  for each row execute function public.rh_touch();

alter table public.rh_candidatos enable row level security;

-- ── 3. Observações internas — privadas, nunca vão ao candidato ───────────────
create table if not exists public.rh_candidato_observacoes (
  id            uuid primary key default gen_random_uuid(),
  candidato_id  uuid not null references public.rh_candidatos (id) on delete cascade,
  texto         text not null,
  autor_id      uuid,
  autor_nome    text,
  created_at    timestamptz not null default now()
);

create index if not exists rh_candidato_observacoes_cand on public.rh_candidato_observacoes (candidato_id, created_at desc);

alter table public.rh_candidato_observacoes enable row level security;

-- ── 4. Histórico — a linha do tempo do candidato ─────────────────────────────
create table if not exists public.rh_candidato_historico (
  id            uuid primary key default gen_random_uuid(),
  candidato_id  uuid not null references public.rh_candidatos (id) on delete cascade,
  tipo          text not null check (tipo in ('recebido', 'status', 'observacao', 'vaga', 'dados', 'curriculo', 'visto')),
  titulo        text not null,
  detalhe       text,
  dados         jsonb,
  autor_id      uuid,
  autor_nome    text,
  created_at    timestamptz not null default now()
);

create index if not exists rh_candidato_historico_cand on public.rh_candidato_historico (candidato_id, created_at desc);

alter table public.rh_candidato_historico enable row level security;

-- ── 5. Integração — uma linha só ─────────────────────────────────────────────
-- O token do webhook é guardado como HASH (sha256): a tela mostra só os
-- últimos 4 caracteres, e o valor inteiro aparece UMA vez, na hora de gerar.
create table if not exists public.rh_curriculos_config (
  id                     text primary key default 'unica' check (id = 'unica'),
  formulario_ativo       boolean not null default true,
  webhook_token_hash     text,
  webhook_token_dica     text,
  webhook_gerado_em      timestamptz,
  vaga_padrao_id         uuid references public.rh_vagas (id) on delete set null,
  ultima_recepcao_em     timestamptz,
  ultima_recepcao_fonte  text,
  ultimo_erro            text,
  ultimo_erro_em         timestamptz,
  updated_by             uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists rh_curriculos_config_touch on public.rh_curriculos_config;
create trigger rh_curriculos_config_touch before update on public.rh_curriculos_config
  for each row execute function public.rh_touch();

alter table public.rh_curriculos_config enable row level security;

insert into public.rh_curriculos_config (id) values ('unica') on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- v2 (18/09/2026) — formulário configurável, triagem e entrevista
-- ─────────────────────────────────────────────────────────────────────────────
-- Pode rodar junto com o resto ou sozinho depois: tudo é `if not exists`.
--
--  • rh_curriculos_config.formulario — a config do formulário (etapas,
--    perguntas, condições, textos, personagens). NULL = o padrão do código.
--  • rh_vagas.perguntas — perguntas específicas da vaga, que entram na etapa
--    "Conte um pouco mais" de quem se candidata pelo link dela.
--  • rh_candidatos.perfil — o resumo da triagem calculado na chegada
--    (ocupação, formação, experiência, disponibilidade, etiquetas). É o que o
--    cartão da lista mostra sem abrir as respostas.
--  • rh_candidatos.entrevista_em — a entrevista marcada no perfil.

alter table public.rh_curriculos_config add column if not exists formulario jsonb;
alter table public.rh_vagas add column if not exists perguntas jsonb not null default '[]'::jsonb;
alter table public.rh_candidatos add column if not exists perfil jsonb;
alter table public.rh_candidatos add column if not exists entrevista_em timestamptz;

create index if not exists rh_candidatos_entrevista on public.rh_candidatos (entrevista_em) where entrevista_em is not null;

-- O histórico ganha o tipo 'entrevista'.
alter table public.rh_candidato_historico drop constraint if exists rh_candidato_historico_tipo_check;
alter table public.rh_candidato_historico add constraint rh_candidato_historico_tipo_check
  check (tipo in ('recebido', 'status', 'observacao', 'vaga', 'dados', 'curriculo', 'visto', 'entrevista'));

-- ─────────────────────────────────────────────────────────────────────────────
-- v3 (18/09/2026) — painel de candidatos: Kanban, etapas configuráveis, tags
-- ─────────────────────────────────────────────────────────────────────────────
--  • `status` passa a guardar a ETAPA configurada (Configurações → Currículos
--    → Processo), então o CHECK de valores fixos sai. O app valida contra a
--    config; `arquivado` continua sendo o "fora do quadro".
--  • etapa_em — quando entrou na etapa atual (o "parado há N dias").
--  • tags — etiquetas postas à mão pelo RH.
--  • rh_curriculos_config.etapas_processo — as colunas do Kanban (NULL = padrão).

alter table public.rh_candidatos drop constraint if exists rh_candidatos_status_check;
alter table public.rh_candidatos add constraint rh_candidatos_status_check check (status ~ '^[a-z][a-z0-9_]{0,39}$');
alter table public.rh_candidatos add column if not exists etapa_em timestamptz;
alter table public.rh_candidatos add column if not exists tags text[] not null default '{}';
update public.rh_candidatos set etapa_em = coalesce(updated_at, recebido_em) where etapa_em is null;
alter table public.rh_curriculos_config add column if not exists etapas_processo jsonb;

create index if not exists rh_candidatos_tags on public.rh_candidatos using gin (tags);

alter table public.rh_candidato_historico drop constraint if exists rh_candidato_historico_tipo_check;
alter table public.rh_candidato_historico add constraint rh_candidato_historico_tipo_check
  check (tipo in ('recebido', 'status', 'observacao', 'vaga', 'dados', 'curriculo', 'visto', 'entrevista', 'tag'));
