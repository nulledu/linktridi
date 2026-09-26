-- Página de status — o site de TUTORIAIS e cada tutorial publicado (17/09/2026).
--
-- Pedido: "quero que o carimbostridii.com.br apareça ali, e os slugs dele
-- também". O endereço já entrava, mas entrava junto dos 19 domínios da gaveta,
-- no cartão "Domínios" — e era exatamente esse o problema: o link deste site
-- está IMPRESSO em caixa e etiqueta (o QR do /p/<slug>), então ele não pode
-- ficar escondido no meio de domínio parado. Pior: o ENDEREÇO pode estar de pé
-- com a PÁGINA caída (central despublicada, slug renomeado, produto sumido), e
-- é a página que o cliente abre.
--
-- Daqui saem três coisas, todas públicas de qualquer jeito (é o que o QR abre):
--   'site'     -> o endereço (o www e o apex, quando o apex está ativo no
--                 Acessos & Infra). Mesmo teste dos domínios: DNS + certificado.
--   'central'  -> /p/<slug> da central PUBLICADA.
--   'tutorial' -> /p/<slug>/<handle> de cada tutorial PUBLICADO.
--
-- Lê o SNAPSHOT publicado (`published`), não o rascunho: é o snapshot que o
-- /p/<slug>/<handle> serve (`resolverPaginaPublicada`), e tutorial em rascunho
-- responde 404 — monitorá-lo seria pintar vermelho de propósito. Em 17/09/2026
-- os 10 tutoriais ainda são rascunho: por enquanto saem só o site e a central,
-- e cada tutorial publicado entra sozinho na hora seguinte.
--
-- O coletor da VPS chama 1x por hora com a chave ANON (a VPS não guarda
-- segredo). Por isso SECURITY DEFINER e só host + caminho. Título, categoria,
-- métrica de leitura e conteúdo NÃO saem daqui.
--
-- O host é a terceira cópia de DOMINIO_DOS_TUTORIAIS (as outras duas estão em
-- lib/tridiflow-tutoriais.ts e supabase/tutoriais_dominio_travado.sql).
-- Divergir = monitor vigiando endereço que o produto não serve mais; o teste
-- tutoriais-dominio-travado.test.ts compara as três.
--
-- Idempotente: pode rodar de novo sem erro.

create or replace function public.status_tutoriais_publicos()
returns table (tipo text, host text, caminho text)
language sql
stable
security definer
set search_path = public
as $$
  with casa as (
    select 'www.carimbostridii.com.br'::text as host
  ),
  -- O apex entra só se ele existir e estiver ATIVO na ficha do Acessos & Infra:
  -- quem desmarca "Domínio ativo" tira o endereço do monitor, aqui também.
  enderecos as (
    select c.host from casa c
    union
    select regexp_replace(c.host, '^www\.', '')
    from casa c
    where exists (
      select 1 from infra_dominios i
      where lower(trim(both '/' from regexp_replace(trim(i.dominio), '^https?://', '')))
            = regexp_replace(c.host, '^www\.', '')
        and coalesce(i.ativo, true)
    )
  ),
  centrais as (
    select c.host, b.slug, b.published as pub
    from tridiflow_bots b
    join tridiflow_dominios d on d.id = b.dominio_id
    join casa c on c.host = lower(trim(d.host))
    where b.status = 'publicado'
      and coalesce(b.tipo, 'flow') = 'page'
      -- O snapshot publicado é {fluxo, theme, pagina, settings}: o documento
      -- da página mora em `published->'pagina'`, NÃO na raiz. Ler a raiz
      -- devolve nada e a central sumiria do monitor calada.
      and coalesce(b.published->'pagina'->'config'->>'template', '') = 'central_tutoriais'
      and coalesce(b.slug, '') ~ '^[a-z0-9-]{1,120}$'
  ),
  guias as (
    select ce.host, '/p/' || ce.slug || '/' || (t.item->>'handle') as caminho
    from centrais ce
    cross join lateral jsonb_array_elements(
      coalesce(ce.pub->'pagina'->'config'->'centralTutoriais'->'tutoriais', '[]'::jsonb)
    ) as t(item)
    where coalesce(t.item->>'status', '') = 'publicado'
      and coalesce(t.item->>'handle', '') ~ '^[a-z0-9-]{1,120}$'
  ),
  tudo as (
    select 'site'::text as tipo, e.host, ''::text as caminho from enderecos e
    union all
    select 'central'::text, ce.host, '/p/' || ce.slug from centrais ce
    union all
    select 'tutorial'::text, g.host, g.caminho from guias g
  )
  select x.tipo, x.host, x.caminho
  from tudo x
  order by x.tipo, x.host, x.caminho
  limit 100;
$$;

revoke all on function public.status_tutoriais_publicos() from public;
grant execute on function public.status_tutoriais_publicos() to anon, authenticated, service_role;
