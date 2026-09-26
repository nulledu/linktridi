-- ═════════════════════════════════════════════════════════════════════════════
--  RECORRÊNCIA DE VALOR VARIÁVEL — luz, água, cartão, comissão
-- ═════════════════════════════════════════════════════════════════════════════
--
--  A regra guardava um `valor` só, e isso obriga a escolher entre duas
--  mentiras: repetir o valor do mês passado (a agenda mostra um número que
--  ninguém combinou) ou deixar zero (o "a pagar" some, e previsão de caixa que
--  engana PARA MENOS é a pior direção, porque ninguém desconfia dela).
--
--  Duas peças:
--
--  1. `valor_variavel` na regra. Quando ligado, o `valor` continua existindo e
--     passa a ser ESTIMATIVA — a linha aparece na agenda marcada como palpite,
--     e ninguém paga achando que conferiu.
--
--  2. `fin_recorrencia_valores`: o número combinado para UM mês. Quem sabe que
--     a próxima do contador é diferente lança antes, e a geração usa o
--     combinado no lugar da estimativa.
--
--  POR QUE UMA TABELA E NÃO UM `jsonb` NA REGRA. O valor de um mês é um FATO
--  com autor e data — quem informou R$ 617,42 de luz em setembro, e quando.
--  Num `jsonb` isso vira um blob sem histórico e sem trava de unicidade; aqui
--  o par (regra, competência) é único por índice, então informar duas vezes
--  corrige em vez de duplicar.
--
--  Rode DEPOIS de `financeiro.sql`. Idempotente.

alter table public.fin_recorrencias
  add column if not exists valor_variavel boolean not null default false;

create table if not exists public.fin_recorrencia_valores (
  id             uuid primary key default gen_random_uuid(),
  recorrencia_id uuid not null references public.fin_recorrencias(id) on delete cascade,
  -- Sempre o 1º dia do mês. O `check` impede meia-competência entrar e nunca
  -- casar com a chave de idempotência, que é montada a partir de AAAA-MM.
  competencia    date not null check (competencia = date_trunc('month', competencia)::date),
  valor          numeric(14,2) not null default 0,
  observacao     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid,
  -- Informar de novo CORRIGE; não duplica.
  unique (recorrencia_id, competencia)
);

create index if not exists fin_rec_valores_regra
  on public.fin_recorrencia_valores (recorrencia_id, competencia);

drop trigger if exists fin_rec_valores_touch on public.fin_recorrencia_valores;
create trigger fin_rec_valores_touch before update on public.fin_recorrencia_valores
  for each row execute function public.fin_touch();

-- Mesma fechadura do resto do módulo: RLS ligada e ZERO políticas. O app lê
-- pelo `service_role`; a chave `anon`, que vive no navegador, não lê nada.
alter table public.fin_recorrencia_valores enable row level security;

-- ── Conferência ──────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_recorrencias'
      and column_name = 'valor_variavel') as coluna_na_regra,
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'fin_recorrencia_valores') as tabela_de_valores,
  (select count(*) from public.fin_recorrencias where valor_variavel) as regras_variaveis;
