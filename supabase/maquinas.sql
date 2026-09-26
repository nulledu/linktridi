-- ── Máquinas (laser) e a programação delas ──────────────────────────────────
-- Painel de parede do setor de máquinas: o que cada laser está cortando agora,
-- quanto já rodou hoje e o que vem na fila.
--
-- Rodar no SQL Editor do Supabase. É idempotente: pode rodar de novo sem medo.
-- O código é tolerante à ausência destas tabelas — sem elas o painel diz
-- "nenhuma máquina cadastrada" em vez de quebrar.

create table if not exists public.maquinas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                       -- "Laser P1"
  -- Porte: é o que agrupa a parede (P / M / G) e o que decide qual serviço
  -- cabe na máquina. Texto e não enum: entra um porte novo sem migração.
  porte text not null default 'P',
  materiais text,                           -- "Borracha / Acrílico"
  ativa boolean not null default true,
  ordem int not null default 0,             -- ordem na parede
  -- Parada (manutenção): motivo + desde quando + previsão de volta. Com
  -- `parada_motivo` preenchido a máquina aparece PARADA, mesmo com fila.
  parada_motivo text,
  parada_desde timestamptz,
  parada_previsao timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists maquinas_nome_uk on public.maquinas (lower(nome));
create index if not exists maquinas_ordem_ix on public.maquinas (ativa, ordem);

create table if not exists public.maquina_programacoes (
  id uuid primary key default gen_random_uuid(),
  maquina_id uuid not null references public.maquinas(id) on delete cascade,
  -- O que está sendo cortado: "Pedido #58291" ou "Programa CH-204". Texto
  -- livre de propósito — nem toda programação nasce de um pedido do ERP.
  referencia text not null,
  material text,                            -- "Acrílico 3 mm"
  minutos_estimados int not null default 60,
  posicao int not null default 0,           -- ordem na fila da máquina
  -- fila | executando | concluida | cancelada
  status text not null default 'fila',
  iniciada_at timestamptz,
  concluida_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists maq_prog_maquina_ix on public.maquina_programacoes (maquina_id, status, posicao);
-- O painel lê "o que foi feito hoje": esta é a consulta quente.
create index if not exists maq_prog_dia_ix on public.maquina_programacoes (concluida_at desc);

-- Uma máquina só pode ter UMA programação executando. Sem isto, dois cliques
-- de "iniciar" deixam a parede mostrando dois trabalhos na mesma máquina e o
-- total de horas do dia conta o mesmo período duas vezes.
create unique index if not exists maq_prog_uma_executando
  on public.maquina_programacoes (maquina_id)
  where status = 'executando';

-- ── Semente: as sete máquinas do galpão ─────────────────────────────────────
-- `on conflict do nothing` para não sobrescrever o que já foi ajustado à mão.
insert into public.maquinas (nome, porte, materiais, ordem) values
  ('Laser P1', 'P', 'Borracha / Acrílico', 1),
  ('Laser P2', 'P', 'Borracha / Acrílico', 2),
  ('Laser P3', 'P', 'Borracha / Acrílico', 3),
  ('Laser P4', 'P', 'Borracha / Acrílico', 4),
  ('Laser M1', 'M', 'PS / Papel cartão',   5),
  ('Laser G1', 'G', 'Chapas',              6),
  ('Laser G2', 'G', 'Chapas',              7)
on conflict do nothing;
