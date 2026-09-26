-- ── TI — projetos de tecnologia e roadmaps ───────────────────────────────────
-- Projeto → Roadmap → Etapas; etapa vincula TAREFAS da Central (tabela
-- `tarefas` existente — nenhuma segunda base de tarefas). Idempotente: pode
-- rodar de novo sem quebrar. O app lê com service_role (RLS não se aplica ao
-- fluxo normal — ver convenção do projeto).

create table if not exists ti_projetos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  descricao   text,
  status      text not null default 'ativo',      -- ativo | pausado | concluido | arquivado
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists ti_roadmaps (
  id               uuid primary key default gen_random_uuid(),
  projeto_id       uuid not null references ti_projetos(id) on delete cascade,
  titulo           text not null,
  descricao        text,
  status           text not null default 'planejamento',  -- planejamento | em_andamento | pausado | concluido
  inicio           date,
  prazo            date,
  responsavel_id   uuid,
  responsavel_nome text,
  -- Progresso manual (0–100) quando a natureza do roadmap não é representável
  -- só por tarefas. null = calculado das etapas.
  progresso_manual int,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists ti_roadmaps_projeto_idx on ti_roadmaps (projeto_id);

create table if not exists ti_roadmap_etapas (
  id               uuid primary key default gen_random_uuid(),
  roadmap_id       uuid not null references ti_roadmaps(id) on delete cascade,
  titulo           text not null,
  descricao        text,
  status           text not null default 'nao_iniciada', -- nao_iniciada | em_andamento | em_revisao | bloqueada | concluida
  inicio           date,
  prazo            date,
  concluida_em     date,
  responsavel_id   uuid,
  responsavel_nome text,
  ordem            int not null default 0,
  progresso_manual int,                                   -- null = calculado das tarefas
  depende_de       uuid references ti_roadmap_etapas(id) on delete set null,
  observacoes      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists ti_roadmap_etapas_roadmap_idx on ti_roadmap_etapas (roadmap_id, ordem);

-- Vínculo etapa ↔ tarefa da Central. `tarefa_id` sem FK de propósito: a tabela
-- `tarefas` tolera não existir em ambiente novo (lib/tarefas.ts é tolerante),
-- e o leitor ignora vínculo cuja tarefa sumiu.
create table if not exists ti_etapa_tarefas (
  etapa_id   uuid not null references ti_roadmap_etapas(id) on delete cascade,
  tarefa_id  uuid not null,
  created_at timestamptz not null default now(),
  primary key (etapa_id, tarefa_id)
);
create index if not exists ti_etapa_tarefas_tarefa_idx on ti_etapa_tarefas (tarefa_id);

create table if not exists ti_roadmap_historico (
  id         uuid primary key default gen_random_uuid(),
  roadmap_id uuid not null references ti_roadmaps(id) on delete cascade,
  acao       text not null,          -- criou | status | prazo | responsavel | etapa_criada | etapa_concluida | tarefa_vinculada | editou | ...
  detalhe    text,
  autor_nome text,
  created_at timestamptz not null default now()
);
create index if not exists ti_roadmap_historico_idx on ti_roadmap_historico (roadmap_id, created_at desc);
