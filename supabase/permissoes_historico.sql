-- ── Histórico de permissões ──────────────────────────────────────────────────
-- Registra QUEM alterou as áreas liberadas de um colaborador e QUANDO. Cada linha
-- é um snapshot do conjunto de áreas liberadas depois da alteração (`areas`).
-- Tolerante: se a tabela não existir, o app só não mostra/grava histórico (o save
-- das permissões continua funcionando).

create table if not exists public.permissoes_historico (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null,                 -- colaborador cujas permissões mudaram
  areas           jsonb not null default '[]',   -- áreas liberadas APÓS a mudança (lista de chaves)
  qtd             int  not null default 0,        -- quantidade de áreas liberadas
  alterado_por    uuid,                           -- profile.id de quem alterou
  alterado_por_nome text,                         -- nome (denormalizado p/ exibir rápido)
  created_at      timestamptz not null default now()
);

create index if not exists permissoes_historico_emp on public.permissoes_historico (employee_id, created_at desc);
