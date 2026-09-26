-- ── Mercadinho · o que o código precisa e o banco não tem ───────────────────
-- Rodar no Supabase da plataforma. Só lê, não muda nada.
--
-- Sintoma: alguma tela do TridiMarket responde
--     market_schema_missing — run_supabase_tridimarket_migration
--
-- Essa mensagem é mais larga do que parece. O `isMissingMarketSchema`
-- (lib/tridimarket/repository.ts:31) casa com QUATRO situações diferentes:
--
--   PGRST106                → o schema `mercadinho` não está em Exposed schemas
--   42P01                   → UMA tabela não existe (não o schema todo)
--   /schema cache/          → uma FUNÇÃO chamada por RPC não existe
--   /relation .* does not exist/
--
-- Ou seja: "schema faltando" pode ser só uma função. As três consultas abaixo
-- dizem qual dos quatro é.

-- 1. O schema está exposto pra API? Tem que aparecer `mercadinho` na lista.
select current_setting('pgrst.db_schemas', true) as schemas_expostos;

-- 2. As tabelas que o código usa. `existe = false` em qualquer linha é a causa.
with precisa(tabela) as (values
  ('ajustes'), ('auditoria'), ('categorias'), ('creditos'), ('dispositivo_codigos'),
  ('dispositivos'), ('estoque'), ('funcionarios'), ('lancamentos'), ('movimentacoes'),
  ('operacoes_compra'), ('pagamentos'), ('pessoa_unidade'), ('precos'), ('produtos'),
  ('scores'), ('suspeitas'), ('unidades'), ('venda_itens'), ('vendas'), ('worker_jobs')
)
select p.tabela,
       exists (select 1 from information_schema.tables t
                where t.table_schema = 'mercadinho' and t.table_name = p.tabela) as existe
  from precisa p
 order by existe, p.tabela;

-- 3. As funções chamadas por RPC. Função ausente é o caso mais provável, porque
--    o erro dela ("Could not find the function … in the schema cache") cai no
--    mesmo balaio de "schema faltando".
with precisa(funcao) as (values
  ('ativar_dispositivo'), ('registrar_compra'), ('transferir_estoque')
)
select p.funcao,
       exists (select 1 from pg_proc pr
                join pg_namespace n on n.oid = pr.pronamespace
               where n.nspname = 'mercadinho' and pr.proname = p.funcao) as existe
  from precisa p
 order by existe, p.funcao;

-- Se faltar `ativar_dispositivo` ou `registrar_compra`: elas moram no
-- supabase/mercadinho-novo.sql. Aquele arquivo parou na linha 60 na sua última
-- tentativa (o índice de `codigo_hash`), então tudo depois dela não rodou — e
-- as funções ficam depois. O arquivo já está corrigido no repositório; rodar de
-- novo agora vai até o fim.
--
-- Se faltar só `transferir_estoque`: é a da transferência de estoque, em
-- supabase/mercadinho-transferir-estoque.sql. A tela funciona sem ela (a rota
-- cai num caminho de reserva), então ela NÃO é a causa deste erro.
