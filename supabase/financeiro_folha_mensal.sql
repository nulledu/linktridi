-- ═════════════════════════════════════════════════════════════════════════════
--  FOLHA MENSAL — o mês é a unidade, não o cadastro
-- ═════════════════════════════════════════════════════════════════════════════
--
--  O cadastro do colaborador guardava UM salário, e salário muda: o valor de
--  março não é o de outubro, e uma folha que só conhece o número atual
--  reescreve o passado toda vez que alguém ganha aumento. Aqui cada
--  competência tem a sua linha — salário, bônus, comissão, gratificação,
--  benefícios, vale, convênio da farmácia, mercadinho, faltas e o PAGO daquele
--  mês. O mês fechado fica congelado; o mês novo nasce zerado (só o salário é
--  herdado), que é o "bônus zera todo mês" pedido — de graça, pelo modelo.
--
--  FALTAS SÃO DATAS, NUNCA CONTAGEM. O DSR (Lei 605/49, art. 6º) é perdido por
--  SEMANA com falta: duas faltas na mesma semana perdem um descanso só. Sem a
--  data de cada uma, qualquer conta é chute — e folha não pode chutar.
--
--  Rode DEPOIS de `financeiro.sql`. Idempotente.

-- ── 1. O vínculo da pessoa (CLT, MEI, PF, Estágio) ───────────────────────────

alter table public.fin_colaboradores
  -- Sem `check` de propósito, como `tipo` e `natureza` dos contatos: o
  -- vocabulário é da tela, e um check transformaria "quero um vínculo novo"
  -- num arquivo de SQL.
  add column if not exists vinculo text;

-- ── 2. A linha do mês ────────────────────────────────────────────────────────

create table if not exists public.fin_folha_mensal (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.fin_empresas(id) on delete restrict,
  colaborador_id uuid not null references public.fin_colaboradores(id) on delete cascade,
  -- Sempre o 1º dia do mês TRABALHADO. O pagamento vence no 5º dia útil do mês
  -- seguinte (CLT 459 §1º) — isso é conta da tela, não coluna.
  competencia    date not null check (competencia = date_trunc('month', competencia)::date),

  salario        numeric(14,2) not null default 0,
  bonus          numeric(14,2) not null default 0,
  comissao       numeric(14,2) not null default 0,
  gratificacao   numeric(14,2) not null default 0,
  beneficios     numeric(14,2) not null default 0,

  -- Descontos do mês.
  vale               numeric(14,2) not null default 0,
  convenio_farmacia  numeric(14,2) not null default 0,
  mercadinho         numeric(14,2) not null default 0,

  -- As DATAS das faltas injustificadas (ver o cabeçalho: DSR é por semana).
  faltas         date[] not null default '{}',

  pago           boolean not null default false,
  pago_em        timestamptz,
  observacao     text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid,

  -- Um mês por pessoa. Gravar de novo CORRIGE, nunca duplica — é a mesma
  -- trava de idempotência do resto do módulo.
  unique (colaborador_id, competencia)
);

create index if not exists fin_folha_mensal_mes
  on public.fin_folha_mensal (empresa_id, competencia);
create index if not exists fin_folha_mensal_pessoa
  on public.fin_folha_mensal (colaborador_id, competencia desc);

-- Empresa cruzada: a linha do mês de uma pessoa da Tridi não nasce na Gedux.
drop trigger if exists fin_folha_mensal_empresa_ok on public.fin_folha_mensal;
create trigger fin_folha_mensal_empresa_ok before insert or update on public.fin_folha_mensal
  for each row execute function public.fin_confere_empresa('colaborador_id,fin_colaboradores');

drop trigger if exists fin_folha_mensal_touch on public.fin_folha_mensal;
create trigger fin_folha_mensal_touch before update on public.fin_folha_mensal
  for each row execute function public.fin_touch();

-- Mesma fechadura do módulo inteiro: RLS ligada, zero políticas. O app lê pelo
-- service_role; a chave anon, que vive no navegador, não lê salário de ninguém.
alter table public.fin_folha_mensal enable row level security;

-- ── Conferência ──────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_colaboradores'
      and column_name = 'vinculo') as vinculo_no_cadastro,
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'fin_folha_mensal') as tabela_da_folha,
  (select count(*) from public.fin_folha_mensal) as meses_ja_gravados;
