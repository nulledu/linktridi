-- ── Foto da nota · UMA consulta, um veredito ────────────────────────────────
-- Rodar no Supabase da plataforma. Só lê. Cole tudo, rode, e me mande a tabela.
--
-- Contexto honesto: já tentei três causas (arquivo de migração errado, funções
-- RPC ausentes, privilégio do service_role) e nenhuma resolveu. Todas eram
-- plausíveis e nenhuma foi VERIFICADA contra o seu banco, porque eu não tenho
-- acesso a ele. Este arquivo existe pra acabar com isso: cada linha é um fato,
-- não um palpite.

select 'schema exposto na API'                                as verificacao,
       coalesce(current_setting('pgrst.db_schemas', true), '(vazio)') as valor,
       case when coalesce(current_setting('pgrst.db_schemas', true), '') like '%mercadinho%'
            then 'ok' else 'PROBLEMA: mercadinho não está em Exposed schemas' end as veredito
union all
select 'tabela mercadinho.worker_jobs existe',
       (select case when exists (select 1 from information_schema.tables
                 where table_schema='mercadinho' and table_name='worker_jobs')
               then 'sim' else 'NÃO' end),
       (select case when exists (select 1 from information_schema.tables
                 where table_schema='mercadinho' and table_name='worker_jobs')
               then 'ok' else 'PROBLEMA: rodar supabase/mercadinho-novo.sql' end)
union all
select 'service_role lê worker_jobs',
       (select case when has_table_privilege('service_role','mercadinho.worker_jobs','select')
               then 'sim' else 'NÃO' end),
       (select case when has_table_privilege('service_role','mercadinho.worker_jobs','select')
               then 'ok' else 'PROBLEMA: rodar supabase/mercadinho-grants.sql' end)
union all
select 'service_role insere em worker_jobs',
       (select case when has_table_privilege('service_role','mercadinho.worker_jobs','insert')
               then 'sim' else 'NÃO' end),
       (select case when has_table_privilege('service_role','mercadinho.worker_jobs','insert')
               then 'ok' else 'PROBLEMA: grant de INSERT faltando' end)
union all
select 'colunas de worker_jobs',
       (select string_agg(column_name, ', ' order by ordinal_position)
          from information_schema.columns
         where table_schema='mercadinho' and table_name='worker_jobs'),
       (select case when count(*) filter (where column_name in ('tipo','status','payload','resultado')) = 4
               then 'ok — o código grava tipo/status/payload'
               else 'PROBLEMA: a tabela tem outra forma; me mande esta linha' end
          from information_schema.columns
         where table_schema='mercadinho' and table_name='worker_jobs')
union all
select 'bucket market-notas',
       (select case when exists (select 1 from storage.buckets where id='market-notas')
               then 'existe' else 'NÃO existe' end),
       (select case when exists (select 1 from storage.buckets where id='market-notas')
               then 'ok' else 'PROBLEMA: rodar supabase/tridimarket-nota-bucket.sql' end)
union all
select 'RLS em worker_jobs',
       (select case when relrowsecurity then 'ligado' else 'desligado' end
          from pg_class where oid='mercadinho.worker_jobs'::regclass),
       (select case when relrowsecurity and not exists (
                      select 1 from pg_policies
                       where schemaname='mercadinho' and tablename='worker_jobs')
               then 'atenção: RLS ligado sem política (service_role passa, mas vale saber)'
               else 'ok' end
          from pg_class where oid='mercadinho.worker_jobs'::regclass)
union all
select 'jobs na fila',
       (select coalesce(string_agg(status || '=' || n, ', '), '(nenhum job)')
          from (select status, count(*) n from mercadinho.worker_jobs group by status) x),
       (select case when count(*) = 0
               then 'nenhuma foto chegou a virar job — a falha é ANTES do insert (bucket/upload)'
               else 'já houve job: a falha é depois do insert' end
          from mercadinho.worker_jobs);

-- Se houver job, o erro do último diz o resto:
select id, status, tentativas, erro, criado_em, atualizado_em
  from mercadinho.worker_jobs
 order by criado_em desc
 limit 5;
