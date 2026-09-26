-- Ordens de produção v2 — instruções + demo (gif/foto) por ordem, vínculo com
-- item do estoque, aceite explícito (o relógio só começa quando a pessoa ACEITA)
-- e tempo padrão de 1h por atividade. Rodar no Supabase NOVO.
--
-- Tolerante: o código funciona sem estas colunas (trata como null); rode quando puder.

-- Instrução escrita + demo visual (gif/foto) do "o que fazer", por ordem.
alter table public.atividades add column if not exists instrucoes text;
alter table public.atividades add column if not exists demo_url   text;

-- Aceite: quando a pessoa tocou "Aceitar" no tablet (o relógio começa aqui).
alter table public.atividades add column if not exists aceita_at  timestamptz;

-- Tempo estimado por atividade — padrão 1h (60 min).
alter table public.atividades add column if not exists tempo_estimado_min integer;
alter table public.atividades alter column tempo_estimado_min set default 60;

-- produto_id / produto_nome já existem (ver atividades_producao.sql) — é por eles
-- que a ordem vincula um item do estoque; a demo pode herdar a imagem do item.
