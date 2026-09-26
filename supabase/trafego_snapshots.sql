-- ── Tridify · Snapshots (§5) ─────────────────────────────────────────────────
-- "Fotografia" dos números num momento, pra comparar depois de uma grande
-- alteração (escalar, trocar criativo, mudar público…). Guarda os KPIs do período.
-- Tolerante: sem a tabela, o widget só não mostra/grava.

create table if not exists public.trafego_snapshots (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  periodo     text,                            -- rótulo do período (ex.: "Últimos 7 dias")
  kpis        jsonb not null default '{}',      -- { spend, revenue, roas, purchases, cpa }
  autor_id    uuid,
  autor_nome  text,
  created_at  timestamptz not null default now()
);

create index if not exists trafego_snapshots_at on public.trafego_snapshots (created_at desc);
