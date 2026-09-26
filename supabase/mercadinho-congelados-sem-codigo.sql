-- ── Mercadinho · Congelados novos, todos em "Produtos sem código" ───────────
-- Rodar no Supabase da plataforma (schema `mercadinho`, supabase/mercadinho-novo.sql).
--
-- 17 congelados (hambúrguer Faroeste, fettuccine, lasanha). Todos entram com
-- `sem_codigo = true`: além de bipar pelo EAN, aparecem na categoria "Produtos
-- sem código" do tablet, achados por toque. Foi o pedido — o toque é o caminho
-- que sempre funciona quando a embalagem congelada vem amassada ou molhada e o
-- leitor não pega.
--
-- Idempotente por `codigo_barras`: atualiza o que já existe, insere só o que
-- falta. Preço POR UNIDADE já existente não é sobrescrito — quem ajustou o
-- preço na loja continua com o dele.
--
-- Duas coisas que este arquivo NÃO usa, de propósito:
--   • `on conflict` — o banco em produção não tem os `unique` que o
--     mercadinho-novo.sql descreve, e a cláusula falhava com 42P10.
--   • tabela temporária — o editor SQL do Supabase não a mantém entre os
--     comandos (42P01). Por isso a lista aparece repetida num `with` em cada
--     statement: é feio, mas é o que roda em qualquer sessão.

-- 1. A prateleira.
insert into mercadinho.categorias (nome)
select 'Congelados'
 where not exists (select 1 from mercadinho.categorias where nome = 'Congelados');

-- 2. O que já existe pelo código de barras: atualiza e marca "sem código".
with n(nome, codigo_barras, preco) as (values
  ('Faroeste Burguer Bacon Aurora',                        '7891164026943',  9.99),
  ('Faroeste Burguer Cheddar Aurora',                      '7891164026974',  9.99),
  ('Faroeste Burguer Frango Aurora',                       '7891164026967',  9.99),
  ('Faroeste Burguer xburguer com molho especial Aurora',  '7891164026950',  9.99),
  ('Fettuccine à bolonhesa',                               '7894904575824', 12.99),
  ('Fettuccine a bolonhesa Perdigão',                      '7891515605803',  9.99),
  ('Fettuccine brocolis',                                  '7894904575794', 12.99),
  ('Lasanha seara de presunto e queijo',                   '7894904072439', 16.99),
  ('Lasanha à bolonhesa seara 600g',                       '7894904082704', 16.99),
  ('Lasanha aurora bolonhesa',                             '7891164026530', 16.99),
  ('Lasanha Bolonhesa Perdigão',                           '7891515496357', 16.99),
  ('Lasanha Bolonhesa Sadia',                              '7891515475703', 16.99),
  ('Lasanha bolonhesa select',                             '7898460934187', 16.99),
  ('Lasanha de frango perdigão',                           '7891515496234', 16.99),
  ('Lasanha seara 4 queijos',                              '7894904082728', 20.99),
  ('Lasanha seara bolonhesa 350g',                         '7894904579668', 12.99),
  ('Lasanha Select 4 queijos',                             '7898460934194', 15.99)
)
update mercadinho.produtos p
   set nome          = n.nome,
       categoria_id  = (select id from mercadinho.categorias where nome = 'Congelados'),
       preco_padrao  = n.preco::numeric(12,2),
       sem_codigo    = true,
       ativo         = true,
       atualizado_em = now()
  from n
 where p.codigo_barras = n.codigo_barras;

-- 3. O que falta: cadastra.
with n(nome, codigo_barras, preco) as (values
  ('Faroeste Burguer Bacon Aurora',                        '7891164026943',  9.99),
  ('Faroeste Burguer Cheddar Aurora',                      '7891164026974',  9.99),
  ('Faroeste Burguer Frango Aurora',                       '7891164026967',  9.99),
  ('Faroeste Burguer xburguer com molho especial Aurora',  '7891164026950',  9.99),
  ('Fettuccine à bolonhesa',                               '7894904575824', 12.99),
  ('Fettuccine a bolonhesa Perdigão',                      '7891515605803',  9.99),
  ('Fettuccine brocolis',                                  '7894904575794', 12.99),
  ('Lasanha seara de presunto e queijo',                   '7894904072439', 16.99),
  ('Lasanha à bolonhesa seara 600g',                       '7894904082704', 16.99),
  ('Lasanha aurora bolonhesa',                             '7891164026530', 16.99),
  ('Lasanha Bolonhesa Perdigão',                           '7891515496357', 16.99),
  ('Lasanha Bolonhesa Sadia',                              '7891515475703', 16.99),
  ('Lasanha bolonhesa select',                             '7898460934187', 16.99),
  ('Lasanha de frango perdigão',                           '7891515496234', 16.99),
  ('Lasanha seara 4 queijos',                              '7894904082728', 20.99),
  ('Lasanha seara bolonhesa 350g',                         '7894904579668', 12.99),
  ('Lasanha Select 4 queijos',                             '7898460934194', 15.99)
)
insert into mercadinho.produtos (nome, codigo_barras, categoria_id, preco_padrao, sem_codigo, ativo)
select n.nome, n.codigo_barras,
       (select id from mercadinho.categorias where nome = 'Congelados'),
       n.preco::numeric(12,2), true, true
  from n
 where not exists (select 1 from mercadinho.produtos p where p.codigo_barras = n.codigo_barras);

-- 4. Preço em CADA unidade ativa. Sem preço o produto some do catálogo do tablet.
with n(codigo_barras, preco) as (values
  ('7891164026943',  9.99), ('7891164026974',  9.99), ('7891164026967',  9.99),
  ('7891164026950',  9.99), ('7894904575824', 12.99), ('7891515605803',  9.99),
  ('7894904575794', 12.99), ('7894904072439', 16.99), ('7894904082704', 16.99),
  ('7891164026530', 16.99), ('7891515496357', 16.99), ('7891515475703', 16.99),
  ('7898460934187', 16.99), ('7891515496234', 16.99), ('7894904082728', 20.99),
  ('7894904579668', 12.99), ('7898460934194', 15.99)
)
insert into mercadinho.precos (unidade_id, produto_id, preco)
select u.id, p.id, n.preco::numeric(12,2)
  from mercadinho.unidades u
  cross join n
  join mercadinho.produtos p on p.codigo_barras = n.codigo_barras
 where u.ativo
   and not exists (select 1 from mercadinho.precos x where x.unidade_id = u.id and x.produto_id = p.id);

-- 5. Linha de estoque em CADA unidade ativa — sem ela o produto nasce
--    invisível no tablet, mesmo cadastrado e com preço (ver o POST de
--    app/api/tridimarket/products/route.ts).
with n(codigo_barras) as (values
  ('7891164026943'), ('7891164026974'), ('7891164026967'), ('7891164026950'),
  ('7894904575824'), ('7891515605803'), ('7894904575794'), ('7894904072439'),
  ('7894904082704'), ('7891164026530'), ('7891515496357'), ('7891515475703'),
  ('7898460934187'), ('7891515496234'), ('7894904082728'), ('7894904579668'),
  ('7898460934194')
)
insert into mercadinho.estoque (unidade_id, produto_id, quantidade, minimo)
select u.id, p.id, 0, 5
  from mercadinho.unidades u
  cross join n
  join mercadinho.produtos p on p.codigo_barras = n.codigo_barras
 where u.ativo
   and not exists (select 1 from mercadinho.estoque x where x.unidade_id = u.id and x.produto_id = p.id);

-- Conferir (tem que voltar 17 linhas, todas com sem_codigo = t):
-- select p.nome, p.codigo_barras, p.preco_padrao, p.sem_codigo, c.nome as categoria
--   from mercadinho.produtos p
--   left join mercadinho.categorias c on c.id = p.categoria_id
--  where c.nome = 'Congelados' and p.sem_codigo
--  order by p.nome;
--
-- Preço/estoque criados por unidade:
-- select u.nome, count(*)
--   from mercadinho.precos pr
--   join mercadinho.unidades u on u.id = pr.unidade_id
--   join mercadinho.produtos p on p.id = pr.produto_id
--  where p.codigo_barras in ('7891164026943','7891164026974','7891164026967','7891164026950',
--                            '7894904575824','7891515605803','7894904575794','7894904072439',
--                            '7894904082704','7891164026530','7891515496357','7891515475703',
--                            '7898460934187','7891515496234','7894904082728','7894904579668',
--                            '7898460934194')
--  group by u.nome;
