-- Metas individuais por colaborador. Rodar no Supabase NOVO (já existe a tabela metas).
alter table public.metas add column if not exists colaborador_id   text;
alter table public.metas add column if not exists colaborador_nome text;
