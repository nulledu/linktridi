-- ══════════════════════════════════════════════════════════════════════════════
-- MARKETING · GERENCIADOR DE CONTINGÊNCIA (rodar 1x; idempotente)
--
-- A "Tridify da Contingência": uma central pra ver e atualizar, todo dia, como
-- está o parque de celulares, chips e proxies da contingência telefônica — e a
-- estrutura pronta pra receber a contingência de tráfego.
--
-- O que este arquivo NÃO cria é um segundo cadastro de chip. O chip de WhatsApp
-- da contingência É o `aquecimento_ativo` de tipo `numero`, com o status que o
-- time já mantém na aba Aquecimento (novo → aquecendo → aquecido → em_uso,
-- restrito, banido). E o celular É a ficha `aquecimento_aparelho`. Inventar
-- tabela nova pra isso obrigaria a atualizar duas listas iguais todo dia, e a
-- segunda pararia de ser atualizada em uma semana.
--
-- O que entra aqui é só o que o aquecimento não tem: proxy, custo, pendência,
-- limites de saúde do atendente e o snapshot diário do consolidado.
--
-- Depende de `supabase/marketing_aquecimento.sql`. A ficha do aparelho
-- (`marketing_aquecimento_aparelho.sql`) é recriada aqui com `if not exists`,
-- pra este arquivo funcionar sozinho em quem ainda não rodou aquele.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Ficha do aparelho: garante a tabela e acrescenta o que a contingência pede ─
create table if not exists public.aquecimento_aparelho (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  modelo     text,
  foto_url   text,
  lugar      text,
  obs        text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists aquecimento_aparelho_nome on public.aquecimento_aparelho (nome);

-- `create table if not exists` NÃO acrescenta coluna em tabela que já existe
-- (ver memória "mercadinho-sql-em-producao"); por isso cada coluna nova é um
-- `add column if not exists` separado.
--
-- `situacao` é só o OVERRIDE manual. "Disponível" e "em uso" são derivados de
-- ter ou não número dentro — pedir pra alguém classificar o celular antes de
-- usá-lo é o campo que fica no padrão pra sempre.
alter table public.aquecimento_aparelho add column if not exists situacao         text not null default 'ok';
alter table public.aquecimento_aparelho add column if not exists identificacao    text;
alter table public.aquecimento_aparelho add column if not exists responsavel_id   uuid;
alter table public.aquecimento_aparelho add column if not exists responsavel_nome text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'aquecimento_aparelho_situacao') then
    alter table public.aquecimento_aparelho
      add constraint aquecimento_aparelho_situacao check (situacao in ('ok','manutencao','aposentado'));
  end if;
end $$;

-- ── Proxy ────────────────────────────────────────────────────────────────────
-- Um proxy protege UM número ou UM celular. `numero_id` aponta pro chip
-- (`set null`: perder o chip não apaga o proxy comprado); `aparelho_nome` casa
-- com `aquecimento_ativo.aparelho`/`aquecimento_aparelho.nome` pelo texto,
-- igual ao resto do módulo (não há aparelho_id).
create table if not exists public.contingencia_proxy (
  id            uuid primary key default gen_random_uuid(),
  identificacao text not null,                        -- "PX-01", IP, apelido
  status        text not null default 'ativo',        -- ativo | inativo | expirado
  custo_mensal  numeric(12,2) not null default 0,
  numero_id     uuid references public.aquecimento_ativo(id) on delete set null,
  aparelho_nome text,
  comprado_em   date,
  obs           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint contingencia_proxy_status check (status in ('ativo','inativo','expirado')),
  constraint contingencia_proxy_custo  check (custo_mensal >= 0)
);
create index if not exists contingencia_proxy_numero   on public.contingencia_proxy (numero_id);
create index if not exists contingencia_proxy_aparelho on public.contingencia_proxy (aparelho_nome) where aparelho_nome is not null;

-- ── Custos ───────────────────────────────────────────────────────────────────
-- O que o cadastro de proxy não carrega: plano dos chips e outros gastos. O
-- gasto com proxy sai da SOMA dos proxies ativos, não daqui — um valor que
-- vive em dois lugares desatualiza num deles.
create table if not exists public.contingencia_custo (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null,                        -- plano_chip | outro
  descricao     text not null,
  valor         numeric(12,2) not null default 0,
  periodicidade text not null default 'mensal',       -- mensal | unico
  data          date not null default current_date,
  ativo         boolean not null default true,
  obs           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint contingencia_custo_tipo  check (tipo in ('plano_chip','outro')),
  constraint contingencia_custo_per   check (periodicidade in ('mensal','unico')),
  constraint contingencia_custo_valor check (valor >= 0)
);

-- ── Pendências / próximas ações ──────────────────────────────────────────────
create table if not exists public.contingencia_pendencia (
  id               uuid primary key default gen_random_uuid(),
  titulo           text not null,
  descricao        text,
  status           text not null default 'aberta',    -- aberta | feita
  responsavel_id   uuid,
  responsavel_nome text,
  data             date,                              -- prazo, opcional
  concluida_em     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint contingencia_pendencia_status check (status in ('aberta','feita'))
);

-- A primeira pendência conhecida. `where not exists` pelo título: rodar de
-- novo não duplica, e marcar como feita não a faz renascer.
insert into public.contingencia_pendencia (titulo, descricao)
select 'Fazer novos suportes de celular', 'Necessidade operacional registrada na abertura do módulo.'
 where not exists (
   select 1 from public.contingencia_pendencia where titulo = 'Fazer novos suportes de celular'
 );

-- ── Configuração (limites de saúde do atendente e afins) ─────────────────────
-- Chave/valor em jsonb: os limites que decidem "atenção" e "crítico" não podem
-- ser número escrito no código — quem calibra é quem opera.
create table if not exists public.contingencia_config (
  chave      text primary key,
  valor      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ── Snapshot diário ──────────────────────────────────────────────────────────
-- Uma linha por dia com o consolidado inteiro (jsonb). Salvar a atualização de
-- hoje regrava a linha de hoje; o cron de madrugada garante que o dia existe
-- mesmo quando ninguém abriu a tela. É daqui que saem as comparações.
create table if not exists public.contingencia_snapshot (
  dia        date primary key,
  dados      jsonb not null,
  origem     text not null default 'manual',          -- manual | cron
  autor_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Sem policy = ninguém pelo anon. O servidor entra por service_role e o gate
-- real é `marketing:aquecimento` na rota, igual ao aquecimento.
alter table public.contingencia_proxy     enable row level security;
alter table public.contingencia_custo     enable row level security;
alter table public.contingencia_pendencia enable row level security;
alter table public.contingencia_config    enable row level security;
alter table public.contingencia_snapshot  enable row level security;
alter table public.aquecimento_aparelho   enable row level security;

-- Confirmação:
select 'contingencia_proxy' as tabela, count(*) from public.contingencia_proxy
union all select 'contingencia_custo', count(*) from public.contingencia_custo
union all select 'contingencia_pendencia', count(*) from public.contingencia_pendencia
union all select 'contingencia_snapshot', count(*) from public.contingencia_snapshot;
