-- ── RLS · quais tabelas ficaram trancadas sem porta ─────────────────────────
-- Rodar no Supabase da plataforma.
--
-- RLS ligado SEM política = ninguém lê nada por PostgREST/anon. Não dá erro
-- barulhento: as consultas voltam VAZIAS e a assinatura de Realtime para de
-- receber evento. É o pior tipo de quebra, porque parece "sumiu o dado".
--
-- Quem NÃO é afetado: tudo que passa pela nossa API com `SUPABASE_SERVICE_ROLE_KEY`
-- — service_role tem BYPASSRLS. É o caso de todo o TridiMarket
-- (lib/tridimarket/client.ts recusa subir com outra chave) e do tablet, que
-- fala com /api/tridimarket/device/* e não tem cliente Supabase próprio.
--
-- Quem É afetado: o que o NAVEGADOR lê com a chave anon. Hoje, neste app, isso
-- é só a assinatura `postgres_changes` de `public.central_mensagens`
-- (app/(plataforma)/central/mensagens/data/realtime.ts) — Realtime aplica RLS
-- do mesmo jeito que uma consulta. Os demais canais são `broadcast`, que não
-- lê tabela e não depende de política.

-- 1. Tabelas com RLS LIGADO e ZERO políticas. É aqui que mora o problema.
select n.nspname as esquema, c.relname as tabela
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where c.relkind = 'r'
   and c.relrowsecurity
   and n.nspname in ('public', 'mercadinho')
   and not exists (select 1 from pg_policies p
                    where p.schemaname = n.nspname and p.tablename = c.relname)
 order by 1, 2;

-- 2. Panorama: RLS ligado? quantas políticas?
select n.nspname as esquema, c.relname as tabela,
       c.relrowsecurity as rls_ligado,
       (select count(*) from pg_policies p
         where p.schemaname = n.nspname and p.tablename = c.relname) as politicas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where c.relkind = 'r'
   and n.nspname in ('public', 'mercadinho')
 order by 3 desc, 4, 1, 2;

-- 3. O ponto sensível, direto: a Central de Mensagens continua legível?
--    `supabase/central-chat.sql` já cria as políticas dela — se este select
--    voltar 0, rode aquele arquivo (é idempotente).
select count(*) as politicas_da_central
  from pg_policies
 where schemaname = 'public' and tablename = 'central_mensagens';
