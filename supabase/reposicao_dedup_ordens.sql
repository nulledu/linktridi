-- Reposição · uma ordem viva por item
--
-- Rodar o script de restauração DEPOIS de a varredura já ter recriado as
-- ordens deixou o mesmo item com duas e até três ordens abertas: "Produzir
-- Puxador Macho" × 3 é a bancada cortando 528 peças em vez de 176. A varredura
-- sozinha nunca duplica (ela desconta o que já está pendente/em andamento);
-- quem duplicou foi o `update` de fora, que ressuscitou ordens canceladas sem
-- olhar se já existia uma viva.
--
-- Mantém UMA por item: a que já tem dono (alguém pode estar com a peça na
-- mão); na falta dela, a mais antiga. As outras viram `cancelada` com o motivo
-- escrito. Seguro de rodar mais de uma vez.
with vivas as (
  select id, coalesce(produto_nome, tarefa) as item, para_id, created_at,
         row_number() over (
           partition by coalesce(produto_nome, tarefa)
           order by (para_id is null), created_at
         ) as posicao
    from atividades
   where status in ('pendente', 'em_andamento', 'aguardando_material')
     and pool is true
)
update atividades a
   set status = 'cancelada',
       motivo_impedimento = 'Duplicada — outra ordem do mesmo item já estava na fila'
  from vivas v
 where a.id = v.id
   and v.posicao > 1;

-- Confere: nenhum item pode aparecer duas vezes.
-- select coalesce(produto_nome, tarefa) as item, count(*)
--   from atividades
--  where status in ('pendente','em_andamento','aguardando_material') and pool is true
--  group by 1 having count(*) > 1;
