-- ═════════════════════════════════════════════════════════════════════════════
--  FORNECEDOR COMPLETO — como se paga, como se fala, e mais de uma categoria
-- ═════════════════════════════════════════════════════════════════════════════
--
--  O cadastro tinha nome, CNPJ, uma categoria e um contato. Na prática falta
--  tudo o que se procura na hora de comprar ou de pagar: a chave PIX, a conta
--  para depósito, o WhatsApp de quem atende, quanto tempo a mercadoria demora
--  a chegar, e de onde ela vem.
--
--  Duas mudanças merecem explicação:
--
--  · CATEGORIA vira CATEGORIAS. Um fornecedor de MDF que também vende cola não
--    cabia em uma palavra só, e quem cadastrava escolhia a "mais certa" — o que
--    faz o outro filtro deixá-lo de fora. A coluna antiga CONTINUA existindo e
--    é preenchida com a primeira das novas: telas e consultas que ainda leem
--    `categoria` não quebram no dia do deploy.
--
--  · As categorias ganham CADASTRO (`fin_categorias`). Antes elas eram texto
--    solto, e o filtro mostrava o que estivesse escrito — inclusive "Matéria
--    Prima" e "materia prima" como duas coisas. O cadastro nasce PREENCHIDO com
--    o que já está em uso, então ninguém precisa recadastrar nada.
--
--  Idempotente: rode quantas vezes quiser.
--  Rode DEPOIS de `supabase/financeiro.sql`.

-- ── 1. Colunas novas do fornecedor ───────────────────────────────────────────

alter table public.fin_fornecedores
  -- Mais de uma categoria. `text[]` e não tabela de ligação: categoria aqui é
  -- rótulo de filtro, não entidade com regra — uma tabela a mais custaria um
  -- join em toda listagem para guardar duas palavras.
  add column if not exists categorias     text[],
  -- Como se paga
  add column if not exists pix_tipo        text,
  add column if not exists pix_chave       text,
  add column if not exists banco           text,
  add column if not exists agencia         text,
  add column if not exists conta_numero    text,
  add column if not exists aceita_boleto   boolean not null default false,
  -- Quem é e onde fica
  add column if not exists inscricao_estadual text,
  add column if not exists site            text,
  add column if not exists whatsapp        text,
  add column if not exists cidade          text,
  add column if not exists uf              text,
  add column if not exists endereco        text,
  -- Quanto tempo a mercadoria demora. NÃO confundir com `prazo_dias`, que é o
  -- prazo de PAGAMENTO: um é quando o material chega, o outro é quando o
  -- dinheiro sai, e trocá-los faz a compra ser planejada ao contrário.
  add column if not exists prazo_envio_dias int;

-- A primeira carga: quem tem `categoria` preenchida e `categorias` vazia ganha
-- o array com aquele valor. `where categorias is null` faz disto uma migração
-- de uma vez só — rodar de novo não desfaz o que alguém editou na tela depois.
update public.fin_fornecedores
   set categorias = array[categoria]
 where categorias is null
   and coalesce(btrim(categoria), '') <> '';

-- ── 2. Categoria vira cadastro ───────────────────────────────────────────────
--
-- `escopo` porque contato também categoriza ("encanador", "eletricista") e o
-- vocabulário dele não é o mesmo do fornecedor. Uma tabela com escopo evita
-- duas tabelas iguais que vão divergir.

create table if not exists public.fin_categorias (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.fin_empresas(id) on delete restrict,
  escopo     text not null check (escopo in ('fornecedor', 'contato')),
  nome       text not null,
  cor        text,
  ordem      int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

-- Único por NOME NORMALIZADO, não pelo texto cru: sem isto "Matéria Prima" e
-- "matéria prima" entram como duas categorias e o filtro passa a ter duas
-- linhas para a mesma coisa — que é o defeito que este cadastro veio resolver.
create unique index if not exists fin_categorias_nome
  on public.fin_categorias (empresa_id, escopo, lower(btrim(nome)));

create index if not exists fin_categorias_lista
  on public.fin_categorias (empresa_id, escopo, ordem, nome);

-- ── 3. O cadastro nasce com o que já está em uso ─────────────────────────────
--
-- Cadastro novo e vazio faria a tela pedir para recadastrar categoria que já
-- existe no dado. `on conflict do nothing` deixa isto re-rodável.

insert into public.fin_categorias (empresa_id, escopo, nome)
select distinct f.empresa_id, 'fornecedor', btrim(f.categoria)
  from public.fin_fornecedores f
 where coalesce(btrim(f.categoria), '') <> ''
   and f.deleted_at is null
on conflict do nothing;

insert into public.fin_categorias (empresa_id, escopo, nome)
select distinct c.empresa_id, 'contato', btrim(c.categoria)
  from public.fin_contatos c
 where coalesce(btrim(c.categoria), '') <> ''
   and c.deleted_at is null
on conflict do nothing;

-- ── 4. Gatilho de updated_at e a fechadura ───────────────────────────────────

drop trigger if exists fin_categorias_touch on public.fin_categorias;
create trigger fin_categorias_touch before update on public.fin_categorias
  for each row execute function public.fin_touch();

alter table public.fin_categorias enable row level security;

-- ── Conferência ──────────────────────────────────────────────────────────────
select
  (select count(*) from public.fin_categorias where escopo = 'fornecedor') as categorias_de_fornecedor,
  (select count(*) from public.fin_categorias where escopo = 'contato')    as categorias_de_contato,
  (select count(*) from public.fin_fornecedores where categorias is not null) as fornecedores_com_array;
