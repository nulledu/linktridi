-- ── Todo item nasce com código: PRD-#### automático no banco ─────────────────
--
-- Decisão do dono (22/08/2026): "coloca código em todos já por padrão; criou
-- produto novo, PRD-000X e vai avançando o número". Antes o código só nascia
-- quando alguém abria a ficha ou gerava etiqueta — e item criado por OUTRA
-- porta (importação de planilha, script, tablet) ficava sem.
--
-- O gatilho mora NO BANCO, e não em cada rota, de propósito: as portas de
-- criação são várias e novas aparecem; uma rota esquecida recriaria o catálogo
-- meio-com meio-sem, que é exatamente o estado que esta decisão encerra.
--
-- ── COMO O NÚMERO AVANÇA ─────────────────────────────────────────────────────
--
-- Por SEQUENCE, não por max()+1: dois cadastros no mesmo instante fariam a
-- mesma conta e um dos dois estouraria no índice único. A sequence é atômica.
-- O custo conhecido: cadastro que falha no meio consome um número e deixa
-- buraco na numeração — buraco é aceitável, código repetido não.
--
-- Idempotente: rodar de novo re-sincroniza a sequence e não duplica nada.

-- 1. A sequence, sincronizada com o maior PRD que existe.
create sequence if not exists public.estoque_sku_seq;

select setval(
  'public.estoque_sku_seq',
  greatest(
    (select coalesce(max((regexp_replace(sku, '^PRD-', ''))::bigint), 0)
       from public.estoque_itens
      where sku ~ '^PRD-[0-9]+$'),
    1
  )
);

-- 2. Ninguém fica pra trás: quem ainda não tem código ganha o próximo, em
--    ordem de cadastro (a numeração conta a história do catálogo).
update public.estoque_itens i
   set sku = 'PRD-' || lpad(nextval('public.estoque_sku_seq')::text, 4, '0'),
       updated_at = now()
  from (select id from public.estoque_itens where sku is null or btrim(sku) = '' order by created_at, id) ordem
 where i.id = ordem.id;

-- 3. Código repetido deixa de ser possível NO BANCO. A tela já recusava
--    ("Já é o SKU de …"), mas tela não segura script nem importação — e dois
--    itens com o mesmo código fazem a bipagem não ter resposta certa.
--    Se este passo falhar com "could not create unique index", o catálogo JÁ
--    tem duplicata: rode
--      select sku, count(*) from estoque_itens group by sku having count(*) > 1;
--    arrume os apontados e rode este arquivo de novo.
create unique index if not exists estoque_itens_sku_unico
  on public.estoque_itens (upper(sku))
  where sku is not null;

-- 4. O gatilho: INSERT sem código ganha o próximo.
-- `currval` estoura se nextval nunca rodou nesta sessão; este apoio devolve o
-- último valor GRAVADO da sequence sem essa exigência.
create or replace function public.currval_ou_zero()
returns bigint language sql as $$
  select last_value from public.estoque_sku_seq
$$;

create or replace function public.estoque_sku_automatico()
returns trigger language plpgsql as $$
begin
  if new.sku is null or btrim(new.sku) = '' then
    new.sku := 'PRD-' || lpad(nextval('public.estoque_sku_seq')::text, 4, '0');
  elsif new.sku ~ '^PRD-[0-9]+$' then
    -- Quem chega com um PRD-#### escolhido À MÃO acima do contador (importação
    -- de histórico, por exemplo) empurra a sequence junto — senão o próximo
    -- automático colidiria com ele e todo cadastro seguinte falharia no índice.
    perform setval(
      'public.estoque_sku_seq',
      greatest(currval_ou_zero(), (regexp_replace(new.sku, '^PRD-', ''))::bigint)
    );
  end if;
  return new;
end $$;

drop trigger if exists estoque_sku_automatico on public.estoque_itens;
create trigger estoque_sku_automatico
  before insert on public.estoque_itens
  for each row execute function public.estoque_sku_automatico();

-- Confere: zero sem código, e o próximo número que um cadastro novo vai ganhar.
select
  count(*) filter (where sku is null or btrim(sku) = '') as sem_codigo,
  count(*) filter (where sku ~ '^PRD-[0-9]+$') as no_padrao,
  'PRD-' || lpad(((select last_value from public.estoque_sku_seq) + 1)::text, 4, '0') as proximo
from public.estoque_itens;
