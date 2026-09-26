-- ── A história da peça: o índice que falta pra perguntar "de onde veio" ──────
--
-- Rode no Supabase NOVO (o mesmo do estoque_itens / atividades / conferências).
-- Idempotente e ADITIVO: não cria coluna, não apaga nada, não muda dado nenhum.
-- Só um índice.
--
-- ── POR QUE ──────────────────────────────────────────────────────────────────
-- A tela "A produção de verdade" (/atividades/historico) encadeia três tabelas
-- que já existem pra responder "fulano fez chancela, usou tal material que
-- ciclano fez":
--
--   estoque_conferencias.unidade_id   → a caixa que NASCEU daquela atividade
--   estoque_conferencias.atividade_id → a atividade que a produziu
--   estoque_unidades.baixa_atividade_id → a atividade que CONSUMIU aquela caixa
--
-- Duas dessas três pontas já são indexadas:
--   · `estoque_conferencias_atividade_idx` (supabase/estoque_conferencias.sql)
--   · `estoque_unidades_baixa_atividade_idx` (§6 do consolidado)
--
-- A terceira, não. E é justamente a que a tela usa POR PADRÃO: "de onde veio"
-- é a pergunta que se faz com a peça na mão, e ela caminha para trás perguntando
-- `where unidade_id in (...)` uma vez por nível da corrente. Sem índice, cada
-- nível é uma varredura da tabela inteira — quatro varreduras por consulta, numa
-- tabela que ganha uma linha por atividade conferida e nunca encolhe.
--
-- Postgres NÃO cria índice sozinho para chave estrangeira (só para a chave
-- primária e para o `unique`). `unidade_id` é uma FK — a armadilha clássica:
-- parece indexada porque tem `references`, e não está.
--
-- Parcial (`where unidade_id is not null`) porque a conferência REPROVADA nunca
-- gera etiqueta: nesse caso a coluna é nula, e essas linhas não interessam a
-- nenhuma busca por unidade. O índice fica menor e mais rápido de manter.
--
-- ── O QUE MUDA SE VOCÊ NÃO RODAR ─────────────────────────────────────────────
-- Nada quebra. A tela funciona igual e devolve exatamente os mesmos dados — só
-- fica mais lenta, e a lentidão cresce junto com a produção. Não há código
-- nenhum que dependa da existência deste índice.

begin;

create index if not exists estoque_conferencias_unidade_idx
  on public.estoque_conferencias (unidade_id)
  where unidade_id is not null;

commit;
