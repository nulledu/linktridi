-- App de atividades offline-first — dispositivos de chão de fábrica.
-- O tablet autentica como DISPOSITIVO (não por pessoa); cada registro é
-- atribuído ao colaborador selecionado na tela.

-- Dispositivos provisionados (tablets de mesa).
create table if not exists devices (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null unique,          -- sha256 do token do dispositivo
  nome_mesa   text,                           -- ex.: "Produção - Mesa 2"
  setor       text,                           -- filtra pessoas/atividades; null = todos
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  last_sync   timestamptz
);

-- Códigos de provisionamento (gerados pelo admin, usados 1x pelo tablet).
create table if not exists device_provision_codes (
  code        text primary key,               -- 6 dígitos
  nome_mesa   text,
  setor       text,
  expires_at  timestamptz not null,
  used        boolean not null default false,
  device_id   uuid references devices(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Idempotência do push: cada ação do outbox tem um client_id único.
create table if not exists device_processed_actions (
  client_id   text primary key,
  device_id   uuid references devices(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- PIN opcional por colaborador (seleção aberta por padrão; PIN se ligado).
alter table employees add column if not exists pin text;

-- Tudo acessado via service role nas rotas /api/device/* — RLS bloqueia o resto.
alter table devices enable row level security;
alter table device_provision_codes enable row level security;
alter table device_processed_actions enable row level security;
