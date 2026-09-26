-- ── Módulo 3D · fase 2: máquinas e programações de impressão ────────────────
-- A biblioteca (3d_biblioteca.sql) continua sendo o núcleo: uma programação
-- referencia `impressao3d_arquivos.id`. O histórico NÃO é uma tabela própria —
-- é a própria programação concluída/cancelada (com `iniciado_em`/`concluido_em`),
-- então nada é copiado e o filtro por período é um índice em `data`.
--
-- Status da MÁQUINA é quase todo DERIVADO das programações (imprimindo,
-- programada, disponível) — a coluna `estado` guarda só o que é decisão humana
-- e não dá pra deduzir: ativa | manutencao | offline. É o que evita o estado
-- dessincronizado que o pedido chama de "status inteligentes".
--
-- Idempotente: rodar de novo não muda nada.

create table if not exists public.impressao3d_maquinas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  identificacao text not null default '',   -- etiqueta curta (ex.: IMP-01)
  modelo text not null default '',
  estado text not null default 'ativa',     -- ativa | manutencao | offline (o resto é derivado)
  local text not null default '',
  observacoes text not null default '',
  foto_url text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.impressao3d_programacoes (
  id uuid primary key default gen_random_uuid(),
  arquivo_id uuid not null references public.impressao3d_arquivos (id),
  maquina_id uuid references public.impressao3d_maquinas (id), -- null = ainda sem máquina (A fazer)
  quantidade integer not null default 1,
  data date,                                -- null = ainda sem dia
  hora text,                                -- "HH:MM" planejado, null = sem horário
  prioridade text not null default 'normal',-- baixa | normal | alta
  responsavel_id uuid references public.profiles (id),
  observacoes text not null default '',
  status text not null default 'a_fazer',   -- a_fazer | programado | imprimindo | pausado | concluido | cancelado
  ordem integer not null default 0,         -- posição na fila da máquina (menor = primeiro)
  iniciado_em timestamptz,
  concluido_em timestamptz,
  criado_por uuid references public.profiles (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists impressao3d_programacoes_status
  on public.impressao3d_programacoes (status);
create index if not exists impressao3d_programacoes_maquina
  on public.impressao3d_programacoes (maquina_id, ordem);
create index if not exists impressao3d_programacoes_data
  on public.impressao3d_programacoes (data);
create index if not exists impressao3d_programacoes_arquivo
  on public.impressao3d_programacoes (arquivo_id, criado_em desc);

-- App lê com service_role; ninguém de fora passa pela sessão.
alter table public.impressao3d_maquinas enable row level security;
alter table public.impressao3d_programacoes enable row level security;
