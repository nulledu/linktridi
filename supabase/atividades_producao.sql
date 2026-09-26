-- Gerador de produção: ordens caem no pool "Produção" com fase (ordem) e lote.
-- Rode no Supabase NOVO. Tolerante: o código funciona sem estas colunas (cai na
-- ordenação por created_at e sem agrupamento por lote).
alter table public.atividades add column if not exists ordem int;   -- fase (menor = mais cedo)
alter table public.atividades add column if not exists lote text;   -- id do lote gerado (agrupa a produção do dia)

create index if not exists atividades_pool_ordem_idx on public.atividades (pool, status, ordem, created_at);
create index if not exists atividades_lote_idx on public.atividades (lote);
