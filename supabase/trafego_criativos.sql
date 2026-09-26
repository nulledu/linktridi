-- ── Tridify · Marcas de CRIATIVO (tags + editor de vídeo) ───────────────────
-- Rodar no Supabase NOVO (o do app, não o ERP legado).
--
-- A marcação é presa à CHAVE DO CRIATIVO (`nome normalizado @ safra`), NÃO ao
-- ad.id da Meta. Motivo: o mesmo criativo ganha um id novo a cada duplicação
-- ("— Cópia") e a cada campanha em que roda; se as tags morassem no ad.id, elas
-- sumiriam toda vez que o gestor duplicasse a campanha. A safra (ano) é a trava
-- que impede o "JN 01" de 2026 herdar as tags do "JN 01" de 2025.
-- Ver lib/criativos.ts (chaveCriativo/normalizarNome).

create table if not exists trafego_criativo_marcas (
  chave           text primary key,              -- ex.: "jn 01 v2 2 g@2026"
  nome            text,                          -- nome de exibição na hora que marcou (só p/ auditoria)
  editor          text,                          -- quem editou o vídeo (nome livre)
  tags            text[] not null default '{}',  -- rótulos livres: "UGC", "Prova social", "Oferta"…
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid references auth.users(id) on delete set null
);

-- Filtro "todos os criativos deste editor" e busca por tag.
create index if not exists trafego_criativo_marcas_editor on trafego_criativo_marcas (editor);
create index if not exists trafego_criativo_marcas_tags on trafego_criativo_marcas using gin (tags);

-- Acesso só pelas rotas /api/trafego/criativos/marcas (service role). RLS trava o resto.
alter table trafego_criativo_marcas enable row level security;
