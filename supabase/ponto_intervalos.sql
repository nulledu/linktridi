-- ── Controle de Ponto v3 — intervalos + classificação automática ─────────────
-- Rodar DEPOIS de ponto.sql e ponto_v2.sql.
--
-- O tablet não escolhe mais o tipo: o SISTEMA classifica cada batida pela ordem
-- do dia + horário (ver lib/ponto.ts → classificarDia). Além de
-- entrada/almoco/retorno/saida, agora existem os intervalos, gravados em PARES
-- que o próprio sistema define (não aparecem pra ninguém escolher):
--   intervalo_inicio = pessoa saiu para um intervalo
--   intervalo_fim    = pessoa voltou do intervalo
-- A saída é sempre a ÚLTIMA batida do dia (provisória): quando chega uma batida
-- nova, o dia é reclassificado e a saída anterior vira retorno/intervalo.

alter table public.ponto_registros drop constraint if exists ponto_registros_tipo_check;
alter table public.ponto_registros
  add constraint ponto_registros_tipo_check
  check (tipo in ('entrada','saida','almoco','retorno','intervalo_inicio','intervalo_fim'));
