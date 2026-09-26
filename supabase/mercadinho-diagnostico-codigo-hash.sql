-- ── Sonda · o banco de produção bate com o mercadinho-novo.sql? ─────────────
-- Rodar no Supabase da plataforma.
--
-- Origem: rodar `supabase/mercadinho-novo.sql` num banco JÁ EXISTENTE parou em
--     42703: column "codigo_hash" does not exist
-- na linha `create index ... funcionarios_codigo ... (codigo_hash)`.
--
-- A causa não é o índice: é que `create table if not exists` **não acrescenta
-- coluna** em tabela que já existe. O banco foi criado antes de `codigo_hash`
-- entrar no arquivo; o `create table` foi ignorado inteiro e a coluna nunca
-- apareceu. O índice então não acha o que indexar.
--
-- Isso vale pra QUALQUER coluna acrescentada ao arquivo depois que o banco
-- nasceu — `codigo_hash` só foi a primeira a estourar porque tem índice. As
-- outras somem caladas: a coluna não existe, o app pede, o PostgREST responde
-- 42703 e a tela mostra erro genérico.
--
-- (`codigo_hash` em si não é usada por nenhum código do app hoje — nenhum .ts
-- ou .tsx menciona. Ela é herança do login por código no tablet, que passou a
-- ser feito por `dispositivos` / `dispositivo_codigos`.)

-- 1. As colunas que o banco realmente tem, por tabela do mercadinho.
--    Compare com os `create table` do supabase/mercadinho-novo.sql.
select table_name, string_agg(column_name, ', ' order by ordinal_position) as colunas
  from information_schema.columns
 where table_schema = 'mercadinho'
 group by table_name
 order by table_name;

-- 2. Confirmação pontual da coluna que estourou.
select exists (
  select 1 from information_schema.columns
   where table_schema = 'mercadinho' and table_name = 'funcionarios' and column_name = 'codigo_hash'
) as funcionarios_tem_codigo_hash;

-- 3. Correção — idempotente, já embutida no mercadinho-novo.sql corrigido.
--    Rode só isto: não precisa passar o arquivo inteiro de novo.
alter table mercadinho.funcionarios add column if not exists codigo_hash text;
create index if not exists funcionarios_codigo on mercadinho.funcionarios (codigo_hash);
