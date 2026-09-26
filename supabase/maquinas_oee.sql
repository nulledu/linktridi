-- ── OEE das máquinas ────────────────────────────────────────────────────────
-- Efetividade Global do Equipamento = Disponibilidade × Desempenho × Qualidade.
--
-- O que faltava pra conta existir:
--  · a JANELA planejada de produção de cada máquina (senão "disponibilidade"
--    não tem denominador);
--  · saber se a parada em curso é PLANEJADA (preventiva combinada não é perda
--    de disponibilidade — sai do tempo planejado);
--  · o APONTAMENTO de peças e refugo por programação (sem ele a qualidade é
--    suposição, e o painel diz isso na cara em vez de mostrar 100%).
--
-- Rodar no SQL Editor do Supabase. Idempotente. O código é tolerante à
-- ausência destas colunas: sem elas o painel cai no turno padrão (08:00–18:00)
-- e marca a qualidade como "sem apontamento".

alter table public.maquinas
  add column if not exists turno_inicio time not null default '08:00',
  add column if not exists turno_fim    time not null default '18:00',
  -- Parada combinada (preventiva, setup programado) não conta como perda.
  add column if not exists parada_planejada boolean not null default false;

alter table public.maquina_programacoes
  -- Peças produzidas na programação (boas + refugo) e o refugo/retrabalho.
  -- Nulo = ninguém apontou; zero = apontou zero. São coisas diferentes, e é
  -- por isso que não têm default.
  add column if not exists pecas   int,
  add column if not exists refugos int;

alter table public.maquina_programacoes
  drop constraint if exists maq_prog_refugo_cabe;
alter table public.maquina_programacoes
  add constraint maq_prog_refugo_cabe
  check (pecas is null or refugos is null or (refugos >= 0 and pecas >= 0 and refugos <= pecas));
