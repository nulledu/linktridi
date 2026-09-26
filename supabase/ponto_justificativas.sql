-- Justificativas de ponto: motivo pra um dia (falta, saída antecipada, etc).
-- Regra do banco de horas: ninguém folga o dia todo sem justificar. Quando
-- `abona` = true, o déficit daquele dia é PERDOADO (não vira dívida); quando
-- false, a justificativa só registra o motivo — a pessoa ainda compensa as horas.
create table if not exists ponto_justificativas (
  id          uuid primary key default gen_random_uuid(),
  pessoa_id   uuid not null references ponto_pessoas(id) on delete cascade,
  dia         date not null,
  motivo      text,
  abona       boolean not null default true,
  created_by  uuid,                         -- profiles.id de quem lançou
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (pessoa_id, dia)                    -- uma justificativa por dia/pessoa
);

create index if not exists ponto_justificativas_pessoa_dia_idx
  on ponto_justificativas (pessoa_id, dia);
