-- ══════════════════════════════════════════════════════════════════════════════
-- MARKETING · SISTEMA DE AQUECIMENTO (rodar 1x; idempotente)
--
-- Ativo de marketing morre por descuido de RITMO. BM nova que gasta rápido demais
-- toma restrição; chip novo que dispara lista no dia 2 toma ban. Isso hoje vive na
-- cabeça de quem cuida — e quando o ativo cai, ninguém sabe dizer o que foi feito
-- nele, quando, nem por quem.
--
-- UM motor, dois tipos de ativo. Parecem duas coisas, têm o mesmo formato:
--   Estrutura Meta │ container = BM        │ itens = contas de anúncio
--   WhatsApp       │ container = aparelho  │ itens = números
--
-- Assimetria de propósito: BM é LINHA DE ATIVO (ela mesma aquece, verifica e pode
-- ser banida, então tem roteiro e histórico próprios) e a conta pendura nela por
-- `pai_id`. Aparelho é CAMPO DE TEXTO — caixa física, não aquece — e o agrupamento
-- de números sai de um `group by aparelho`. Inventar tabela de aparelho seria
-- cadastro a mais pra responder uma pergunta que o group by já responde.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Roteiro: o "Configurar Linha do Tempo" ───────────────────────────────────
create table if not exists public.aquecimento_roteiro (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  tipo        text not null,                       -- bm | conta | numero
  ativo       boolean not null default true,       -- false = não oferece pra ativo novo
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint aquecimento_roteiro_tipo check (tipo in ('bm','conta','numero'))
);

create table if not exists public.aquecimento_etapa (
  id          uuid primary key default gen_random_uuid(),
  roteiro_id  uuid not null references public.aquecimento_roteiro(id) on delete cascade,
  ordem       integer not null default 0,
  dia         integer not null default 0,          -- deslocamento em dias desde iniciado_em
  titulo      text not null,
  detalhe     text,
  -- Soft-delete. Etapa já cumprida por alguém NÃO some do histórico dessa pessoa:
  -- some do roteiro futuro e continua existindo pro marco que aponta pra ela.
  -- Apagar de verdade quebraria a linha do tempo de quem já passou por ela.
  removida_em timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists aquecimento_etapa_roteiro
  on public.aquecimento_etapa (roteiro_id, ordem) where removida_em is null;

-- ── Ativo em aquecimento ─────────────────────────────────────────────────────
create table if not exists public.aquecimento_ativo (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null,                     -- bm | conta | numero
  nome          text not null,
  identificador text,                              -- id da BM / act_xxx / número E.164
  -- Só conta usa: aponta pra BM dona. `set null` e não `cascade`: perder a BM não
  -- pode apagar o histórico das contas que penduravam nela.
  pai_id        uuid references public.aquecimento_ativo(id) on delete set null,
  status        text not null default 'novo',
  roteiro_id    uuid references public.aquecimento_roteiro(id) on delete set null,
  iniciado_em   date not null default current_date,
  -- Congelamento. Ativo restrito/banido PARA de contar atraso: sem isso, um chip
  -- banido grita "12 dias atrasado" pra sempre e o bloco "Fora do prazo" vira
  -- ruído que ninguém lê. Alerta que sempre aparece é alerta que não existe.
  pausado_em    date,
  responsavel_id   uuid,                           -- sem FK: registro sobrevive à saída da pessoa
  responsavel_nome text,
  aparelho      text,                              -- só numero — é o agrupador da visão WhatsApp
  operadora     text,                              -- só numero
  obs           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint aquecimento_ativo_tipo   check (tipo in ('bm','conta','numero')),
  constraint aquecimento_ativo_status check (status in
    ('novo','aquecendo','aquecido','em_uso','restrito','banido','aposentado'))
);
create index if not exists aquecimento_ativo_tipo_status on public.aquecimento_ativo (tipo, status);
create index if not exists aquecimento_ativo_pai         on public.aquecimento_ativo (pai_id);
create index if not exists aquecimento_ativo_aparelho    on public.aquecimento_ativo (aparelho)
  where aparelho is not null;

-- ── Marco: etapa PREVISTA que foi cumprida ───────────────────────────────────
-- A UNIQUE é a trava de verdade: marcar em lote duas vezes (clique duplo, dois
-- operadores na mesma etapa) não pode gerar dois marcos — senão o progresso
-- passa de 100% e a média de duração do roteiro mente.
create table if not exists public.aquecimento_marco (
  id         uuid primary key default gen_random_uuid(),
  ativo_id   uuid not null references public.aquecimento_ativo(id) on delete cascade,
  etapa_id   uuid not null references public.aquecimento_etapa(id) on delete cascade,
  feito_em   date not null default current_date,
  autor_id   uuid,
  autor_nome text,
  created_at timestamptz not null default now(),
  constraint aquecimento_marco_unico unique (ativo_id, etapa_id)
);
create index if not exists aquecimento_marco_ativo on public.aquecimento_marco (ativo_id);

-- ── Evento: o log do que ACONTECEU (inclusive fora do roteiro) ───────────────
-- É a outra metade do "previsto × real". O roteiro não previu a denúncia de spam
-- nem o recurso — e é justamente isso que explica um ban depois.
create table if not exists public.aquecimento_evento (
  id            uuid primary key default gen_random_uuid(),
  ativo_id      uuid not null references public.aquecimento_ativo(id) on delete cascade,
  tipo          text not null default 'nota',      -- nota | etapa | status | criacao
  texto         text,
  status_antes  text,
  status_depois text,
  etapa_id      uuid references public.aquecimento_etapa(id) on delete set null,
  autor_id      uuid,
  autor_nome    text,
  created_at    timestamptz not null default now()
);
create index if not exists aquecimento_evento_ativo
  on public.aquecimento_evento (ativo_id, created_at desc);

-- ── Roteiros vazios, prontos pra receber as etapas ───────────────────────────
-- Só as três CASCAS, sem nenhuma etapa. As etapas de aquecimento que eu chutaria
-- aqui seriam palpite meu virando doutrina do time — e um roteiro errado é pior
-- que roteiro nenhum, porque a tela passa a cobrar prazo de uma regra que
-- ninguém combinou. Quem escreve as etapas é quem aquece, na aba Roteiros.
--
-- As cascas existem porque sem nenhuma linha aqui a aba Roteiros não teria onde
-- pendurar a primeira etapa: a tela edita roteiro, não cria.
insert into public.aquecimento_roteiro (nome, tipo)
select v.nome, v.tipo
  from (values
    ('Chip de WhatsApp',  'numero'),
    ('Conta de anúncio',  'conta'),
    ('BM',                'bm')
  ) as v(nome, tipo)
 where not exists (select 1 from public.aquecimento_roteiro where tipo = v.tipo);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Sem policy = ninguém pelo anon. O servidor entra por service_role (que ignora
-- RLS) e o gate real é `marketing:aquecimento` na rota, igual ao resto do módulo.
alter table public.aquecimento_roteiro enable row level security;
alter table public.aquecimento_etapa   enable row level security;
alter table public.aquecimento_ativo   enable row level security;
alter table public.aquecimento_marco   enable row level security;
alter table public.aquecimento_evento  enable row level security;
