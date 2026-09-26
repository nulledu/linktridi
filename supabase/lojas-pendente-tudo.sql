-- ═════════════════════════════════════════════════════════════════════════════
-- LOJAS — TUDO QUE ESTÁ PENDENTE
--
-- Os quatro arquivos que ainda não foram aplicados, na ordem de dependência.
-- Rode ESTE arquivo inteiro no SQL Editor do Supabase, de uma vez.
--
-- É IDEMPOTENTE: pode rodar de novo sem apagar nada e sem quebrar se metade já
-- existir. Depende de `supabase/lojas.sql` (já aplicado) e de
-- `supabase/lojas-tema.sql` (já aplicado).
--
-- O que cada bloco liga:
--
--   1. ANALYTICS      → a tela de Análises (acessos, estados, origem) e o
--                       faturamento por loja em "Minhas lojas".
--   2. CATÁLOGO       → "Usar de outra loja" em Produtos.
--   3. PÁGINAS/MENUS  → as telas Páginas e Navegação.
--   4. IDENTIDADE     → "Dados da loja" (logo, favicon, título de busca).
--
-- Sem eles nada quebra: cada tela abre, avisa o que falta e a vitrine continua
-- funcionando. Depois de rodar, elas passam a gravar sem nenhuma outra mudança.
-- ═════════════════════════════════════════════════════════════════════════════



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  1. ANALYTICS DA VITRINE                                               ║
-- ║  origem: supabase/lojas-analytics.sql                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Acessos ──────────────────────────────────────────────────────────────
create table if not exists public.loja_acessos (
  id           bigserial primary key,
  loja_id      uuid not null references public.lojas(id) on delete cascade,
  criado_em    timestamptz not null default now(),

  -- Identidade ANÔNIMA, gerada pelo próprio sistema e guardada em cookie
  -- primário. Não é login, não é e-mail, não dá pra chegar numa pessoa a
  -- partir dela — serve só pra separar "duas visitas" de "duas pessoas".
  visitante    uuid not null,
  sessao       uuid not null,
  novo         boolean not null default false,   -- primeira sessão deste visitante
  primeira     boolean not null default false,   -- primeira visualização da sessão

  caminho      text not null,                    -- sem query: `?utm=` não é página
  template     text,                             -- inicio | produto | colecao | busca | carrinho

  uf           text,                             -- só quando o país é BR
  pais         text,
  dispositivo  text,                             -- celular | tablet | computador

  canal        text not null default 'direto',   -- direto | busca | social | indicacao | campanha | email
  fonte        text,
  campanha     text,
  referencia   text                              -- host do referrer, pra auditoria
);

-- O índice que sustenta TODA consulta do relatório: sempre uma loja, sempre um
-- período. Sem ele, cada gráfico varre a tabela inteira.
create index if not exists loja_acessos_loja_data on public.loja_acessos (loja_id, criado_em desc);
-- Contar sessões distintas é a operação mais cara da tela.
create index if not exists loja_acessos_sessao on public.loja_acessos (loja_id, sessao);

alter table public.loja_acessos enable row level security;
-- Sem política: ninguém entra pela sessão do navegador. O aplicativo lê com
-- `service_role`, que passa por cima da RLS — e é justamente por isso que a
-- ausência de política aqui é a trava certa, e não um esquecimento.

comment on table public.loja_acessos is
  'Visualizações da vitrine pública. Sem IP. Retenção de 90 dias (loja_acessos_limpar).';

-- ── 2. Atribuição no pedido ─────────────────────────────────────────────────
-- O pedido guarda de onde veio a PRIMEIRA visita daquela pessoa (janela de 30
-- dias, cookie `la`). Não é a origem da visita em que ela comprou: quem
-- descobre a loja por um anúncio costuma voltar direto pra fechar, e atribuir
-- ao último clique faria todo anúncio parecer que não vendeu nada.
alter table public.loja_pedidos add column if not exists visitante uuid;
alter table public.loja_pedidos add column if not exists sessao    uuid;
alter table public.loja_pedidos add column if not exists uf        text;
alter table public.loja_pedidos add column if not exists canal     text;
alter table public.loja_pedidos add column if not exists fonte     text;
alter table public.loja_pedidos add column if not exists campanha  text;

create index if not exists loja_pedidos_loja_data on public.loja_pedidos (loja_id, feito_em desc);

-- ── 3. Resumo do período ────────────────────────────────────────────────────
create or replace function public.loja_acessos_resumo(
  p_loja uuid, p_de timestamptz, p_ate timestamptz
) returns table (
  visualizacoes bigint, sessoes bigint, visitantes bigint,
  novos bigint, recorrentes bigint, sessoes_de_uma_pagina bigint
) language sql stable as $$
  with base as (
    select * from public.loja_acessos
    where loja_id = p_loja and criado_em >= p_de and criado_em < p_ate
  ), por_sessao as (
    select sessao, bool_or(novo) as novo, count(*) as vistas
    from base group by sessao
  )
  select
    (select count(*) from base),
    (select count(*) from por_sessao),
    (select count(distinct visitante) from base),
    (select count(*) from por_sessao where novo),
    (select count(*) from por_sessao where not novo),
    -- Sessão que viu UMA página e foi embora. É a taxa de rejeição, contada do
    -- jeito honesto: sem evento de saída, não dá pra saber tempo de permanência.
    (select count(*) from por_sessao where vistas = 1);
$$;

-- ── 4. Série por dia ────────────────────────────────────────────────────────
create or replace function public.loja_acessos_serie(
  p_loja uuid, p_de timestamptz, p_ate timestamptz
) returns table (dia date, sessoes bigint, visualizacoes bigint)
language sql stable as $$
  select
    (criado_em at time zone 'America/Sao_Paulo')::date as dia,
    count(distinct sessao),
    count(*)
  from public.loja_acessos
  where loja_id = p_loja and criado_em >= p_de and criado_em < p_ate
  group by 1
  order by 1;
$$;

-- ── 5. Top por dimensão ─────────────────────────────────────────────────────
-- `p_dim` é resolvido por CASE e não por SQL dinâmico: nome de coluna vindo de
-- fora, concatenado numa string, é injeção esperando acontecer. Dimensão
-- desconhecida devolve vazio, e não a tabela inteira.
create or replace function public.loja_acessos_top(
  p_loja uuid, p_de timestamptz, p_ate timestamptz,
  p_dim text, p_limite int default 20
) returns table (chave text, sessoes bigint, visualizacoes bigint)
language sql stable as $$
  select
    coalesce(
      case p_dim
        when 'uf'          then uf
        when 'pais'        then pais
        when 'dispositivo' then dispositivo
        when 'canal'       then canal
        when 'fonte'       then fonte
        when 'campanha'    then campanha
        when 'caminho'     then caminho
        when 'template'    then template
      end, '—') as chave,
    count(distinct sessao),
    count(*)
  from public.loja_acessos
  where loja_id = p_loja and criado_em >= p_de and criado_em < p_ate
    and p_dim in ('uf','pais','dispositivo','canal','fonte','campanha','caminho','template')
  group by 1
  order by 2 desc, 3 desc
  limit greatest(1, least(coalesce(p_limite, 20), 100));
$$;

-- ── 6. Receita por dimensão ─────────────────────────────────────────────────
-- Só pedido PAGO conta como faturamento. Pendente é promessa e estornado é
-- dinheiro que voltou; somar os dois faria o relatório dizer 900 quando
-- entraram 100.
create or replace function public.loja_receita_top(
  p_loja uuid, p_de timestamptz, p_ate timestamptz,
  p_dim text, p_limite int default 20
) returns table (chave text, pedidos bigint, receita numeric)
language sql stable as $$
  select
    coalesce(
      case p_dim
        when 'uf'       then uf
        when 'canal'    then canal
        when 'fonte'    then fonte
        when 'campanha' then campanha
      end, '—') as chave,
    count(*),
    coalesce(sum(total), 0)
  from public.loja_pedidos
  where loja_id = p_loja and feito_em >= p_de and feito_em < p_ate
    and pagamento = 'pago'
    and p_dim in ('uf','canal','fonte','campanha')
  group by 1
  order by 3 desc
  limit greatest(1, least(coalesce(p_limite, 20), 100));
$$;

-- ── 6b. Receita por dia ─────────────────────────────────────────────────────
-- Serve pra desenhar faturamento e acesso na MESMA curva. Sem isto, a receita
-- viria da listagem de pedidos, que tem teto de 200 linhas — e um período de 90
-- dias apareceria truncado sem ninguém perceber.
create or replace function public.loja_receita_serie(
  p_loja uuid, p_de timestamptz, p_ate timestamptz
) returns table (dia date, pedidos bigint, receita numeric)
language sql stable as $$
  select
    (feito_em at time zone 'America/Sao_Paulo')::date as dia,
    count(*),
    coalesce(sum(total), 0)
  from public.loja_pedidos
  where loja_id = p_loja and feito_em >= p_de and feito_em < p_ate and pagamento = 'pago'
  group by 1
  order by 1;
$$;

-- ── 7. Faturamento por loja ─────────────────────────────────────────────────
-- A comparação entre lojas, numa consulta só. Uma consulta por loja seria N
-- idas ao banco pra desenhar uma lista.
create or replace function public.lojas_faturamento(
  p_de timestamptz, p_ate timestamptz
) returns table (loja_id uuid, pedidos bigint, receita numeric, sessoes bigint)
language sql stable as $$
  with vendas as (
    select loja_id, count(*) as pedidos, coalesce(sum(total), 0) as receita
    from public.loja_pedidos
    where feito_em >= p_de and feito_em < p_ate and pagamento = 'pago'
    group by loja_id
  ), acessos as (
    select loja_id, count(distinct sessao) as sessoes
    from public.loja_acessos
    where criado_em >= p_de and criado_em < p_ate
    group by loja_id
  )
  select
    l.id,
    coalesce(v.pedidos, 0),
    coalesce(v.receita, 0),
    coalesce(a.sessoes, 0)
  from public.lojas l
  left join vendas  v on v.loja_id = l.id
  left join acessos a on a.loja_id = l.id
  order by coalesce(v.receita, 0) desc;
$$;

-- ── 8. Poda ─────────────────────────────────────────────────────────────────
create or replace function public.loja_acessos_limpar(p_dias int default 90)
returns bigint language plpgsql as $$
declare apagados bigint;
begin
  delete from public.loja_acessos
  where criado_em < now() - (greatest(7, p_dias) || ' days')::interval;
  get diagnostics apagados = row_count;
  return apagados;
end;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  2. CATÁLOGO COMPARTILHADO                                             ║
-- ║  origem: supabase/lojas-catalogo-compartilhado.sql                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create table if not exists public.loja_catalogo (
  loja_id    uuid not null references public.lojas(id)         on delete cascade,
  produto_id uuid not null references public.loja_produtos(id) on delete cascade,
  criado_em  timestamptz not null default now(),
  primary key (loja_id, produto_id)
);

-- A consulta da vitrine é sempre "os produtos DESTA loja".
create index if not exists loja_catalogo_loja on public.loja_catalogo (loja_id);
-- E a do painel é "em que lojas este produto está", pra poder desvincular.
create index if not exists loja_catalogo_produto on public.loja_catalogo (produto_id);

alter table public.loja_catalogo enable row level security;
-- Sem política: o aplicativo lê com `service_role`. Ninguém entra pela sessão
-- do navegador.

comment on table public.loja_catalogo is
  'Produto de uma loja vendido TAMBÉM em outra. Vínculo, não cópia: o estoque continua sendo um só.';

-- ── A leitura ───────────────────────────────────────────────────────────────
-- Os produtos de uma loja são os PRÓPRIOS mais os VINCULADOS, numa consulta só.
-- Duas consultas somadas no aplicativo dariam o mesmo resultado pagando duas
-- idas ao banco — e a vitrine é a página que um anúncio enche de gente.
--
-- `compartilhado` diz de onde a peça veio: o painel mostra a etiqueta e esconde
-- o botão de excluir (quem apaga é a loja dona), e a vitrine ignora o campo.
create or replace function public.loja_produtos_da_loja(
  p_loja uuid, p_somente_ativos boolean default false, p_limite int default 300
) returns table (
  id uuid, loja_id uuid, titulo text, descricao text, imagens jsonb,
  preco numeric, preco_promocional numeric, custo numeric, estoque int,
  vender_sem_estoque boolean, sku text, codigo_barras text, categorias text[],
  status text, updated_at timestamptz, compartilhado boolean
) language sql stable as $$
  select
    p.id, p.loja_id, p.titulo, p.descricao, p.imagens,
    p.preco, p.preco_promocional, p.custo, p.estoque,
    p.vender_sem_estoque, p.sku, p.codigo_barras, p.categorias,
    p.status, p.updated_at,
    (p.loja_id <> p_loja) as compartilhado
  from public.loja_produtos p
  where (
    p.loja_id = p_loja
    or exists (select 1 from public.loja_catalogo c where c.loja_id = p_loja and c.produto_id = p.id)
  )
  and (not p_somente_ativos or p.status = 'ativo')
  order by p.updated_at desc
  limit greatest(1, least(coalesce(p_limite, 300), 500));
$$;

-- ── O que dá pra trazer ─────────────────────────────────────────────────────
-- Produtos das OUTRAS lojas que esta ainda não vende. É a lista do painel de
-- "usar produtos de outra loja"; sem o `not exists`, o que já foi trazido
-- apareceria de novo pra ser trazido outra vez.
create or replace function public.loja_produtos_disponiveis(
  p_loja uuid, p_limite int default 300
) returns table (
  id uuid, titulo text, sku text, preco numeric, estoque int,
  status text, imagens jsonb, loja_id uuid, loja_nome text
) language sql stable as $$
  select p.id, p.titulo, p.sku, p.preco, p.estoque, p.status, p.imagens, p.loja_id, l.nome
  from public.loja_produtos p
  join public.lojas l on l.id = p.loja_id
  where p.loja_id <> p_loja
    and not exists (
      select 1 from public.loja_catalogo c where c.loja_id = p_loja and c.produto_id = p.id
    )
  order by l.nome, p.titulo
  limit greatest(1, least(coalesce(p_limite, 300), 500));
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  3. PÁGINAS E MENUS                                                    ║
-- ║  origem: supabase/lojas-paginas-menus.sql                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Páginas ──────────────────────────────────────────────────────────────
create table if not exists public.loja_paginas (
  id            uuid primary key default gen_random_uuid(),
  loja_id       uuid not null references public.lojas(id) on delete cascade,
  titulo        text not null,
  handle        text not null,                  -- endereço: /l/<loja>/p/<handle>
  conteudo      text not null default '',       -- HTML simples, higienizado ao SAIR
  status        text not null default 'rascunho',  -- rascunho | publicada
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (loja_id, handle)
);

create index if not exists loja_paginas_loja on public.loja_paginas (loja_id, atualizado_em desc);

alter table public.loja_paginas enable row level security;
-- Sem política: o aplicativo lê com `service_role`. A página PÚBLICA é servida
-- pelo servidor, que já filtra por `status = 'publicada'` — rascunho não vaza
-- por não haver caminho de leitura anônima.

comment on table public.loja_paginas is
  'Páginas institucionais da vitrine (sobre, trocas, privacidade). Conteúdo é HTML do lojista, higienizado na renderização.';

-- `atualizado_em` por gatilho e não pelo aplicativo: a coluna existe pra
-- responder "quando isto mudou", e uma escrita que esqueça de setá-la faz a
-- listagem mentir. O banco é quem sabe quando a linha mudou.
create or replace function public.loja_paginas_carimbar()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists loja_paginas_carimbar on public.loja_paginas;
create trigger loja_paginas_carimbar
  before update on public.loja_paginas
  for each row execute function public.loja_paginas_carimbar();

-- ── 2. Menus ────────────────────────────────────────────────────────────────
create table if not exists public.loja_menus (
  id            uuid primary key default gen_random_uuid(),
  loja_id       uuid not null references public.lojas(id) on delete cascade,
  chave         text not null,                  -- principal | rodape | <livre>
  titulo        text not null,
  -- [{ "titulo": "Carimbos", "destino": "/c/carimbos" }, …] — a ordem do array
  -- É a ordem do menu.
  itens         jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now(),
  unique (loja_id, chave)
);

create index if not exists loja_menus_loja on public.loja_menus (loja_id);

alter table public.loja_menus enable row level security;

comment on table public.loja_menus is
  'Menus da vitrine. `itens` é jsonb porque a ORDEM é a informação — e ordem em tabela filha se reescreve inteira a cada arrastar.';

drop trigger if exists loja_menus_carimbar on public.loja_menus;
create trigger loja_menus_carimbar
  before update on public.loja_menus
  for each row execute function public.loja_paginas_carimbar();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  4. IDENTIDADE DA LOJA                                                 ║
-- ║  origem: supabase/lojas-identidade.sql                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

alter table public.lojas add column if not exists logo_url       text;
alter table public.lojas add column if not exists favicon_url    text;
-- Como a loja aparece no Google e no card do WhatsApp. Vazio = usa o nome da
-- loja, que é o que já acontecia.
alter table public.lojas add column if not exists seo_titulo     text;
alter table public.lojas add column if not exists seo_descricao  text;

comment on column public.lojas.logo_url is
  'Logo da LOJA (identidade). O tema a usa quando o campo de logo do cabeçalho está vazio — trocar de tema não pode apagar a logo.';
comment on column public.lojas.favicon_url is
  'Ícone da aba do navegador. Quadrado, idealmente 512×512 — o navegador reduz.';
comment on column public.lojas.seo_titulo is
  'Título da aba e do resultado de busca. Vazio = o nome da loja.';
comment on column public.lojas.seo_descricao is
  'Descrição que aparece embaixo do título na busca e no card de compartilhamento.';

-- ╔═ 5. BLOCOS DE PÁGINA ═══════════════════════════════════════════════════╗
-- jsonb e não tabela de blocos porque a ORDEM é a informação, e ordem em linha
-- separada vira uma coluna `posicao` reescrita inteira a cada arrastar. Mesma
-- decisão de `loja_menus.itens`.
alter table public.loja_paginas add column if not exists blocos jsonb not null default '[]'::jsonb;

comment on column public.loja_paginas.blocos is
  'Lista ORDENADA de blocos da página (texto, imagem e texto, diferenciais, produtos, chamada, botões, imagem, perguntas). Vazia = a página é o HTML de `conteudo`.';
