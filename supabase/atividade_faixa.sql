-- ── Faixa de atividade: roteamento por pessoa ────────────────────────────────
--
-- Roda NA MÃO no SQL Editor do Supabase. Re-rodável.
--
-- O pool do tablet passa a rotear também pela FAIXA da atividade
-- (maquinas | producao | preparo), além de setor e categoria. A faixa é
-- gravada na criação da ordem, derivada do `setor_responsavel` do item
-- (Máquinas/Montagem/…) com fallback por palavra-chave — ver
-- lib/atividade-faixa.ts.
--
-- Coluna ausente = comportamento antigo: o código trata faixa nula como
-- 'producao' e o pull/claim não filtra por faixa.

alter table public.atividades add column if not exists faixa text;

-- `estoque_itens.setor_responsavel` (de supabase/bom_ficha_tecnica.sql) é text
-- livre; passa a aceitar o valor 'Preparo' (chapas/tintas/montar caixa) além de
-- 'Máquinas | Montagem de Peças | Montagem Final | Estoque / Compras'. Nada a
-- alterar no banco — é só o novo valor válido no seletor da ficha do item.

-- Backfill: as atividades já abertas viram 'producao' (o padrão). Não é
-- obrigatório (o código já trata null como producao), mas deixa o filtro
-- explícito pra quem consultar a tabela.
update public.atividades set faixa = 'producao'
 where faixa is null and status in ('pendente', 'em_andamento', 'aguardando_material');

-- A configuração das 7 pessoas (Davi/Bruno=Máquinas, João=Preparo,
-- Mikael/Luiz=Produção, Felipe/Henrique=Logística) é aplicada por script de
-- dados (casa por id, conferindo cada match) — não por SQL de nome ambíguo.
