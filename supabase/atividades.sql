-- Atividades atribuídas a colaboradores. Rodar no Supabase NOVO.
create table if not exists public.atividades (
  id           uuid primary key default gen_random_uuid(),
  categoria    text not null,
  tarefa       text not null,
  detalhe      text,
  para_id      uuid not null references public.profiles(id) on delete cascade,
  para_nome    text not null,
  por_id       uuid not null references public.profiles(id) on delete set null,
  por_nome     text not null,
  status       text not null default 'pendente',  -- pendente | em_andamento | concluida
  prazo        date,
  created_at   timestamptz not null default now(),
  concluida_at timestamptz
);

create index if not exists atividades_para_idx on public.atividades (para_id, status);
create index if not exists atividades_created_idx on public.atividades (created_at desc);
