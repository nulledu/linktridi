-- Módulo Colaboradores — dados de RH ligados 1:1 ao perfil/usuário.

create table if not exists employees (
  id            uuid primary key references profiles(id) on delete cascade,
  photo_url     text,
  cargo         text,
  setor         text check (setor in ('Vendas','Produção','Estoque','Administrativo')),
  telefone      text,
  data_admissao date,
  observacoes   text,
  updated_at    timestamptz not null default now()
);

-- RLS: cada usuário lê só o próprio registro; gestão via service_role nas rotas.
alter table employees enable row level security;

drop policy if exists "employees_self_read" on employees;
create policy "employees_self_read" on employees
  for select to authenticated using (id = auth.uid());
