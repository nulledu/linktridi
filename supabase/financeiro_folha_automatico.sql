-- ── Folha mensal · entrada automática por área e bônus recorrente ────────────
--
-- 1. `fin_folha_mensal.auto_vendas / auto_trafego / auto_marketplace`
--    Por PESSOA e por MÊS: a sugestão do sistema (planilha das vendedoras,
--    acordo do gestor de tráfego, acordo do gerenciador dos marketplaces) entra
--    sozinha naquela área? NULO = o padrão pela data, que mora no código
--    (`AUTOMATICO_DESDE` em lib/financeiro/folha-mensal.ts): ligado de
--    setembro/2026 em diante, desligado antes — agosto e os meses anteriores de
--    2026 continuam de entrada manual, como foram pagos.
--
-- 2. `fin_folha_lancamentos`: bônus que REPETE. "Comissões, bônus e etc não se
--    repetem; o bônus pode se repetir caso marque que ele é recorrente."
--      recorrente   — a ORIGEM: marcado na hora de lançar.
--      origem_id    — a CÓPIA aponta pra origem (uma cópia por mês, índice único).
--      encerrado_em — a partir desta competência a origem não gera mais.
--      pulados      — meses em que a cópia foi tirada "só este mês": a
--                     materialização não a recria.
--
-- Idempotente: rodar de novo não quebra nem apaga valor gravado.

alter table public.fin_folha_mensal
  add column if not exists auto_vendas      boolean,
  add column if not exists auto_trafego     boolean,
  add column if not exists auto_marketplace boolean;

alter table public.fin_folha_lancamentos
  add column if not exists recorrente   boolean not null default false,
  add column if not exists origem_id    uuid references public.fin_folha_lancamentos(id) on delete set null,
  add column if not exists encerrado_em date,
  add column if not exists pulados      date[] not null default '{}';

-- Uma cópia por mês, por origem: materializar dez vezes no mesmo dia não
-- duplica o bônus de ninguém.
-- TOTAL, sem `where`: o `on conflict` do PostgREST não enxerga índice parcial.
create unique index if not exists fin_folha_lanc_copia_unica
  on public.fin_folha_lancamentos (origem_id, competencia);

create index if not exists fin_folha_lanc_origens
  on public.fin_folha_lancamentos (empresa_id, recorrente)
  where recorrente and origem_id is null;

select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_folha_mensal'
      and column_name like 'auto\_%' escape '\') as interruptores_por_area,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_folha_lancamentos'
      and column_name in ('recorrente', 'origem_id', 'encerrado_em', 'pulados')) as colunas_do_bonus_recorrente;
