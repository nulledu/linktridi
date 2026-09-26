-- ── Ponto · "trabalha sábado" por pessoa ─────────────────────────────────────
-- Desacopla o SÁBADO das horas/dia. Antes, o banco de horas contava sábado pra
-- quem tinha jornada de 8h (ou sem jornada definida → default 8h), creditando/
-- debitando sábado errado (ex.: Isabella, João Vitor, Thiago não trabalham sábado
-- mas eram cobrados). Agora sábado só conta se `trabalha_sabado = true`.
-- Default FALSE: ninguém trabalha sábado até o admin ligar o toggle. Como o banco
-- de horas é CALCULADO (não guardado), rodar isto já recalcula o histórico certo.

alter table public.ponto_pessoas add column if not exists trabalha_sabado boolean not null default false;
-- Jornada do SÁBADO (minutos), separada das horas de semana. null = padrão 4h (240)
-- pra quem trabalha sábado; ajustável por pessoa (tem quem faça menos).
alter table public.ponto_pessoas add column if not exists sabado_min int;
