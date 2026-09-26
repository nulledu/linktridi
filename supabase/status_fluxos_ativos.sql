-- Página de status (Gatus na VPS do gedux) — quais funis monitorar.
--
-- Regra pedida: funil publicado que RECEBEU VISITA nos últimos 7 dias entra no
-- monitor; sem visita, sai sozinho. O coletor da VPS chama esta função 1x por
-- hora pela API REST do Supabase com a chave ANON (a VPS não guarda segredo).
--
-- Por isso SECURITY DEFINER + só duas colunas públicas: slug e host já estão
-- no link do anúncio que qualquer pessoa abre. Nome interno do bot, pixel,
-- sessão e resposta NÃO saem daqui.
--
-- Idempotente: pode rodar de novo sem erro.

create or replace function public.status_fluxos_ativos()
returns table (slug text, host text)
language sql
stable
security definer
set search_path = public
as $$
  select b.slug, d.host
  from public.tridiflow_bots b
  left join public.tridiflow_dominios d on d.id = b.dominio_id
  where b.status = 'publicado'
    and coalesce(b.tipo, 'flow') <> 'page'
    and exists (
      select 1 from public.tridiflow_sessoes s
      where s.bot_id = b.id
        and s.iniciada_em >= now() - interval '7 days'
    )
  order by b.slug
  limit 200;
$$;

revoke all on function public.status_fluxos_ativos() from public;
grant execute on function public.status_fluxos_ativos() to anon, authenticated, service_role;
