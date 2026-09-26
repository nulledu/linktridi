-- ── Mercadinho · Salgadinhos (chips), em "Produtos sem código" ──────────────
-- Rodar no Supabase da plataforma (schema `mercadinho`, supabase/mercadinho-novo.sql).
--
-- Quatro salgadinhos de R$ 2,99. Entram com `sem_codigo = true`, igual aos
-- congelados e ao guaraná: além de bipar pelo EAN, aparecem na categoria
-- "Produtos sem código" do tablet, achados por toque. Saco de salgadinho é
-- metalizado e chega amassado da prateleira — o código deforma e o leitor erra.
-- O toque é o caminho que sempre funciona.
--
-- Idempotente por `codigo_barras`: atualiza o que já existe, insere só o que
-- falta. Preço POR UNIDADE já existente não é sobrescrito.
--
-- Mesmas duas restrições dos arquivos anteriores: nada de `on conflict` (o
-- banco não tem os `unique` do mercadinho-novo.sql, dá 42P10) e nada de tabela
-- temporária (o editor do Supabase não a mantém entre comandos, dá 42P01).

-- 1. A prateleira.
insert into mercadinho.categorias (nome)
select 'Salgados'
 where not exists (select 1 from mercadinho.categorias where nome = 'Salgados');

-- 2. O que já existe pelo código de barras: atualiza e marca "sem código".
with n(nome, codigo_barras, preco) as (values
  ('Chocolate Flawored chips',      '7896064205702', 2.99),
  ('Point chips',                   '7898088791643', 2.99),
  ('Point Chips cheddar com bacon', '7898088791704', 2.99),
  ('Point Chips costelinha',        '7898088791698', 2.99)
)
update mercadinho.produtos p
   set nome          = n.nome,
       categoria_id  = (select id from mercadinho.categorias where nome = 'Salgados'),
       preco_padrao  = n.preco::numeric(12,2),
       sem_codigo    = true,
       ativo         = true,
       atualizado_em = now()
  from n
 where p.codigo_barras = n.codigo_barras;

-- 3. O que falta: cadastra.
with n(nome, codigo_barras, preco) as (values
  ('Chocolate Flawored chips',      '7896064205702', 2.99),
  ('Point chips',                   '7898088791643', 2.99),
  ('Point Chips cheddar com bacon', '7898088791704', 2.99),
  ('Point Chips costelinha',        '7898088791698', 2.99)
)
insert into mercadinho.produtos (nome, codigo_barras, categoria_id, preco_padrao, sem_codigo, ativo)
select n.nome, n.codigo_barras,
       (select id from mercadinho.categorias where nome = 'Salgados'),
       n.preco::numeric(12,2), true, true
  from n
 where not exists (select 1 from mercadinho.produtos p where p.codigo_barras = n.codigo_barras);

-- 4. Preço em CADA unidade ativa. Sem preço o produto some do catálogo do tablet.
with n(codigo_barras, preco) as (values
  ('7896064205702', 2.99), ('7898088791643', 2.99),
  ('7898088791704', 2.99), ('7898088791698', 2.99)
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
  ('7896064205702'), ('7898088791643'), ('7898088791704'), ('7898088791698')
)
insert into mercadinho.estoque (unidade_id, produto_id, quantidade, minimo)
select u.id, p.id, 0, 5
  from mercadinho.unidades u
  cross join n
  join mercadinho.produtos p on p.codigo_barras = n.codigo_barras
 where u.ativo
   and not exists (select 1 from mercadinho.estoque x where x.unidade_id = u.id and x.produto_id = p.id);

-- Conferir (tem que voltar 4 linhas, todas com sem_codigo = t):
-- select p.nome, p.codigo_barras, p.preco_padrao, p.sem_codigo, c.nome as categoria
--   from mercadinho.produtos p
--   left join mercadinho.categorias c on c.id = p.categoria_id
--  where p.codigo_barras in ('7896064205702','7898088791643','7898088791704','7898088791698')
--  order by p.nome;
