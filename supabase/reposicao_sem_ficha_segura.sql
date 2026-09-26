-- Reposição · recolhe as ordens de item SEM FICHA TÉCNICA
--
-- Regra nova (lib/producao-em-cadeia.ts + lib/requisicoes.ts): item sem ficha
-- não vira ordem. Sem ficha ninguém sabe do que a peça é feita, e silêncio de
-- cadastro não é sinal de que tem material — foi assim que "Produzir Folha de
-- borracha A4" caiu no tablet com ZERO "Rolo de borracha" no estoque.
--
-- O código já não cria as novas. Este script recolhe as que já estavam na
-- fila, inclusive a que está OFERECIDA no tablet (tem dono mas ainda não foi
-- aceita — `iniciada_at is null`). Ordem já ACEITA não é tocada: quem está com
-- a peça na mão termina.
--
-- Cancela em vez de segurar de propósito: ordem parada em `aguardando_material`
-- conta como cobertura na varredura seguinte, e ficaria presa pra sempre.
-- Cancelada, o item volta a gerar ordem sozinho no dia em que a ficha existir.
-- Seguro de rodar mais de uma vez.
update atividades a
   set status = 'cancelada',
       para_id = null,
       para_nome = '',
       claimed_at = null
 where a.criada_por_automacao is true
   and a.pool is true
   and (a.status in ('pendente', 'aguardando_material')
        or (a.status = 'em_andamento' and a.iniciada_at is null))
   and exists (
     select 1 from estoque_itens i
      where i.nome = a.produto_nome
        -- sem ficha PRÓPRIA (ninguém sabe do que ela é feita)…
        and not exists (select 1 from ficha_tecnica f where f.item_id = i.id)
        -- …e não é INSUMO de ninguém. Esta segunda linha é a que salva a
        -- cadeia: "Puxador Macho" também não tem ficha, mas a ficha do
        -- "Puxador" pede 176 dele — essa ordem é o trabalho, não o erro.
        and not exists (select 1 from ficha_tecnica f2 where f2.componente_id = i.id)
   );

-- Quem precisa de ficha técnica pra voltar a produzir sozinho (só as RAÍZES —
-- item que é insumo de outro segue produzindo pela ficha de quem o pede):
-- select i.nome, i.categoria, i.quantidade, i.qtd_minima
--   from estoque_itens i
--  where i.ativo and i.producao_automatica
--    and not exists (select 1 from ficha_tecnica f  where f.item_id = i.id)
--    and not exists (select 1 from ficha_tecnica f2 where f2.componente_id = i.id)
--  order by i.nome;

-- ── Conserto de quem já rodou a PRIMEIRA versão deste script ────────────────
-- A primeira versão não tinha a linha do `componente_id` e cancelou também os
-- INSUMOS ("Puxador Macho", "Puxador Femea", "Bolinha Puxador"), deixando o
-- "Puxador" preso em aguardando_material sem ninguém pra cortar as peças.
-- Isto devolve só esses — item sem ficha própria MAS que é componente de
-- alguém — pra fila. Nada acontece se você nunca rodou a versão antiga.
update atividades a
   set status = 'pendente'
 where a.criada_por_automacao is true
   and a.pool is true
   and a.status = 'cancelada'
   and a.para_id is null
   and exists (
     select 1 from estoque_itens i
      where i.nome = a.produto_nome
        and not exists (select 1 from ficha_tecnica f  where f.item_id = i.id)
        and exists     (select 1 from ficha_tecnica f2 where f2.componente_id = i.id)
   )
   -- E SÓ SE NÃO HOUVER UMA VIVA DO MESMO ITEM. Sem esta linha, ressuscitar
   -- depois de a varredura já ter recriado a ordem deixa duas abertas — a
   -- bancada corta 352 peças onde faltam 176. Aconteceu em 08/09.
   and not exists (
     select 1 from atividades b
      where b.produto_nome = a.produto_nome
        and b.pool is true
        and b.status in ('pendente', 'em_andamento', 'aguardando_material')
   );
