-- ATENÇÃO: este SQL roda no ERP LEGADO (projeto irdptdvkldrghevmtmzc), não no
-- banco do Gaius. É o banco de produção da operação — leia antes de rodar.
--
-- POR QUÊ
-- A busca "por onde a caixa 138 andou" precisa procurar um número DENTRO do
-- texto de `historicos_pedidos.conteudo`, porque é lá que o ERP grava as
-- frases de caixa separadora:
--     "**Fulano** adicionou **138** no campo **caixa_separadora**."
--     "**Fulano** alterou o campo **caixa_separadora** de **138** para **Não definido**."
--
-- Procurar assim (`ilike '%caixa%138%'`) não usa índice nenhum: o Postgres lê a
-- tabela inteira. Medido no ERP: entre 4s e 8s conforme a carga, e a partir de
-- certo ponto SEMPRE estoura o statement timeout (erro 57014). Ou seja, a
-- funcionalidade nasce instável — funciona quando o sistema está calmo e falha
-- justamente quando está movimentado.
--
-- O ÍNDICE ABAIXO RESOLVE
-- pg_trgm indexa trechos de 3 letras, que é o que uma busca com curinga dos
-- dois lados precisa. Com ele a mesma consulta passa a usar índice e responde
-- em milissegundos.
--
-- CUSTO
-- - Ocupa espaço (índice de texto costuma ficar na ordem do tamanho da coluna).
-- - Deixa INSERT/UPDATE na tabela um pouco mais lentos (é log, escreve muito).
-- - CONCURRENTLY não trava a tabela durante a criação, mas demora mais.
--   Rode fora do horário de pico. Se falhar no meio, o índice fica INVÁLIDO:
--   apague com o DROP comentado no fim e rode de novo.

create extension if not exists pg_trgm;

create index concurrently if not exists historicos_pedidos_conteudo_trgm
  on public.historicos_pedidos using gin (conteudo gin_trgm_ops);

-- Conferir se ficou válido:
--   select indexrelid::regclass, indisvalid
--   from pg_index where indexrelid = 'historicos_pedidos_conteudo_trgm'::regclass;
--
-- Se indisvalid = false:
--   drop index concurrently historicos_pedidos_conteudo_trgm;
