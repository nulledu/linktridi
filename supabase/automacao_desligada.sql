-- ── Atividades automáticas: DESLIGADAS por enquanto (pedido do dono, 11/09/2026) ──
--
-- 1. Desliga o interruptor da reposição automática — o mesmo de
--    Estoque › Produção do dia. Com ele desligado, nem a varredura do dia nem o
--    salvar de um item criam ordem (o salvar passou a respeitar o interruptor
--    neste mesmo dia; antes ele varria o catálogo mesmo desligado).
--    Pra religar: o interruptor na tela, ou trocar `false` por `true` aqui.
update public.estoque_config
   set automacao_ativa = false, atualizado_em = now()
 where id = true;

-- 2. (Opcional) Recolhe as ordens que a VARREDURA criou e ninguém aceitou
--    ainda — inclusive a que está oferecida no tablet. Pedido feito por gente
--    (o "Pedir" do tablet, a tela de Atividades) não entra: esses não têm a
--    frase de origem da varredura. Ordem já ACEITA não é tocada: quem está com
--    a peça na mão termina. Quando religar, a varredura recria o que faltar.
update public.atividades
   set status = 'cancelada',
       para_id = null,
       para_nome = '',
       claimed_at = null,
       motivo_impedimento = 'Automação desligada — a varredura recria quando religar'
 where criada_por_automacao is true
   and origem_frase is not null
   and pool is true
   and (status in ('pendente', 'aguardando_material')
        or (status = 'em_andamento' and iniciada_at is null));

-- Confere: o interruptor e o que sobrou de automático na fila.
-- select automacao_ativa from public.estoque_config;
-- select status, count(*) from public.atividades
--  where criada_por_automacao is true and status not in ('concluida', 'cancelada')
--  group by 1;
