-- ─────────────────────────────────────────────────────────────────────────────
-- TridiFlow — trabalhar o lead: estágio, anotação e carimbo de quem mexeu
-- ─────────────────────────────────────────────────────────────────────────────
-- Rode no MESMO banco do TridiFlow (o do supabase/tridiflow.sql).
--
-- ADITIVO e IDEMPOTENTE: pode rodar mais de uma vez. Nenhum dado atual muda e
-- nenhuma coluna existente é tocada.
--
-- POR QUE ISTO EXISTE
-- A tela de Contatos já mostrava um "status" por lead — mas ele era calculado
-- no navegador a cada render e jogado fora no F5. Dava pra OLHAR a lista; não
-- dava pra TRABALHAR a lista. Duas pessoas ligavam pro mesmo lead e ninguém
-- sabia; quem fechou e quem sumiu ficavam com a mesma cara no dia seguinte.
--
-- POR QUE EM `tridiflow_sessoes` E NÃO NUMA TABELA NOVA
-- Uma sessão JÁ É um lead: é onde as respostas, os UTMs e o carimbo de conclusão
-- moram, e é a tabela que o webhook, o Comercial e a tela de Resultados leem.
-- Tabela separada exigiria join em toda listagem e abriria a porta pra lead
-- órfão (estado sem sessão). Aqui é uma linha só, do começo ao fim.
--
-- O CÓDIGO FUNCIONA SEM ISTO. `leadsGerais` detecta a ausência das colunas e cai
-- pro conjunto antigo; a tela some com os controles de estágio e continua
-- listando. Rodar este arquivo LIGA a gestão — não conserta nada quebrado.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Colunas de trabalho ─────────────────────────────────────────────────────
alter table public.tridiflow_sessoes
  add column if not exists estagio       text,
  add column if not exists nota          text,
  add column if not exists trabalhado_em timestamptz,
  add column if not exists trabalhado_por uuid;

-- Estágio livre viraria "Contatado", "contactado", "em contato" na mesma base —
-- e aí nenhum filtro fecha. `null` continua valendo: é o lead que ninguém tocou.
do $$ begin
  alter table public.tridiflow_sessoes
    add constraint tridiflow_sessoes_estagio_chk
    check (estagio is null or estagio in ('novo','contatado','qualificado','ganho','perdido'));
exception when duplicate_object then null; end $$;

-- 2) Índice da fila ──────────────────────────────────────────────────────────
-- A pergunta de todo dia é "o que está aberto, do mais recente pro mais antigo".
-- Parcial porque lead ganho/perdido sai da fila e não precisa ser indexado.
create index if not exists tridiflow_sessoes_fila_idx
  on public.tridiflow_sessoes (iniciada_em desc)
  where estagio is null or estagio not in ('ganho','perdido');

-- ─────────────────────────────────────────────────────────────────────────────
-- Conferência (rode depois, se quiser ver se pegou):
--
-- select column_name, data_type
--   from information_schema.columns
--  where table_name = 'tridiflow_sessoes'
--    and column_name in ('estagio','nota','trabalhado_em','trabalhado_por');
-- ─────────────────────────────────────────────────────────────────────────────
