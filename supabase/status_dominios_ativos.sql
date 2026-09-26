-- Página de status — quais DOMÍNIOS monitorar.
--
-- Regra pedida (17/09/2026): "os ativos são monitorados, inativos não". Quem
-- decide é o interruptor "Domínio ativo" da ficha em Acessos & Infra
-- (`infra_dominios.ativo`) — desmarcar tira o domínio da página de status no
-- máximo uma hora depois, sem ninguém mexer em servidor.
--
-- Entram também os endereços ligados DENTRO do produto (`tridiflow_dominios`:
-- funil, página, LinkTridi, loja), porque esses o cliente já está usando mesmo
-- que ninguém tenha cadastrado no inventário.
--
-- Saem os que o Gatus já vigia por conta própria no base.yaml — senão o mesmo
-- endereço apareceria duas vezes, em dois cartões diferentes.
--
-- O coletor da VPS chama esta função 1x por hora com a chave ANON (a VPS não
-- guarda segredo). Por isso SECURITY DEFINER e só o que é público de qualquer
-- jeito: o nome do domínio, que está no whois. Registrador, valor de renovação,
-- responsável e observação NÃO saem daqui.
--
-- Idempotente: pode rodar de novo sem erro.

create or replace function public.status_dominios_ativos()
returns table (host text, origem text)
language sql
stable
security definer
set search_path = public
as $$
  with inventario as (
    select
      lower(trim(both '/' from regexp_replace(trim(dominio), '^https?://', ''))) as host,
      'infra'::text as origem
    from public.infra_dominios
    where coalesce(ativo, true)
      and coalesce(trim(dominio), '') <> ''
  ),
  produto as (
    select lower(trim(host)) as host, 'produto'::text as origem
    from public.tridiflow_dominios
    where coalesce(trim(host), '') <> ''
  ),
  tudo as (
    select * from inventario
    union all
    select * from produto
  )
  select t.host, min(t.origem) as origem
  from tudo t
  where t.host <> ''
    and t.host not like '%/%'
    -- Já têm cartão próprio no base.yaml do Gatus.
    and t.host not in ('gedux.com.br', 'www.sistematridi.com.br', 'tridigaius.vercel.app', 'chat.carimbostridi.com')
    -- Site de tutoriais: cartão próprio em status_tutoriais_publicos(), com a
    -- central e cada tutorial. Aqui ele apareceria como "um endereço no meio
    -- dos 19 da gaveta", que é o contrário do que o QR impresso pede.
    and t.host not in ('www.carimbostridii.com.br', 'carimbostridii.com.br')
  group by t.host
  order by t.host
  limit 100;
$$;

revoke all on function public.status_dominios_ativos() from public;
grant execute on function public.status_dominios_ativos() to anon, authenticated, service_role;
