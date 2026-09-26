-- ── Recorrências cadastradas com o dia ERRADO (defeito corrigido em 09/09/2026) ──
-- Até o conserto, o formulário nascia com o dia de HOJE em `dia_vencimento` e
-- ele vencia a data escolhida: compromisso de 05/10 cadastrado no dia 9
-- repetia todo dia 9. O código novo só vale pra cadastro novo; o que já está
-- no banco continua com o dia errado até rodar isto.
--
-- Rode em duas etapas. A PRIMEIRA só mostra; olhe a lista antes da segunda.
-- Regra em que alguém escolheu de propósito um dia diferente do início
-- (contrato começou dia 20 mas vence dia 5) aparece aqui também — tire-a da
-- lista com `and id <> '...'` antes de atualizar.

-- 1) O que seria corrigido: regra cujo dia não é o dia do início.
select r.id, e.nome as empresa, r.descricao, r.inicio,
       r.dia_vencimento as dia_atual,
       extract(day from r.inicio)::int as dia_do_inicio,
       r.status
from public.fin_recorrencias r
join public.fin_empresas e on e.id = r.empresa_id
where r.dia_vencimento <> extract(day from r.inicio)::int
order by e.nome, r.descricao;

-- 2) Corrige a regra: o dia passa a ser o dia do início.
-- update public.fin_recorrencias r
--    set dia_vencimento = extract(day from r.inicio)::int,
--        updated_at = now()
--  where r.dia_vencimento <> extract(day from r.inicio)::int;

-- 3) Corrige os compromissos EM ABERTO que a regra já gerou com o dia errado:
--    mesma competência, dia da regra (dia 31 cai no último dia que o mês tem).
--    Pago e cancelado não mudam — são história.
-- update public.fin_compromissos c
--    set vencimento = least(
--          (date_trunc('month', c.competencia) + interval '1 month' - interval '1 day')::date,
--          make_date(extract(year from c.competencia)::int, extract(month from c.competencia)::int, 1)
--            + (r.dia_vencimento - 1)
--        ),
--        updated_at = now()
--   from public.fin_recorrencias r
--  where c.origem = 'recorrencia'
--    and c.origem_id = r.id
--    and c.competencia is not null
--    and c.status in ('previsto', 'pendente', 'agendado')
--    and extract(day from c.vencimento)::int <> least(r.dia_vencimento,
--          extract(day from (date_trunc('month', c.competencia) + interval '1 month' - interval '1 day'))::int);
