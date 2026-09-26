-- ─────────────────────────────────────────────────────────────────────────────
-- Atividades · devolver ao pool com justificativa
--
-- Rodar no Supabase NOVO (o do app). Idempotente: pode rodar de novo.
--
-- POR QUE ESTA COLUNA:
--   Quando alguém devolve uma ordem ("não consigo — falta material"), ela volta
--   pro pool. Mas o pool entrega SEMPRE a mais antiga (created_at asc) — e a
--   devolvida continua sendo a mais antiga. Sem isto, ela cai de volta na mesma
--   pessoa no segundo seguinte: laço infinito de devolução.
--
--   Excluir só QUEM devolveu não resolve: o motivo real costuma ser do AMBIENTE
--   (falta material, máquina parada), então ninguém consegue — a ordem só
--   pularia de pessoa em pessoa. O certo é mandá-la pro FIM DA FILA: todo mundo
--   segue trabalhando no que dá pra fazer, e ela volta a ser oferecida depois
--   (quando o material chegar / a máquina voltar).
--
--   `devolvida_em` é a data de "reentrada" na fila. A ordenação do pool passa a
--   ser por coalesce(devolvida_em, created_at): quem nunca foi devolvida mantém
--   a idade original; a devolvida vira a MAIS NOVA e vai pro fim.
--
-- O código é TOLERANTE à ausência desta coluna: sem ela a devolução continua
-- funcionando (a ordem volta pro pool), só sem ir pro fim da fila.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.atividades
  add column if not exists devolvida_em timestamptz;

comment on column public.atividades.devolvida_em is
  'Quando a ordem foi devolvida ao pool. A fila ordena por coalesce(devolvida_em, created_at), então a devolvida vai pro fim.';

-- Consulta de apoio: ordens que voltaram pro pool e por quê (pro painel).
-- select id, tarefa, motivo_impedimento, devolvida_em
--   from public.atividades
--  where impedida and status = 'pendente' and para_id is null
--  order by devolvida_em desc nulls last;
