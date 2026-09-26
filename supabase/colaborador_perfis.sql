-- Múltiplas FUNÇÕES por colaborador (uma pessoa pode ter várias). Rode no Supabase NOVO.
alter table public.employees add column if not exists perfis jsonb not null default '[]'::jsonb;
-- Migra a função única antiga (perfil) para o array, quando houver.
update public.employees set perfis = jsonb_build_array(perfil) where perfil is not null and perfis = '[]'::jsonb;
