-- ── Mercadinho · marcar os 20 novos como "Produtos sem código" ──────────────
-- Rodar no Supabase da plataforma (schema `mercadinho`).
--
-- Os 17 congelados e os 3 Guaranás JÁ estão cadastrados e já desceram pro
-- tablet (conferido no banco do aparelho: nome e preço corretos). O que não
-- pegou foi a marcação `sem_codigo` — os 20 estão com `false`, então eles só
-- aparecem ao bipar, e não na categoria de toque.
--
-- Este arquivo faz SÓ isso: liga a marcação. Não cria produto, não mexe em
-- preço, não toca em estoque. Se o produto não existir, a linha simplesmente
-- não casa e nada acontece.
--
-- Idempotente: rodar de novo não muda nada.

update mercadinho.produtos
   set sem_codigo    = true,
       atualizado_em = now()
 where codigo_barras in (
   -- Congelados
   '7891164026943',  -- Faroeste Burguer Bacon Aurora
   '7891164026974',  -- Faroeste Burguer Cheddar Aurora
   '7891164026967',  -- Faroeste Burguer Frango Aurora
   '7891164026950',  -- Faroeste Burguer xburguer com molho especial Aurora
   '7894904575824',  -- Fettuccine à bolonhesa
   '7891515605803',  -- Fettuccine a bolonhesa Perdigão
   '7894904575794',  -- Fettuccine brocolis
   '7894904072439',  -- lasanha seara de presunto e queijo
   '7894904082704',  -- Lasanha à bolonhesa seara 600g
   '7891164026530',  -- Lasanha aurora bolonhesa
   '7891515496357',  -- Lasanha Bolonhesa Perdigão
   '7891515475703',  -- Lasanha Bolonhesa Sadia
   '7898460934187',  -- Lasanha bolonhesa select
   '7891515496234',  -- Lasanha de frango perdigão
   '7894904082728',  -- Lasanha seara 4 queijos
   '7894904579668',  -- Lasanha seara bolonhesa 350g
   '7898460934194',  -- Lasanha Select 4 queijos
   -- Bebidas
   '7891991000826',  -- Guaraná Antarctica
   '7891991014908',  -- Guarana antarctica 200ml
   '7891991012867'   -- Guaraná Antarctica 269ML
 )
   and sem_codigo is distinct from true;

-- Conferir (tem que voltar 20):
-- select count(*) from mercadinho.produtos
--  where sem_codigo and codigo_barras in ('7891164026943','7891164026974','7891164026967',
--    '7891164026950','7894904575824','7891515605803','7894904575794','7894904072439',
--    '7894904082704','7891164026530','7891515496357','7891515475703','7898460934187',
--    '7891515496234','7894904082728','7894904579668','7898460934194','7891991000826',
--    '7891991014908','7891991012867');
