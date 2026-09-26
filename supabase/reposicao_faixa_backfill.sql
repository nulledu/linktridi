-- Reposição automática · reclassificar a FAIXA das ordens que já estão no pool
--
-- A faixa passou a sair também da CATEGORIA do item (lib/atividade-faixa.ts:
-- faixaDaCategoria), porque `setor_responsavel` está vazio em 292 dos 305
-- itens ativos — sem isso, ordem de máquina nascia "producao" e o maquinista
-- nunca via uma. As ordens criadas ANTES desta mudança ficaram com a faixa
-- velha; este script arruma só as que ainda não foram feitas.
--
-- Seguro de rodar mais de uma vez.
update atividades
   set faixa = 'maquinas'
 where status in ('pendente', 'aguardando_material')
   and pool is true
   and para_id is null
   and coalesce(faixa, '') <> 'maquinas'
   -- 'quina' evita depender da extensão unaccent ('Máquinas' tem acento).
   and lower(coalesce(categoria, '')) like '%quina%';

update atividades
   set faixa = 'preparo'
 where status in ('pendente', 'aguardando_material')
   and pool is true
   and para_id is null
   and coalesce(faixa, '') <> 'preparo'
   and (lower(coalesce(categoria, '')) like '%tinta%'
     or lower(coalesce(categoria, '')) like '%cola%'
     or lower(coalesce(categoria, '')) like '%spray%'
     or lower(coalesce(categoria, '')) like '%desmoldante%');

-- Confere o resultado:
-- select faixa, categoria, count(*) from atividades
--  where status = 'pendente' and pool is true and para_id is null
--  group by 1, 2 order by 1;
