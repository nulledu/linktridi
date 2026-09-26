-- ══════════════════════════════════════════════════════════════════════════════
-- MARKETING · BIBLIOTECA — ano, variação e produtos (rodar 1x; idempotente)
--
-- 1) ANO: "SET 01" de 2027 não pode colidir com o de 2026. O número é por
--    (ano, mês). Criativos antigos herdam o ano da data de criação.
-- 2) VARIAÇÃO: "SET 01 - V2 - {CRB} - {L}" é outro criativo, com o mesmo
--    número. Sem variação = '' (texto vazio, nunca null: null não conta como
--    igual num índice único e deixaria passar dois "SET 01" iguais).
-- 3) PRODUTOS: lista editável pela tela (nome + tag que vai no nome).
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.marketing_criativos add column if not exists ano integer;
alter table public.marketing_criativos add column if not exists variacao text;

update public.marketing_criativos
   set ano = extract(year from data_criacao)::int
 where ano is null;
update public.marketing_criativos set variacao = '' where variacao is null;

alter table public.marketing_criativos
  alter column ano set default (extract(year from (now() at time zone 'America/Sao_Paulo')))::int;
alter table public.marketing_criativos alter column ano set not null;
alter table public.marketing_criativos alter column variacao set default '';
alter table public.marketing_criativos alter column variacao set not null;

-- A trava antiga (prefixo, numero) é o que faria SET 01/2027 ser recusado.
drop index if exists public.marketing_criativos_prefixo_numero;
create unique index if not exists marketing_criativos_ano_prefixo_numero_var
  on public.marketing_criativos (ano, prefixo, numero, variacao);

-- ── Produtos ──────────────────────────────────────────────────────────────────
create table if not exists public.marketing_criativos_produtos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  tag         text not null,                 -- CRB, CH… (MAIÚSCULO, sem chaves)
  criador_nome text,
  created_at  timestamptz not null default now()
);
create unique index if not exists marketing_criativos_produtos_nome on public.marketing_criativos_produtos (lower(nome));
create unique index if not exists marketing_criativos_produtos_tag  on public.marketing_criativos_produtos (tag);

-- ── Estreia na Meta ───────────────────────────────────────────────────────────
-- Primeiro dia em que um anúncio cujo nome COMEÇA com o nome do criativo teve
-- impressão, lido do armazém (meta_ad_insights_daily). Uma chamada pra lista
-- inteira da biblioteca: devolve uma linha por nome que já rodou. "Começa com"
-- e não "igual" porque a Meta põe " - Cópia" no fim de anúncio duplicado.
-- `%` e `_` do nome são escapados: `_` no ilike casaria qualquer caractere.
create or replace function public.criativos_estreia(nomes text[], desde date)
returns table (nome text, primeira date)
language sql stable
as $$
  select n, min(d.date)
    from unnest(nomes) as n
    join public.meta_ad_insights_daily d
      on d.date >= desde
     and d.impressions > 0
     and d.ad_name ilike replace(replace(replace(n, '\', '\\'), '%', '\%'), '_', '\_') || '%'
   group by n
$$;

insert into public.marketing_criativos_produtos (nome, tag) values
  ('Carimbo', 'CRB'),
  ('Chancela', 'CH')
on conflict do nothing;
