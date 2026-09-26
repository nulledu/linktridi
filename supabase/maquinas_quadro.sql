-- ── Quadro das máquinas (kanban) ────────────────────────────────────────────
--
-- O quadro tem UMA coluna por máquina, e nela caem DUAS fontes de trabalho:
--
--   · `maquina_programacoes` — o corte em si (borracha, acrílico, MDF). Já
--     tinha `maquina_id` desde `supabase/maquinas.sql`; nada a fazer aqui.
--   · `atividades` — o trabalho de PESSOA que roda junto da máquina (faixa
--     "maquinas"). Essa não sabia em que máquina estava: era uma lista de
--     tarefas sem lugar. As duas colunas abaixo dão lugar a ela.
--
-- Sincronizar as duas era o pedido: mover um cartão no quadro tem de valer
-- para os dois tipos, senão a parede mostra a máquina livre enquanto a pessoa
-- está trabalhando nela.
--
-- Rodar no SQL Editor do Supabase. Idempotente: pode rodar de novo sem medo.
-- O código tolera a ausência das colunas — sem elas o quadro mostra só as
-- programações, em vez de quebrar a Produção inteira.

alter table public.atividades
  -- `on delete set null`, nunca cascade: desativar/apagar uma máquina não pode
  -- levar junto o histórico de produtividade de quem trabalhou nela.
  add column if not exists maquina_id uuid references public.maquinas(id) on delete set null,
  -- Ordem DENTRO da coluna da máquina. Mesma régua da fila de programações
  -- (`maquina_programacoes.posicao`): maior = mais tarde, e o desempate é o id.
  add column if not exists quadro_posicao int not null default 0;

-- A consulta do quadro é "as atividades desta máquina, na ordem". Índice
-- parcial: a esmagadora maioria das atividades não tem máquina nenhuma e não
-- precisa ocupar espaço no índice.
create index if not exists atividades_maquina_ix
  on public.atividades (maquina_id, quadro_posicao)
  where maquina_id is not null;
