-- Corrige o save de RH dos colaboradores (departamento/função não salvava porque
-- a coluna 'escala' não existe no banco → o upsert inteiro falhava).
-- Rode no Supabase NOVO. (O código agora é tolerante, mas ter a coluna deixa o
-- campo de escala/expediente voltar a funcionar.)

alter table public.employees add column if not exists escala text;
