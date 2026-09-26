-- ─────────────────────────────────────────────────────────────────────────────
-- TridiMarket · como o produto se APRESENTA no totem
--
-- Rodar no projeto do TridiMarket (wcxhyludixozqloqzjpn). Idempotente: pode
-- rodar de novo sem quebrar nada.
--
-- POR QUE UMA TABELA NOVA, e não colunas em `produtos` (legado) nem em
-- `market_product_rules`:
--
--   · `produtos` é do ERP e é lido por outros sistemas. Campo que só existe
--     para o mercadinho não tem por que sujar o cadastro de todo mundo.
--   · `market_product_rules` é POR UNIDADE (profile_id + product_id): é onde
--     mora política de estoque, que muda de loja pra loja. Já "nome curto" e
--     "apelidos de busca" são do PRODUTO — a Coca-Cola se chama Coca em toda
--     unidade. Guardar por unidade obrigaria a repetir o mesmo texto N vezes e
--     deixaria as unidades divergirem sem motivo.
--
-- O que cada campo resolve (todos vieram da lista do totem):
--
--   nome_curto      → o nome do ERP não cabe no card ("REFRIGERANTE COCA-COLA
--                     LATA 350ML"). É este que o tablet mostra quando existe.
--   marca           → busca por marca. Quem procura "coca" não digita o nome
--                     completo do cadastro.
--   apelidos        → como as pessoas realmente chamam o produto ("guaraná",
--                     "zero", "refri"). Sem isso a busca só acha quem acerta o
--                     nome oficial.
--   codigo_interno  → produto SEM código de barras (fracionado, caseiro, sem
--                     embalagem). Vira etiqueta/QR impresso e passa a ser
--                     bipável como qualquer outro.
--   destaque/ordem  → o que aparece primeiro no totem, sem depender do
--                     histórico de compras da pessoa.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.market_produto_totem (
  product_id     bigint      primary key references public.produtos(id) on delete cascade,
  nome_curto     text,
  marca          text,
  -- Palavras alternativas de busca. Array pra permitir várias sem inventar
  -- separador e ter que fazer split no cliente.
  apelidos       text[]      not null default '{}',
  -- Código próprio do mercadinho pra quem não tem código de barras. ÚNICO: dois
  -- produtos com o mesmo código interno fariam o leitor escolher um deles em
  -- silêncio — exatamente o erro que ninguém percebe na hora.
  codigo_interno text        unique,
  destaque       boolean     not null default false,
  ordem          integer,
  updated_at     timestamptz not null default now()
);

-- Busca por código interno é o caminho do leitor: precisa ser imediata.
-- (o `unique` acima já cria índice, este cobre a busca por destaque/ordem)
create index if not exists market_produto_totem_destaque_idx
  on public.market_produto_totem (destaque, ordem)
  where destaque = true;

-- Mesma postura das outras tabelas do mercadinho: nada de acesso anônimo. Só o
-- service_role (as rotas /api/tridimarket/*) enxerga.
alter table public.market_produto_totem enable row level security;
revoke all on table public.market_produto_totem from public, anon, authenticated;
grant all on table public.market_produto_totem to service_role;

-- Normaliza o código interno: sem espaço nas pontas e vazio vira NULL, senão
-- duas linhas com '' colidiriam no unique e o segundo cadastro falharia com
-- uma mensagem que não explica nada.
create or replace function public.market_produto_totem_normaliza()
returns trigger
language plpgsql
as $$
begin
  new.codigo_interno := nullif(btrim(coalesce(new.codigo_interno, '')), '');
  new.nome_curto     := nullif(btrim(coalesce(new.nome_curto, '')), '');
  new.marca          := nullif(btrim(coalesce(new.marca, '')), '');
  new.updated_at     := now();
  return new;
end;
$$;

drop trigger if exists market_produto_totem_normaliza_trg on public.market_produto_totem;
create trigger market_produto_totem_normaliza_trg
  before insert or update on public.market_produto_totem
  for each row execute function public.market_produto_totem_normaliza();
