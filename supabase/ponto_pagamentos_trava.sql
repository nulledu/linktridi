-- Trava de um pagamento de horas por pessoa de cada vez.
-- POST /api/ponto/pagamentos confere o saldo e só depois grava; sem a trava,
-- dois POSTs juntos (duplo clique, duas abas) pagavam a mesma hora duas vezes.
-- A PK faz "conferir e gravar" num passo só. Trava com mais de 2 min é de um
-- pedido que morreu no meio e a própria rota a apaga.
-- Idempotente. Sem esta tabela a rota segue pagando como antes (sem trava).
create table if not exists public.ponto_pagamentos_trava (
  pessoa_id  uuid primary key,
  criado_em  timestamptz not null default now()
);

-- O app lê/escreve com service_role; ninguém pela sessão.
alter table public.ponto_pagamentos_trava enable row level security;
