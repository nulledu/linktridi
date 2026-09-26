-- ── TridiMarket · Produtos "sem código" ─────────────────────────────────────
-- Rodar no Supabase do MERCADINHO (wcxhyludixozqloqzjpn).
--
-- Marca um produto como "sem código de barras" (brownie, paçoca, granel…). No
-- tablet ele NÃO some — passa a aparecer numa categoria própria "Produtos sem
-- código", pra a pessoa tocar em vez de bipar. O toggle fica na aba Produtos.
--
-- Idempotente.
alter table public.produtos
  add column if not exists sem_codigo boolean not null default false;

-- Filtro rápido "todos os sem código" (a lista do tablet agrupa por isto).
create index if not exists produtos_sem_codigo on public.produtos (sem_codigo) where sem_codigo;
