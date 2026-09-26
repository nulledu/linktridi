-- ── Mercadinho · Guaraná Antarctica (Bebidas), em "Produtos sem código" ─────
-- Rodar no Supabase da plataforma (schema `mercadinho`, supabase/mercadinho-novo.sql).
--
-- Três tamanhos de Guaraná Antarctica. Entram com `sem_codigo = true`, igual
-- aos congelados: além de bipar pelo EAN, aparecem na categoria "Produtos sem
-- código" do tablet, achados por toque. Lata gelada sai da geladeira molhada e
-- o leitor erra — o toque é o caminho que sempre funciona.
--
-- Idempotente por `codigo_barras`: atualiza o que já existe, insere só o que
-- falta. Preço POR UNIDADE já existente não é sobrescrito.
--
-- Mesmas duas restrições do arquivo dos congelados: nada de `on conflict` (o
-- banco não tem os `unique` do mercadinho-novo.sql, dá 42P10) e nada de tabela
-- temporária (o editor do Supabase não a mantém entre comandos, dá 42P01).

-- 1. A prateleira.
insert into mercadinho.categorias (nome)
select 'Bebidas'
 where not exists (select 1 from mercadinho.categorias where nome = 'Bebidas');

-- 2. O que já existe pelo código de barras: atualiza e marca "sem código".
with n(nome, codigo_barras, preco) as (values
  ('Guaraná Antarctica',        '7891991000826', 4.69),
  ('Guarana antarctica 200ml',  '7891991014908', 3.55),
  ('Guaraná Antarctica 269ML',  '7891991012867', 2.69)
)
update mercadinho.produtos p
   set nome          = n.nome,
       categoria_id  = (select id from mercadinho.categorias where nome = 'Bebidas'),
       preco_padrao  = n.preco::numeric(12,2),
       sem_codigo    = true,
       ativo         = true,
       atualizado_em = now()
  from n
 where p.codigo_barras = n.codigo_barras;

-- 3. O que falta: cadastra.
with n(nome, codigo_barras, preco) as (values
  ('Guaraná Antarctica',        '7891991000826', 4.69),
  ('Guarana antarctica 200ml',  '7891991014908', 3.55),
  ('Guaraná Antarctica 269ML',  '7891991012867', 2.69)
)
insert into mercadinho.produtos (nome, codigo_barras, categoria_id, preco_padrao, sem_codigo, ativo)
select n.nome, n.codigo_barras,
       (select id from mercadinho.categorias where nome = 'Bebidas'),
       n.preco::numeric(12,2), true, true
  from n
 where not exists (select 1 from mercadinho.produtos p where p.codigo_barras = n.codigo_barras);

-- 4. Preço em CADA unidade ativa. Sem preço o produto some do catálogo do tablet.
with n(codigo_barras, preco) as (values
  ('7891991000826', 4.69), ('7891991014908', 3.55), ('7891991012867', 2.69)
)
insert into mercadinho.precos (unidade_id, produto_id, preco)
select u.id, p.id, n.preco::numeric(12,2)
  from mercadinho.unidades u
  cross join n
  join mercadinho.produtos p on p.codigo_barras = n.codigo_barras
 where u.ativo
   and not exists (select 1 from mercadinho.precos x where x.unidade_id = u.id and x.produto_id = p.id);

-- 5. Linha de estoque em CADA unidade ativa — sem ela o produto nasce
--    invisível no tablet, mesmo cadastrado e com preço.
with n(codigo_barras) as (values
  ('7891991000826'), ('7891991014908'), ('7891991012867')
)
insert into mercadinho.estoque (unidade_id, produto_id, quantidade, minimo)
select u.id, p.id, 0, 5
  from mercadinho.unidades u
  cross join n
  join mercadinho.produtos p on p.codigo_barras = n.codigo_barras
 where u.ativo
   and not exists (select 1 from mercadinho.estoque x where x.unidade_id = u.id and x.produto_id = p.id);

-- Conferir (tem que voltar 3 linhas, todas com sem_codigo = t):
-- select p.nome, p.codigo_barras, p.preco_padrao, p.sem_codigo, c.nome as categoria
--   from mercadinho.produtos p
--   left join mercadinho.categorias c on c.id = p.categoria_id
--  where p.codigo_barras in ('7891991000826','7891991014908','7891991012867')
--  order by p.preco_padrao desc;
