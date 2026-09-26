-- ── TridiMarket · o que falta pra foto da nota funcionar ────────────────────
-- Rodar no Supabase da plataforma.
--
-- Sintoma: subir a foto da nota responde
--     migracao_pendente — rodar supabase/tridimarket-nota-worker.sql
--
-- Só que rodar aquele arquivo inteiro NÃO é o certo, e este comentário existe
-- pra explicar por quê.
--
-- O `catch` da rota (app/api/tridimarket/notas/route.ts) casa com
-- /market_worker_jobs|market-notas|bucket/ e culpa a migração. Mas o código de
-- hoje grava em `mercadinho.worker_jobs` (o cliente do mercadinho é preso ao
-- schema `mercadinho`, ver lib/tridimarket/client.ts), e essa tabela JÁ EXISTE
-- no banco. O `tridimarket-nota-worker.sql` ficou pra trás: ele cria
-- `public.market_worker_jobs` e `public.market_product_cost`, nomes que o
-- código não usa mais. Rodá-lo criaria duas tabelas órfãs e não resolveria.
--
-- O que de fato falta é o BUCKET privado das imagens: `criarNotaJob` sobe o
-- arquivo antes de inserir o job (lib/tridimarket/notas.ts:66), e é esse upload
-- que está falhando.
--
-- Idempotente.

-- 1) O bucket privado. Privado de propósito: só o worker baixa, por URL
--    assinada de curta duração gerada pelo servidor. A imagem da nota NUNCA
--    vai pra fora.
insert into storage.buckets (id, name, public)
  values ('market-notas', 'market-notas', false)
  on conflict (id) do nothing;

-- 2) Conferir: tem que voltar uma linha, com `public = false`.
select id, name, public from storage.buckets where id = 'market-notas';

-- 3) Conferir que a tabela de job existe onde o código procura (schema
--    `mercadinho`, não `public`). Tem que voltar `true`.
select exists (
  select 1 from information_schema.tables
   where table_schema = 'mercadinho' and table_name = 'worker_jobs'
) as tabela_no_lugar_certo;

-- ── E a pergunta "ele adicionou algo, afinal?" ───────────────────────────────
-- `confirmarNota` grava cada entrada com `referencia = 'nota'`
-- (lib/tridimarket/notas.ts:182). Se isto voltar vazio, nenhuma nota chegou a
-- ser confirmada — nada entrou no estoque por esse caminho.
select m.criado_em, u.nome as empresa, p.nome as produto, m.quantidade, m.tipo
  from mercadinho.movimentacoes m
  join mercadinho.produtos  p on p.id = m.produto_id
  join mercadinho.unidades  u on u.id = m.unidade_id
 where m.referencia = 'nota'
 order by m.criado_em desc
 limit 30;

-- E os Nutry, pra ver se algum saldo mexeu sem você ter mandado:
select u.nome as empresa, p.nome as produto, e.quantidade, e.atualizado_em
  from mercadinho.estoque e
  join mercadinho.produtos p on p.id = e.produto_id
  join mercadinho.unidades u on u.id = e.unidade_id
 where p.nome ilike '%nutry%'
 order by e.atualizado_em desc nulls last;
