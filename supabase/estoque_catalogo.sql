-- ── Estoque NOVO (do zero), separado do estoque ERP ────────────────────────
-- Catálogo de produtos/insumos gerenciado manualmente no site. Alimenta o
-- seletor de "pedir produto" do app de produção (com imagem).

create table if not exists public.estoque_itens (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  categoria   text,
  imagem_url  text,
  unidade     text not null default 'un',
  quantidade  numeric not null default 0,
  qtd_minima  numeric not null default 0,
  ativo       boolean not null default true,
  ordem       int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists estoque_itens_ativo_idx on public.estoque_itens (ativo, categoria, nome);

alter table public.estoque_itens enable row level security;
-- Acesso só via service role nas rotas /api/* — RLS bloqueia o resto.

-- Seed dos produtos que aparecem nas atividades de produção (idempotente).
insert into public.estoque_itens (nome, categoria) values
  ('Almofada', 'Almofadas'),
  ('EVA', 'Insumos'),
  ('Feltro', 'Insumos'),
  ('MDF 3mm', 'Insumos'),
  ('MDF 6mm', 'Insumos'),
  ('Borracha', 'Insumos'),
  ('Dupla face', 'Insumos'),
  ('Laminado', 'Insumos'),
  ('Cola silicone', 'Colas'),
  ('Cola branca', 'Colas'),
  ('Cola bonder', 'Colas'),
  ('Cola PVA', 'Colas'),
  ('Cola transferível', 'Colas'),
  ('Tinta papel preta 30ml', 'Tintas'),
  ('Tinta papel preta 60ml', 'Tintas'),
  ('Tinta papel colorida 30ml', 'Tintas'),
  ('Tinta isopor preta 30ml', 'Tintas'),
  ('Tinta isopor colorida 30ml', 'Tintas'),
  ('Tinta plástico preta 50ml', 'Tintas'),
  ('Tinta plástico colorida 50ml', 'Tintas'),
  ('Fixador 10ml', 'Tintas'),
  ('Carimbo', 'Produtos'),
  ('Chancela', 'Produtos'),
  ('Clichê', 'Produtos'),
  ('Decorativo', 'Produtos'),
  ('Puxador', 'Peças'),
  ('Polvo', 'Brindes'),
  ('Coração', 'Brindes'),
  ('Etiqueta dourada', 'Embalagem'),
  ('Etiqueta prata', 'Embalagem'),
  ('Caixa P', 'Embalagem'),
  ('Caixa M', 'Embalagem')
on conflict (nome) do nothing;
