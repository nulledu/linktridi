-- TridiMarket — quantas compras estão presas NO TABLET.
--
-- A fila de compras offline vive no SQLite do aparelho: se o envio falha, a
-- venda fica lá e o servidor não tem como saber — nenhuma consulta aqui
-- consegue deduzir esse número. O tablet já manda a contagem em todo heartbeat
-- (`pendingOperations`), só que a rota descartava o valor e o painel exibia
-- `0` fixo. Resultado: venda encalhada passava dias invisível, e a única forma
-- de descobrir era testar à mão.
--
-- Com esta coluna, o cartão "Compras na fila" e a linha de cada aparelho na aba
-- Tablets passam a mostrar a verdade, com no máximo 15 minutos de atraso (o
-- intervalo do worker de sincronização do app).
--
-- Idempotente: pode rodar de novo.

alter table mercadinho.dispositivos
  add column if not exists pendencias integer not null default 0;

comment on column mercadinho.dispositivos.pendencias is
  'Compras na fila DO APARELHO, informadas pelo heartbeat. Não é contagem de nada no servidor.';
