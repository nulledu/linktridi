-- To-do list pessoal (cada usuário vê só as suas). Rode no Supabase NOVO.
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  texto text not null,
  feito boolean not null default false,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists todos_user_idx on public.todos (user_id, feito, ordem, created_at desc);
