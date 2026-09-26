-- ═════════════════════════════════════════════════════════════════════════════
-- CATÁLOGO COMPARTILHADO — a mesma peça vendida em mais de uma loja
--
-- Rode este arquivo inteiro no SQL Editor do Supabase. É IDEMPOTENTE.
-- Depende de `supabase/lojas.sql`.
--
-- ── O problema ──────────────────────────────────────────────────────────────
--
-- Loja, aqui, é ORGANIZAÇÃO — não necessariamente outro negócio com outro
-- estoque. Quem separa "Carimbos" de "Chancelas" em duas vitrines quase sempre
-- vende as MESMAS peças nas duas, e até aqui isso obrigava a cadastrar o
-- produto duas vezes: duas fotos pra subir, dois preços pra manter sincronizados
-- e dois estoques que divergem no primeiro dia movimentado.
--
-- ── A decisão: vínculo, não cópia ───────────────────────────────────────────
--
-- O produto continua tendo UM dono (`loja_produtos.loja_id`) e ganha um vínculo
-- com as outras lojas que o vendem. Copiar a linha seria mais simples de ler e
-- errado no que importa: dois registros do mesmo produto significam dois
-- estoques, e o segundo pedido do dia vende uma peça que já saiu.
--
-- Com vínculo, o estoque é UM. Reservar na loja A desconta na loja B, porque é
-- a mesma prateleira — que é justamente o que "usar os mesmos produtos" quer
-- dizer.
-- ═════════════════════════════════════════════════════════════════════════════

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
