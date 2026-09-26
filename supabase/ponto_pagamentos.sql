-- ── Ponto · pagamento de horas a favor (banco de horas) ─────────────────────
-- Quando a pessoa tem horas A MAIS e a empresa paga em dinheiro (folha, avulso),
-- essas horas saem do banco: deixam de ser crédito a compensar. Um registro aqui
-- CONSOME o crédito mais antigo primeiro (mesma fila FIFO do resto do banco) e
-- nunca vira dívida — se o crédito acabou, o excedente simplesmente não se aplica.
--
-- Não é ajuste manual (`ponto_ajustes`): ajuste corrige o saldo de UM dia, este
-- registra uma quitação em dinheiro, com data, valor em horas e histórico.
-- Tolerante: sem a tabela, o banco só não conhece pagamentos (nada quebra).

create table if not exists public.ponto_pagamentos (
  id          uuid primary key default gen_random_uuid(),
  pessoa_id   uuid not null,
  dia         date not null,                     -- quando foi pago
  minutos     int  not null check (minutos > 0), -- horas pagas (sempre positivo)
  observacao  text,                              -- ex.: "folha de agosto"
  autor_id    uuid,
  autor_nome  text,
  created_at  timestamptz not null default now()
);

create index if not exists ponto_pagamentos_pessoa on public.ponto_pagamentos (pessoa_id, dia desc);
