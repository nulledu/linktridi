-- Nível de acesso (1–5) do colaborador. Fonte única das permissões. Rode no Supabase NOVO.
alter table public.employees add column if not exists nivel int;
-- (null = usa o fallback do papel: admin=5, gerentes/estoquista=3, colaborador=1)
