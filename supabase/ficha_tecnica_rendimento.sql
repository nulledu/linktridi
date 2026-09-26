-- ── A ficha técnica ganha casas decimais para o RENDIMENTO ───────────────────
--
-- Pedido do dono: "às vezes uma chapa de MDF gera muitos produtos/peças, e não
-- necessariamente 1 chapa = 1 produto — tem que contabilizar diferente, quantas
-- peças fazem com 1 chapa".
--
-- A ficha guarda CONSUMO POR PEÇA (quanto de componente entra numa unidade), e
-- dizer "rende N" é gravar 1/N. Só que a coluna era `numeric(12,3)` — TRÊS
-- casas — e é isso que impede exatamente o caso do pedido, o rendimento ALTO:
--
--   rende   8  →  0,125     cabe exato
--   rende  16  →  0,0625    vira 0,063  → volta 15,87 peças
--   rende  24  →  0,041667  vira 0,042  → volta 23,8  peças
--   rende  30  →  0,033333  vira 0,033  → volta 30,3  peças
--
-- O erro não aparece na tela do cadastro: aparece semanas depois, no custo por
-- peça e na necessidade de compra, com um número quase certo — que é o pior
-- tipo de errado, porque não chama atenção.
--
-- Seis casas cobrem rendimento até a casa do milhar com folga (1/1000 = 0,001)
-- e deixam 1/16 e 1/64 EXATOS, que é o que uma chapa de fato rende.
--
-- ── SEGURO DE RODAR, E SEGURO DE NÃO RODAR ──────────────────────────────────
--
-- Ampliar escala em `numeric` não perde dado: 0,125 continua 0,125. E o código
-- não depende deste arquivo — sem ele o Postgres apenas ARREDONDA na gravação,
-- que é o comportamento de hoje. Rodar melhora a precisão; não rodar mantém o
-- que já existe. Nada quebra nos dois casos.
--
-- Idempotente: `alter type` para o mesmo tipo é no-op.

alter table public.ficha_tecnica
  alter column quantidade type numeric(14,6);

-- Confere: o tipo novo e as linhas que ganhariam precisão se fossem reescritas
-- (as gravadas com 3 casas continuam como estão — este arquivo não reescreve
-- número de ninguém, só abre espaço para os próximos).
select
  (select data_type || '(' || numeric_precision || ',' || numeric_scale || ')'
     from information_schema.columns
    where table_name = 'ficha_tecnica' and column_name = 'quantidade') as tipo_agora,
  count(*)                                                             as linhas,
  count(*) filter (where quantidade > 0 and quantidade < 0.1)          as rendimento_alto
from public.ficha_tecnica;
