-- ── Ponto · ajuste manual de horas (banco de horas) ──────────────────────────
-- Permite ao admin somar/tirar horas de uma pessoa num dia específico (correção
-- manual), sem mexer nas batidas. `minutos` positivo = crédito, negativo = débito.
-- O banco de horas (lib/banco-horas.ts) soma esses ajustes no saldo do dia.
-- Tolerante: sem a tabela, o banco só não aplica ajustes (nada quebra).

create table if not exists public.ponto_ajustes (
  id          uuid primary key default gen_random_uuid(),
  pessoa_id   uuid not null,
  dia         date not null,
  minutos     int  not null,        -- +crédito / −débito (ex.: -120 = tirar 2h)
  motivo      text,
  autor_id    uuid,
  autor_nome  text,
  created_at  timestamptz not null default now()
);

create index if not exists ponto_ajustes_pessoa on public.ponto_ajustes (pessoa_id, dia desc);
