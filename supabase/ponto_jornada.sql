-- Jornada por pessoa (banco de horas): quantas horas/dia cada um deve fazer e,
-- opcionalmente, o horário previsto de entrada/saída (só referência).
-- jornada_min = minutos de TRABALHO esperados por dia (ex.: 480 = 8h, 360 = 6h).
alter table ponto_pessoas add column if not exists jornada_min      int;
alter table ponto_pessoas add column if not exists entrada_prevista text;   -- "HH:MM"
alter table ponto_pessoas add column if not exists saida_prevista   text;   -- "HH:MM"
