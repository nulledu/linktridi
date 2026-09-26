-- ── Controle de Ponto v3 — aprendizado facial ────────────────────────────────
-- O app melhora com o uso: cada batida confirmada guarda a "assinatura facial"
-- (embedding — vetor de 192 números, NÃO a foto) de como AQUELA câmera vê a
-- pessoa. Guardado no servidor → sobrevive a reinstalar/re-parear e todos os
-- tablets se beneficiam. Limite por pessoa (o app apara as mais antigas) pra
-- não lotar o banco. Cada amostra tem ~1-2 KB.
-- Rodar no Supabase NOVO (tzariztovuuwyeoogbxg), depois de ponto.sql.

create table if not exists ponto_face_amostras (
  id          uuid primary key default gen_random_uuid(),
  pessoa_id   uuid not null references ponto_pessoas(id) on delete cascade,
  embedding   jsonb not null,          -- array de floats (L2-normalizado)
  origem      text not null default 'tablet',
  created_at  timestamptz not null default now()
);

create index if not exists ponto_face_amostras_pessoa on ponto_face_amostras (pessoa_id, created_at desc);

alter table ponto_face_amostras enable row level security;   -- só service role
