-- ── ON CONFLICT precisa de índice ÚNICO E TOTAL ──────────────────────────────
-- Erro em produção (set/2026): "there is no unique or exclusion constraint
-- matching the ON CONFLICT specification" ao confirmar compra, gerar
-- recorrência, materializar bônus e cadastrar patrimônio.
--
-- A causa: os índices de idempotência eram PARCIAIS (`where … is not null`).
-- O Postgres só usa índice parcial como árbitro de `on conflict (colunas)` se
-- o comando repetir o mesmo `where` — e o PostgREST (o `.upsert()` do
-- supabase-js) nunca manda esse `where`. Índice total resolve, e é seguro:
-- índice único em coluna anulável deixa quantos NULL quiser (NULL ≠ NULL).
--
-- Idempotente: pode rodar quantas vezes precisar.

drop index if exists public.fin_compromissos_idem;
create unique index if not exists fin_compromissos_idem
  on public.fin_compromissos (empresa_id, idempotency_key);

drop index if exists public.fin_movimentos_idem;
create unique index if not exists fin_movimentos_idem
  on public.fin_movimentos (empresa_id, idempotency_key);

drop index if exists public.fin_patrimonio_idem;
create unique index if not exists fin_patrimonio_idem
  on public.fin_patrimonio (empresa_id, idempotency_key);

-- Só existe onde `financeiro_folha_automatico.sql` rodou.
do $$
begin
  if to_regclass('public.fin_folha_lancamentos') is not null then
    execute 'drop index if exists public.fin_folha_lanc_copia_unica';
    execute 'create unique index if not exists fin_folha_lanc_copia_unica on public.fin_folha_lancamentos (origem_id, competencia)';
  end if;
end $$;

-- Conferência: todo índice de idempotência sem predicado.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in ('fin_compromissos_idem', 'fin_movimentos_idem', 'fin_patrimonio_idem', 'fin_folha_lanc_copia_unica');
