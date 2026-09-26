-- "Aparece no tablet de produção": flag explícita por colaborador. Rode no Supabase NOVO.
-- Antes o tablet usava 'especialidade' como proxy e pegava gente errada (admin etc.).

alter table public.employees add column if not exists tablet boolean not null default false;
-- Em QUAL mesa/tablet a pessoa aparece (nome_mesa do device). Vazio = todas do setor.
alter table public.employees add column if not exists mesa text;
