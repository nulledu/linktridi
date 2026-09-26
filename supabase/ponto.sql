-- ── Controle de Ponto ────────────────────────────────────────────────────────
-- Pessoas cadastradas no painel (Administração → Controle de Ponto) com foto de
-- perfil + fotos extras p/ o reconhecimento facial do tablet. O tablet (app
-- Ponto) autentica como DEVICE (tabela devices, já existente) e registra as
-- batidas em ponto_registros.
-- Rodar no Supabase NOVO (tzariztovuuwyeoogbxg).

create table if not exists ponto_pessoas (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  colaborador_id  uuid references employees(id) on delete set null,  -- vínculo opcional c/ usuário do sistema
  foto_url        text,                          -- foto de perfil (principal)
  fotos           jsonb not null default '[]',   -- fotos extras p/ reconhecimento (array de URLs)
  pin_hash        text,                          -- PIN opcional (sha256) — fallback anti-fraude no tablet
  consentimento   boolean not null default false, -- autorizou uso da biometria (LGPD)
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists ponto_registros (
  id          uuid primary key default gen_random_uuid(),
  pessoa_id   uuid not null references ponto_pessoas(id) on delete cascade,
  tipo        text not null check (tipo in ('entrada','saida','almoco','retorno')),
  batido_em   timestamptz not null default now(),
  selfie_url  text,            -- selfie do momento (auditoria)
  confianca   real,            -- similaridade do reconhecimento (0–1); null = manual
  device_id   uuid references devices(id) on delete set null,
  origem      text not null default 'tablet' check (origem in ('tablet','manual')),
  created_at  timestamptz not null default now()
);

create index if not exists ponto_registros_pessoa_dia on ponto_registros (pessoa_id, batido_em desc);
create index if not exists ponto_registros_dia on ponto_registros (batido_em desc);

-- Tudo acessado via service role nas rotas /api/ponto/* — RLS bloqueia o resto.
alter table ponto_pessoas enable row level security;
alter table ponto_registros enable row level security;
