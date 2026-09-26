-- ══════════════════════════════════════════════════════════════════════════════
-- TRIDIFY · Agregação no Postgres (SQL ÚNICO, idempotente)
--
-- POR QUE: totaisDoPeriodo() e funilDoPeriodo() baixavam as linhas e somavam em
-- JS. Sem .limit() explícito o PostgREST corta em 1000 linhas — os totais saíam
-- truncados SEM ERRO, enquanto a tabela hierárquica (limit 50000) mostrava o
-- valor certo. Somar no banco corrige o número E remove duas varreduras da
-- mesma tabela por request.
-- ══════════════════════════════════════════════════════════════════════════════

-- Garante as colunas do funil ANTES de criar a função que as usa. Estas colunas
-- nasceram depois da tabela, num add-column do meta_warehouse.sql — quem rodou
-- aquele arquivo antes dessa adição não as tem, e a função falharia com
-- "column i.lpv does not exist". Repetir aqui torna este arquivo autossuficiente:
-- ele não depende de qual versão do outro você rodou.
alter table public.meta_ad_insights_daily add column if not exists lpv numeric not null default 0;
alter table public.meta_ad_insights_daily add column if not exists add_to_cart numeric not null default 0;
alter table public.meta_ad_insights_daily add column if not exists initiate_checkout numeric not null default 0;

-- Totais + etapas do funil numa passada só. `contas` nulo/vazio = todas.
create or replace function public.meta_totais_periodo(
  p_since date,
  p_until date,
  p_contas text[] default null
)
returns table (
  spend numeric, impressions bigint, clicks bigint,
  purchases_meta numeric, purchase_value_meta numeric, leads_meta numeric,
  lpv numeric, add_to_cart numeric, initiate_checkout numeric,
  dias bigint, linhas bigint
)
language sql
stable
as $$
  select
    coalesce(sum(i.spend), 0),
    coalesce(sum(i.impressions), 0),
    coalesce(sum(i.clicks), 0),
    coalesce(sum(i.purchases_meta), 0),
    coalesce(sum(i.purchase_value_meta), 0),
    coalesce(sum(i.leads_meta), 0),
    coalesce(sum(i.lpv), 0),
    coalesce(sum(i.add_to_cart), 0),
    coalesce(sum(i.initiate_checkout), 0),
    count(distinct i.date),
    count(*)
  from public.meta_ad_insights_daily i
  where i.date between p_since and p_until
    and (p_contas is null or cardinality(p_contas) = 0 or i.ad_account_id = any(p_contas));
$$;

-- NB: `reach` fica de fora de propósito. É deduplicado pela Meta; somar entre
-- dias/anúncios infla o número e não existe soma correta a partir deste grão.

-- Índice que serve o filtro real das leituras (data + conta). O
-- meta_ins_campanha (campaign_id, date) não é usado por nenhuma query do
-- módulo — nenhuma filtra por campaign_id; ele só paga custo de escrita.
create index if not exists meta_ins_data_conta on public.meta_ad_insights_daily (date, ad_account_id);
