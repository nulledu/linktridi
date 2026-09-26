-- Métricas nas atividades: quantidade alvo/feita, tempo estimado e início.
-- Rodar no Supabase NOVO (tabela atividades já existe).
alter table public.atividades add column if not exists quantidade_alvo    integer not null default 1;
alter table public.atividades add column if not exists quantidade_feita   integer not null default 0;
alter table public.atividades add column if not exists tempo_estimado_min integer;          -- minutos estimados p/ concluir
alter table public.atividades add column if not exists iniciada_at        timestamptz;       -- quando entrou em andamento
