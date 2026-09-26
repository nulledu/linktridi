-- Dois tipos de feriado no ponto.
--
-- Nos DOIS ninguém deve a jornada do dia (o feriado continua sendo folga de
-- todo mundo). O que muda é o valor da hora de quem TRABALHA no feriado:
--
--   'folga' (padrão)  feriado de verdade → a hora extra é ESPECIAL, com
--                     adicional na folha. Mesmo caso do domingo.
--   'troca'           o feriado foi trocado por outro dia de folga ("trabalha
--                     meio período na quinta e não vem no sábado") → a hora
--                     extra é COMUM: ela existe pra ser gasta na folga
--                     combinada, não pra virar adicional. O dia trocado entra
--                     como dia normal sem batida e consome esse crédito sozinho.
--
-- Idempotente: pode rodar quantas vezes quiser. Sem esta coluna o sistema
-- continua de pé — todo feriado é lido como 'folga', que é o que era antes.
alter table ponto_feriados
  add column if not exists tipo text not null default 'folga';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ponto_feriados_tipo_ck'
  ) then
    alter table ponto_feriados
      add constraint ponto_feriados_tipo_ck check (tipo in ('folga', 'troca'));
  end if;
end $$;
