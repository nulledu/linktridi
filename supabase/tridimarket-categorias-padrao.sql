-- Categorias iniciais do mercadinho. Rode no Supabase NOVO.
--
-- A tabela `mercadinho.categorias` e `produtos.categoria_id` já existem desde
-- supabase/mercadinho-novo.sql — este arquivo só SEMEIA as prateleiras pedidas,
-- pra o seletor do cadastro não nascer vazio (e ninguém precisar inventar o
-- nome de cada uma, o que geraria "Bebida", "bebidas" e "BEBIDAS" no mesmo
-- catálogo).
--
-- Idempotente: `on conflict (nome) do nothing` — a coluna já é unique. Rodar
-- duas vezes não duplica, e categorias que você criar depois pelo painel não
-- são tocadas.

insert into mercadinho.categorias (nome) values
  ('Bebidas'),
  ('Congelados'),
  ('Doces'),
  ('Salgados'),
  ('Outros')
on conflict (nome) do nothing;

-- Conferir:
-- select id, nome from mercadinho.categorias order by nome;
--
-- Quantos produtos por categoria (os sem categoria aparecem como null):
-- select c.nome, count(p.id)
--   from mercadinho.produtos p
--   left join mercadinho.categorias c on c.id = p.categoria_id
--  group by c.nome order by count(p.id) desc;
