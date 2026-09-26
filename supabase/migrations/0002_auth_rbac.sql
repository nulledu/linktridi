-- Auth + RBAC — perfis de usuário ligados ao Supabase Auth.

create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null,
  name         text not null,
  role         text not null check (role in
                 ('admin','gerente_producao','gerente_vendas','estoquista','colaborador')),
  active       boolean not null default true,
  password_set boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists profiles_username_idx on profiles (username);

-- RLS: cada usuário lê só o próprio perfil. Gestão (criar/editar/listar) acontece
-- via service_role nas rotas de API, que ignora RLS.
alter table profiles enable row level security;

drop policy if exists "profiles_self_read" on profiles;
create policy "profiles_self_read" on profiles
  for select to authenticated using (id = auth.uid());

-- Seed do admin existente (tridiinteligenciaartificial@gmail.com) como papel admin,
-- caso já exista em auth.users. username = "admin".
insert into profiles (id, username, name, role, active, password_set)
select u.id, 'admin', 'Administrador', 'admin', true, true
from auth.users u
where u.email = 'tridiinteligenciaartificial@gmail.com'
on conflict (id) do update set role = 'admin', active = true;
