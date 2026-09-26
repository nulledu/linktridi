-- ── Mercadinho · privilégios do schema (a causa do "market_schema_missing") ──
-- Rodar no Supabase da plataforma. Idempotente, seguro, roda em segundos.
--
-- O PostgREST só expõe tabela em que o papel da requisição TEM PRIVILÉGIO. Em
-- schema próprio (`mercadinho`) isso não é automático como em `public`. Tabela
-- sem `grant` pro `service_role` não aparece no schema cache, e o erro que volta
-- é "Could not find the table … in the schema cache" — que o
-- `isMissingMarketSchema` (lib/tridimarket/repository.ts:31) traduz para
--     market_schema_missing — run_supabase_tridimarket_migration
-- ou seja: parece migração faltando, é permissão faltando.
--
-- POR QUE ACONTECEU: os grants moram nas linhas 530-533 do
-- supabase/mercadinho-novo.sql, no fim do arquivo. A execução dele parou na
-- linha 60 (o índice de `codigo_hash`), então nada depois rodou. E mesmo numa
-- execução completa, `grant all on all tables` só alcança as tabelas que
-- EXISTEM naquele instante — tabela criada depois nasce sem privilégio.
-- `worker_jobs` (a fila da foto da nota) é uma dessas: o resto do painel
-- funciona porque foi coberto pelo grant antigo.
--
-- A correção definitiva é o `alter default privileges` no fim: com ele, tabela
-- nova já nasce visível e este arquivo não precisa ser rodado de novo.

-- 1. Diagnóstico — é isto ou não? `false` em qualquer linha confirma.
select c.relname as tabela,
       has_table_privilege('service_role', 'mercadinho.' || quote_ident(c.relname), 'select') as service_role_le
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'mercadinho' and c.relkind = 'r'
 order by service_role_le, c.relname;

-- 2. Privilégio no que já existe.
grant usage on schema mercadinho to anon, authenticated, service_role;
grant all on all tables    in schema mercadinho to service_role;
grant all on all sequences in schema mercadinho to service_role;
grant all on all functions in schema mercadinho to service_role;

-- 3. E no que vier depois — é o que impede a próxima tabela de repetir isso.
alter default privileges in schema mercadinho grant all on tables    to service_role;
alter default privileges in schema mercadinho grant all on sequences to service_role;
alter default privileges in schema mercadinho grant all on functions to service_role;

-- 4. Acordar o PostgREST. Sem isto ele pode seguir com o cache antigo por
--    alguns minutos, e a tela continua dando o mesmo erro depois do grant.
notify pgrst, 'reload schema';

-- 5. Conferir: a consulta 1 de novo tem que dar `true` em TODAS as linhas.
select count(*) filter (where not has_table_privilege('service_role', 'mercadinho.' || quote_ident(c.relname), 'select')) as ainda_sem_privilegio
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'mercadinho' and c.relkind = 'r';
