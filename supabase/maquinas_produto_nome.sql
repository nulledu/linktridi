-- ── A programação de máquina aprende de QUAL ITEM ela é ──────────────────────
--
-- O reabastecimento automático agora tem dois destinos (ver
-- supabase/estoque_producao_receita.sql): atividade manual no tablet, ou
-- programação na fila de uma máquina. Pro segundo destino não criar a MESMA
-- reposição a cada varredura, o motor precisa perguntar "já existe programação
-- aberta deste item?" — e `referencia` é texto livre ("Pedido #58291"), não
-- serve de chave.
--
--   produto_nome → o nome do item do estoque quando a programação nasceu de
--                  uma reposição automática. NULL nas programações criadas na
--                  mão pela tela de controle — essas não participam do dedup.
--
-- Idempotente: rodável quantas vezes precisar.

alter table public.maquina_programacoes
  add column if not exists produto_nome text;

-- Quantas unidades a programação repõe. A referência mostra o número pro
-- operador ("Produzir 30× Travas"), mas texto não soma: é esta coluna que a
-- conta de cobertura lê — a MESMA de "Produção do dia" — pra tela e motor não
-- discordarem sobre o que já está encaminhado.
alter table public.maquina_programacoes
  add column if not exists quantidade_alvo integer;

-- A pergunta do motor é sempre "aberta deste item?": índice parcial só no que
-- está vivo, porque o histórico de concluídas cresce pra sempre.
create index if not exists maq_prog_produto_aberta
  on public.maquina_programacoes (produto_nome)
  where status in ('fila', 'executando');
