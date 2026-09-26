-- ── Folha mensal · comissão em QUATRO áreas ──────────────────────────────────
--
-- "Alguns têm comissão em mais de uma área": a comissão da pessoa deixa de ser
-- um número solto e vira a SOMA de quatro partes — vendas, tráfego,
-- marketplace e outros. A coluna `comissao` continua existindo e continua
-- sendo o que a folha soma no bruto, mas passa a ser MANTIDA POR GATILHO:
-- escrever nela direto não adianta, quem manda são as partes.
--
-- Idempotente: rodar de novo não quebra nem apaga valor gravado.

alter table public.fin_folha_mensal
  add column if not exists comissao_vendas      numeric(14,2) not null default 0,
  add column if not exists comissao_trafego     numeric(14,2) not null default 0,
  add column if not exists comissao_marketplace numeric(14,2) not null default 0,
  add column if not exists comissao_outros      numeric(14,2) not null default 0;

-- O total que já estava gravado vira "outros" UMA vez — só quando as partes
-- ainda estão zeradas, para o re-rodar não dobrar nada.
update public.fin_folha_mensal
   set comissao_outros = comissao
 where comissao > 0
   and comissao_vendas = 0 and comissao_trafego = 0
   and comissao_marketplace = 0 and comissao_outros = 0;

-- comissao = soma das partes, SEMPRE. É gatilho e não coluna gerada porque a
-- coluna já existe com escritas antigas — gerada exigiria drop e recriação, e
-- o gatilho dá o mesmo invariante sem tocar no que está gravado.
create or replace function public.fin_folha_comissao_soma() returns trigger
language plpgsql as $$
begin
  new.comissao :=
    coalesce(new.comissao_vendas, 0) + coalesce(new.comissao_trafego, 0)
    + coalesce(new.comissao_marketplace, 0) + coalesce(new.comissao_outros, 0);
  return new;
end $$;

drop trigger if exists fin_folha_comissao_soma on public.fin_folha_mensal;
create trigger fin_folha_comissao_soma before insert or update on public.fin_folha_mensal
  for each row execute function public.fin_folha_comissao_soma();

-- Alinha o total das linhas antigas com o invariante novo (o update dispara o
-- gatilho, então basta "tocar" as linhas em que a soma diverge).
update public.fin_folha_mensal
   set comissao_vendas = comissao_vendas
 where comissao is distinct from
   (comissao_vendas + comissao_trafego + comissao_marketplace + comissao_outros);

select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_folha_mensal'
      and column_name like 'comissao\_%' escape '\') as partes_da_comissao,
  (select count(*) from public.fin_folha_mensal) as meses_gravados;
