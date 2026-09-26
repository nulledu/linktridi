-- ═══════════════════════════════════════════════════════════════════════════
-- TridiMarket — empresa PRINCIPAL de quem tem cadastro em mais de uma empresa
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Quem trabalha em mais de uma empresa (Pedro, Douglas, Daniel, Leozão) tem um
-- cadastro em cada uma. O painel já une esses cadastros numa pessoa só e
-- ESCOLHE a empresa principal sozinho: aquela onde ela mais gastou — o melhor
-- sinal de onde ela realmente trabalha.
--
-- Esta tabela existe só para o caso em que o gestor precisa CORRIGIR essa
-- escolha (transferência de setor, contratação nova que o histórico ainda não
-- reflete). Sem ela, o painel continua funcionando com a escolha automática.
--
-- Idempotente: pode rodar quantas vezes quiser.

create table if not exists public.market_pessoa_empresa (
  -- Um dos cadastros da pessoa (usuarios_perfil.id). Guardamos por CADASTRO,
  -- e não por "pessoa", porque a pessoa é um agrupamento derivado do código
  -- de acesso — não existe como linha em lugar nenhum.
  employee_id  bigint      not null primary key,
  -- Empresa escolhida à mão (perfis.id).
  profile_id   uuid        not null,
  definido_por uuid,                                   -- quem mudou (employees.id)
  updated_at   timestamptz not null default now()
);

comment on table public.market_pessoa_empresa is
  'Empresa principal escolhida MANUALMENTE para uma pessoa com cadastro em várias. Sem linha aqui, o painel decide pelo maior consumo.';

-- A leitura é sempre por employee_id (chave primária), então não há índice
-- extra a criar. Este aqui serve para responder "quem foi movido para X".
create index if not exists market_pessoa_empresa_profile_idx
  on public.market_pessoa_empresa (profile_id);

alter table public.market_pessoa_empresa enable row level security;

-- Só o service_role (as rotas /api/tridimarket/*) toca nesta tabela; nenhum
-- cliente fala direto com ela.
revoke all on table public.market_pessoa_empresa from public, anon, authenticated;
grant all on table public.market_pessoa_empresa to service_role;
