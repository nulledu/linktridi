-- RH: Departamento + Perfil (substitui "Cargo" livre). Rode no Supabase NOVO.
alter table public.employees add column if not exists departamento text;
alter table public.employees add column if not exists perfil text;

-- Migração leve: aproveita o "setor" antigo como departamento inicial quando bater.
update public.employees set departamento = 'Produção'  where departamento is null and setor = 'Produção';
update public.employees set departamento = 'Estoque'   where departamento is null and setor = 'Estoque';
update public.employees set departamento = 'Comercial' where departamento is null and setor = 'Vendas';
update public.employees set departamento = 'Financeiro' where departamento is null and setor = 'Administrativo';
