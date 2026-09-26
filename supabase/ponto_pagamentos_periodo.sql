-- Pagamento de horas por PERÍODO.
--
-- Antes, pagar horas consumia sempre o crédito mais antigo do banco (FIFO).
-- Isso funciona enquanto se paga um período de cada vez, na ordem. Na hora de
-- pagar só a folha de agosto com crédito de julho ainda em aberto, o recibo
-- dizia "agosto" e o banco quitava julho.
--
-- Estas duas colunas guardam a JANELA que o pagamento quita. Nulas = o
-- comportamento antigo (mais antigo primeiro, sem janela) — é o que continua
-- valendo pros pagamentos já gravados.
--
-- Idempotente: pode rodar quantas vezes quiser.

alter table public.ponto_pagamentos add column if not exists periodo_de   date;
alter table public.ponto_pagamentos add column if not exists periodo_ate  date;

-- A janela é um intervalo ou nada: meia janela ("de" sem "até") faria a conta
-- do banco consumir dali até o fim do tempo, que não é o que ninguém pediu.
alter table public.ponto_pagamentos drop constraint if exists ponto_pagamentos_periodo_ck;
alter table public.ponto_pagamentos add constraint ponto_pagamentos_periodo_ck
  check (
    (periodo_de is null and periodo_ate is null)
    or (periodo_de is not null and periodo_ate is not null and periodo_de <= periodo_ate)
  );

comment on column public.ponto_pagamentos.periodo_de  is 'Primeiro dia da janela de crédito que este pagamento quita (nulo = sem janela, consome o mais antigo).';
comment on column public.ponto_pagamentos.periodo_ate is 'Último dia da janela de crédito que este pagamento quita.';
