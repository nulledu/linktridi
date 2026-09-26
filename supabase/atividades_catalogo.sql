-- Catálogo de tarefas personalizadas (por setor). As tarefas fixas de produção
-- vivem no código (atividades-catalog.ts); aqui ficam as que o gestor salva.
create table if not exists public.atividades_catalogo (
  id          uuid primary key default gen_random_uuid(),
  setor       text not null,
  categoria   text not null default 'Personalizadas',
  nome        text not null,
  created_at  timestamptz not null default now(),
  unique (setor, categoria, nome)
);
alter table public.atividades_catalogo enable row level security;
