-- ─────────────────────────────────────────────────────────────────────────────
-- RH → JORNADA: feriado que vale no Ponto + compensações
-- ─────────────────────────────────────────────────────────────────────────────
-- Rode no SQL Editor do Supabase DEPOIS de `supabase/rh.sql` (usa a função
-- `rh_touch()` criada lá) e de `supabase/rh_calendario.sql`. Idempotente:
-- pode reexecutar.
--
-- É a costura entre quatro coisas que falavam do mesmo dia sem se enxergar:
-- o Calendário sabia que era feriado, o RH sabia que a pessoa estava de
-- férias, o Ponto só sabia que ninguém bateu, e o Banco de Horas concluía
-- "falta". O app funciona SEM este arquivo (tudo é tolerante a tabela
-- ausente) — só sem a janela de revisão de feriado e sem compensação.
--
-- O que NÃO está aqui, de propósito:
--   • Férias e atestado — já têm tabela (`rh_ferias`, `rh_atestados`). O que
--     faltava era alguém LER, e isso é código, não schema.
--   • O feriado em si — continua em `rh_calendario_feriados` e no piso
--     calculado. Aqui mora só a DECISÃO sobre ele.
--
-- RLS ligada e sem política = deny-all. O app lê pelo service_role.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ── 1. A decisão: esse feriado é folga da empresa? ───────────────────────────
-- Só a DECISÃO TOMADA ganha linha. A ausência de linha não é "indeciso
-- gravado" — é a regra automática valendo:
--
--     nacional e não-facultativo  →  VALE (ninguém confirma Natal todo ano)
--     estadual, municipal, facultativo  →  PENDENTE, esperando o RH
--
-- Guardar também os pendentes obrigaria a semear a tabela a cada ano novo e a
-- cada feriado que a fonte externa descobrisse — e um ano sem semeadura viraria
-- um ano sem feriado nenhum. Derivar não tem esse buraco.
--
-- `tipo` é o mesmo par de `ponto_feriados`: 'folga' = feriado de verdade (quem
-- trabalha gera hora com adicional) · 'troca' = a empresa inteira trocou por
-- outro dia (hora comum, pra ser gasta na folga combinada).
create table if not exists public.rh_feriados_ponto (
  dia           date primary key,
  vale          boolean not null default true,
  tipo          text not null default 'folga' check (tipo in ('folga', 'troca')),
  decidido_por  text,
  decidido_em   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists rh_feriados_ponto_touch on public.rh_feriados_ponto;
create trigger rh_feriados_ponto_touch before update on public.rh_feriados_ponto
  for each row execute function public.rh_touch();

alter table public.rh_feriados_ponto enable row level security;

-- ── 2. A compensação: o par dia trabalhado ↔ dia folgado ─────────────────────
-- Um dia TRABALHADO empresta minutos a um dia FOLGADO. Os três tipos têm a
-- mesma mecânica; o que muda é a semântica e o que a validação exige:
--
--   • feriado_trocado ...... `dia_origem` é feriado. Trabalhou na segunda que
--                            era feriado, folgou na terça.
--   • folga_compensatoria .. origem é dia de extra comum (sábado, dia útil
--                            esticado) devolvido em folga.
--   • compensacao_jornada .. o inverso: folgou ANTES e repõe depois. Aí nada é
--                            perdoado na hora — o dia de folga nasce devendo e
--                            o trabalho futuro quita, pelo motor de dívida que
--                            já existe.
--
-- `minutos` é SNAPSHOT: o que o par prometeu no momento em que foi aprovado.
-- Recalcular na leitura faria uma batida corrigida meses depois mudar
-- silenciosamente uma compensação já aprovada.
--
-- Só `aprovada` mexe em conta. 'pendente' existe pro dia em que isto virar
-- fluxo de solicitação; hoje o RH registra e aprova.
create table if not exists public.rh_compensacoes (
  id             uuid primary key default gen_random_uuid(),
  -- `profiles.id`. A ponte com o Ponto é `ponto_pessoas.colaborador_id`.
  employee_id    uuid not null,
  tipo           text not null check (tipo in ('feriado_trocado', 'folga_compensatoria', 'compensacao_jornada')),
  dia_origem     date not null,
  dia_folga      date not null,
  minutos        int  not null check (minutos > 0 and minutos <= 24 * 60),
  status         text not null default 'pendente'
                   check (status in ('pendente', 'aprovada', 'recusada', 'cancelada')),
  observacao     text,
  autor_id       uuid,
  autor_nome     text,
  aprovador_id   uuid,
  aprovador_nome text,
  aprovado_em    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  updated_by     uuid,
  -- Um par liga DOIS dias diferentes. Origem = folga seria uma compensação que
  -- se paga sozinha.
  constraint rh_compensacoes_dias_distintos check (dia_origem <> dia_folga)
);

-- Duas compensações VIVAS no mesmo dia de folga perdoariam a jornada duas
-- vezes. Recusada e cancelada ficam de fora do índice de propósito: elas são
-- histórico, e histórico pode repetir.
create unique index if not exists rh_compensacoes_folga_unica
  on public.rh_compensacoes (employee_id, dia_folga)
  where status in ('pendente', 'aprovada');

-- A leitura do cálculo é "os pares desta janela, de todo mundo" — a mesma
-- forma da consulta de `rh_ferias_janela`.
create index if not exists rh_compensacoes_janela
  on public.rh_compensacoes (dia_origem, dia_folga) where status = 'aprovada';
create index if not exists rh_compensacoes_pessoa
  on public.rh_compensacoes (employee_id, dia_folga desc);

drop trigger if exists rh_compensacoes_touch on public.rh_compensacoes;
create trigger rh_compensacoes_touch before update on public.rh_compensacoes
  for each row execute function public.rh_touch();

alter table public.rh_compensacoes enable row level security;

-- ── 3. Conferência ───────────────────────────────────────────────────────────
-- select 'rh_feriados_ponto' as tabela, count(*) from public.rh_feriados_ponto
-- union all
-- select 'rh_compensacoes', count(*) from public.rh_compensacoes;
