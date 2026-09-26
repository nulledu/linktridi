-- ── A RECEITA mora no item: instrução e tempo da atividade de reposição ──────
--
-- O reabastecimento automático já existe: item com `qtd_minima > 0` que cai ao
-- mínimo vira atividade "Produzir X" pra repor até o `estoque_ideal`
-- (lib/requisicoes.ts). O que a atividade NÃO tinha era conteúdo: nascia com
-- `detalhe: null` e sem `tempo_estimado_min` — quem a recebia via só o nome do
-- item, sem o COMO FAZER que o dono ditou ("cortar o feltro em 1,4m por
-- 0,7m…") e sem prazo.
--
-- A receita mora NO ITEM, não na atividade, porque a atividade é descartável e
-- se repete: toda reposição de "Chapa de EVA com feltro" tem a mesma
-- instrução, e escrevê-la a cada atividade é como ela diverge.
--
--   producao_instrucao  → o texto que vira o `detalhe` da atividade (o bloco
--                         de instrução que /minhas-atividades e o tablet já
--                         renderizam — nenhum app precisa mudar).
--   producao_tempo_min  → quanto tempo leva produzir UM LOTE de referência.
--   producao_lote_de    → o tamanho desse lote. "200 puxadores em 120min" é
--                         tempo_min=120, lote_de=200; a atividade de 340
--                         unidades recebe ceil(340/200)*120 = 240min.
--
-- Tempo por LOTE e não por unidade, de propósito: "0,6 minuto por puxador" não
-- é como ninguém pensa, e arredondar por unidade acumula erro em lote grande.
--
-- Idempotente: `add column if not exists`, sem default esperto — item sem
-- receita continua gerando atividade como hoje (sem detalhe, sem tempo).

alter table public.estoque_itens
  add column if not exists producao_instrucao text;

alter table public.estoque_itens
  add column if not exists producao_tempo_min integer;

alter table public.estoque_itens
  add column if not exists producao_lote_de integer;

-- ── ONDE a atividade cai: tablet (manual) ou painel de máquinas ─────────────
--
-- Dois tipos de atividade de produção, ditados pelo dono: "Manual e quando é
-- manual cai no tablet, e se for maquinas cai pras maquinas, no painel".
--
--   producao_tipo        → 'manual' (atividade de pessoa, no tablet — o
--                          comportamento de sempre) ou 'maquina' (vira uma
--                          programação na fila de `maquina_programacoes`,
--                          que a TV da parede mostra).
--   producao_maquina_id  → a máquina PREFERIDA quando tipo='maquina'. NULL =
--                          o motor escolhe a máquina ativa com menos minutos
--                          pendentes na fila. Sem foreign key de propósito:
--                          `maquinas` é de outro SQL (supabase/maquinas.sql)
--                          e este arquivo não pode depender da ordem em que
--                          os dois são rodados.

alter table public.estoque_itens
  add column if not exists producao_tipo text not null default 'manual';

alter table public.estoque_itens
  add column if not exists producao_maquina_id uuid;

-- ── As receitas ditadas pelo dono (25/08/2026) ──────────────────────────────
--
-- `where producao_instrucao is null`: rodar de novo NÃO sobrescreve o que o
-- dono já editou na ficha — o arquivo semeia, a tela manda.

update public.estoque_itens set producao_instrucao =
  'Cortar o feltro em 1,40m × 0,70m e cortar o EVA na mesma medida. Em seguida colar um no outro utilizando cola silicone.'
  where nome = 'Chapa Eva com Feltro' and producao_instrucao is null;

update public.estoque_itens set producao_instrucao =
  'Cortar a chapa de EVA com feltro em quadrados de 11cm. Uma chapa de 1,40 × 0,70m rende 72 quadrados (12 × 6).'
  where nome = 'Acolchoado 11' and producao_instrucao is null;
update public.estoque_itens set producao_instrucao =
  'Cortar a chapa de EVA com feltro em quadrados de 16cm. Uma chapa de 1,40 × 0,70m rende 32 quadrados (8 × 4).'
  where nome = 'Acolchoado 16' and producao_instrucao is null;
update public.estoque_itens set producao_instrucao =
  'Cortar a chapa de EVA com feltro em quadrados de 22cm. Uma chapa de 1,40 × 0,70m rende 18 quadrados (6 × 3).'
  where nome = 'Acolchoado almofada 22' and producao_instrucao is null;

update public.estoque_itens set producao_instrucao = 'Cortar a tampa da almofada.'
  where nome in ('Tampa 11', 'Tampa 16', 'Tampa almofada 22') and producao_instrucao is null;
update public.estoque_itens set producao_instrucao = 'Cortar a base da almofada.'
  where nome in ('Base 11', 'Base 16', 'Base almofada 22') and producao_instrucao is null;
update public.estoque_itens set producao_instrucao = 'Cortar as laterais, frente e traseira da almofada.'
  where nome in (
    'Lateral Costa 11', 'Lateral Frente 11', 'Lateral Rolamento 11', 'Fundo 11',
    'Lateral Costa 16', 'Lateral Frente 16', 'Lateral Rolamento 16', 'Fundo 16',
    'Lateral costa almofada 22', 'Lateral frente almofada 22', 'Lateral Rolamento almofada 22'
  ) and producao_instrucao is null;

update public.estoque_itens set producao_instrucao =
  'Juntar as peças da almofada (tampa, base, fundo e laterais) para montar a carcaça.'
  where nome like 'Carcaça de almofada %' and producao_instrucao is null;

update public.estoque_itens set producao_instrucao =
  'Montar a almofada utilizando o quadrado de feltro com EVA (acolchoado) e a carcaça.'
  where nome in ('Almofada 11', 'Almofada 16', 'Almofada 22x22') and producao_instrucao is null;

update public.estoque_itens set producao_instrucao = 'Cortar as peças do puxador.'
  where nome in ('Puxador Macho', 'Puxador Femea', 'Bolinha Puxador') and producao_instrucao is null;

-- "Montar 200 unidades de puxador de carimbo → 2h": o único tempo ditado.
update public.estoque_itens set
  producao_instrucao = coalesce(producao_instrucao, 'Montar o puxador de carimbo (macho + fêmea + bolinha).'),
  producao_tempo_min = coalesce(producao_tempo_min, 120),
  producao_lote_de   = coalesce(producao_lote_de, 200)
  where nome = 'Puxador';

update public.estoque_itens set producao_instrucao =
  'Cortar folhas de borracha no tamanho A4 a partir do rolo.'
  where nome = 'Folha de borracha A4' and producao_instrucao is null;

-- ── Os rendimentos exatos das fichas dos acolchoados ────────────────────────
-- Gravados via API antes de ficha_tecnica_rendimento.sql rodar, a coluna de
-- 3 casas arredondou (1/72 = 0,013889 virou 0,014 → "rende 71,4"). Com as 6
-- casas este update deixa exato; sem elas, arredonda de novo — inofensivo.
update public.ficha_tecnica f set quantidade = v.q
  from (values ('Acolchoado 11', 0.013889), ('Acolchoado 16', 0.031250), ('Acolchoado almofada 22', 0.055556)) as v(nome, q),
       public.estoque_itens i, public.estoque_itens c
 where i.nome = v.nome and c.nome = 'Chapa Eva com Feltro'
   and f.item_id = i.id and f.componente_id = c.id;

-- Confere: as três colunas existem e quantos itens ganharam receita.
select
  count(*)                                            as itens,
  count(*) filter (where producao_instrucao is not null) as com_instrucao,
  count(*) filter (where producao_tempo_min is not null) as com_tempo
from public.estoque_itens;
