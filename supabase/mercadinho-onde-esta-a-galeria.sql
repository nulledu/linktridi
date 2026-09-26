-- ── Sonda · cadê a Galeria, e cadê as 6 pessoas dela ───────────────────────
-- Rodar no Supabase da plataforma.
--
-- Contexto: a consulta de colisão da PARTE 1 devolveu 6 pessoas da Galeria
-- ("Anny", "Clara Gomes", "Daniel", "Heloiza Monteiro", "Nataly dos Santos",
-- "teste"). Pouco depois, `count(*) where nome ilike '%galeria%'` deu 0.
--
-- Nenhum bloco `do $$` deste repositório pode ter apagado a empresa sem
-- apagar tudo o mais junto: os que falharam foram desfeitos inteiros pelo
-- Postgres, e `funcionarios.unidade_id` é `on delete restrict` — o banco
-- recusaria remover a unidade enquanto as 6 existissem.
--
-- CONFIRMADO: a empresa foi removida. A pergunta agora não é mais "onde ela
-- está" e sim SE AS PESSOAS E O DINHEIRO SOBREVIVERAM.
--
-- `funcionarios.unidade_id` e `lancamentos.unidade_id` são `on delete
-- restrict`: o banco só deixa apagar a unidade se essas linhas já tiverem
-- saído de lá. Ou seja, uma destas é verdade —
--   a) as 6 pessoas foram MOVIDAS pra outra empresa antes (nada se perdeu);
--   b) as 6 pessoas foram APAGADAS antes (e aí sumiram junto os limites, os
--      scores e o histórico de cada uma).
--
-- A consulta 3 responde direto: se as 6 aparecem, está tudo lá. Se voltar
-- vazio, houve perda e o caminho é restaurar do backup do Supabase
-- (Database > Backups) — por isso não mexa em mais nada até conferir.
--
-- NÃO rode a PARTE 2 da mudança de empresa: não há mais o que mover.

-- 1. Todas as empresas, nome byte a byte.
select id, quote_literal(nome) as nome_exato, length(nome) as caracteres, ativo, criado_em
  from mercadinho.unidades
 order by nome;

-- 2. Onde estão as pessoas hoje, por empresa.
select u.nome as empresa, count(f.id) as pessoas
  from mercadinho.unidades u
  left join mercadinho.funcionarios f on f.unidade_id = u.id
 group by u.nome
 order by u.nome;

-- 3. As 6 pessoas da lista, uma a uma: em que empresa cada uma está agora.
select f.nome as pessoa, u.nome as empresa, f.ativo, f.criado_em, f.atualizado_em
  from mercadinho.funcionarios f
  join mercadinho.unidades u on u.id = f.unidade_id
 where f.nome in ('Anny','Clara Gomes','Daniel','Heloiza Monteiro','Nataly dos Santos','teste')
 order by u.nome, f.nome;

-- 4. Os lançamentos que estavam na Galeria — em que empresa estão agora.
--    Se `atualizado` mostrar a Zeelux, a mudança rodou de verdade.
select u.nome as empresa, l.tipo, l.valor, l.descricao, l.ocorrido_em
  from mercadinho.lancamentos l
  join mercadinho.unidades u on u.id = l.unidade_id
 order by l.ocorrido_em desc
 limit 20;

-- 5. O registro de auditoria conta quem mexeu e quando. É a resposta mais
--    direta pra "renomearam ou apagaram?".
select registrado_em, autor_id, acao, entidade, entidade_id, antes, depois
  from mercadinho.auditoria
 where entidade in ('unidade','funcionario')
    or acao ilike '%unidade%'
 order by registrado_em desc
 limit 30;
