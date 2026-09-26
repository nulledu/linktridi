-- Urgência: ordem urgente fura a fila do pool (cai primeiro no tablet) e chama
-- mais forte. Rodar no Supabase NOVO. Código tolerante: sem a coluna, tudo = false.
alter table public.atividades       add column if not exists urgente boolean not null default false;
alter table public.producao_modelos add column if not exists urgente boolean not null default false;
