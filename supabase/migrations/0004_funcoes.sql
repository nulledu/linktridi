-- Registro de FUNÇÕES operacionais: liga uma pessoa do ERP (usuarios.user_id)
-- a uma função, SEM exigir login/profile. Quem não tem função aqui não aparece
-- nos dashboards. Gerenciado em Colaboradores (admin).
create table if not exists public.funcoes (
  erp_user_id uuid primary key,
  nome text not null,
  foto_url text,
  funcao text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists funcoes_funcao_idx on public.funcoes (funcao) where active;

alter table public.funcoes enable row level security;
-- Leitura pública (o tv-app/dashboards usam); escrita só autenticada (admin no app).
drop policy if exists "funcoes_read" on public.funcoes;
create policy "funcoes_read" on public.funcoes for select using (true);
drop policy if exists "funcoes_write" on public.funcoes;
create policy "funcoes_write" on public.funcoes for all to authenticated using (true) with check (true);
