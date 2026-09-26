-- ── SKU único por item (Estoque) ────────────────────────────────────────────
-- RODE NA MÃO no SQL Editor do Supabase. Idempotente: pode rodar de novo.
--
-- Por que: o código de CADA etiqueta física nasce do SKU do item
-- (`codigoDaUnidade` = '<SKU>-<seq com 6 dígitos>'), e `estoque_unidades.codigo`
-- é UNIQUE global. Dois itens com o mesmo SKU calculam cada um o seu próprio
-- `max(seq)`, montam o MESMO código e o segundo bate na UNIQUE — o retry
-- recalcula exatamente a mesma coisa três vezes e a tela acusa "duas gerações
-- ao mesmo tempo, tente de novo". Tentar de novo nunca resolve: a causa é a
-- duplicata, e ela é permanente.
--
-- A checagem já é feita no aplicativo (app/api/estoque-itens/route.ts). Este
-- índice é a rede de baixo — fecha o caminho de quem escreve direto no banco
-- (SQL Editor, importação de planilha, script).
--
-- Sem o índice o sistema continua funcionando: a rota devolve
-- `sku_duplicado` antes de gravar. Com ele, um 23505 vindo do banco também é
-- traduzido pra mesma mensagem.

-- Caixa não conta: 'cx01' e 'CX01' são o mesmo SKU pra quem confere na
-- prateleira, e a rota compara com `ilike`. `upper(...)` no índice mantém as
-- duas visões de acordo. Itens sem SKU ficam de fora (partial index) — muitos
-- itens legítimos ainda não têm um.
--
-- ATENÇÃO: se já existir duplicata, a criação FALHA apontando o par repetido.
-- Nesse caso, rode antes para achá-las:
--
--   select upper(sku) as sku, count(*), array_agg(nome)
--     from public.estoque_itens where sku is not null
--    group by 1 having count(*) > 1;
--
-- e renomeie o SKU do item que ainda NÃO tem etiqueta gerada (o que já tem
-- etiqueta impressa mantém o dele — trocar o SKU não reimprime nada).

create unique index if not exists estoque_itens_sku_uniq
  on public.estoque_itens (upper(sku))
  where sku is not null;
