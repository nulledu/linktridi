-- ── Atividades · Visão geral personalizável e atividades por item — 11/09/2026 ──
--
-- 1. `atividades_config` — quais itens do Estoque aparecem na Visão geral de
--    Atividades (o "Personalizar" da seção). Linha única, lista de ids.
-- 2. `atividades_opcoes` — as atividades possíveis de cada item, criadas pelo
--    "Adicionar atividade" do pop-up: "Cortar peças do puxador" → Máquinas,
--    "Montar puxador" → Produção. O setor escolhido aqui é o que o pop-up
--    já deixa marcado (e mostra as pessoas dele) na hora de mandar.
--
-- O app funciona sem isto: a Visão geral mostra os produtos e as
-- matérias-primas processadas, e o pop-up oferece só o "Produzir <item>" e as
-- etapas do modelo de produção. Com isto, dá pra escolher os itens e criar
-- atividades novas. Idempotente — rodar de novo não muda nada.

create table if not exists public.atividades_config (
  id boolean primary key default true check (id),
  visao_itens jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table public.atividades_config enable row level security;

-- 3. Categorias criadas à mão (11/09/2026): vários itens num cartão só
--    ("Almofada" com todos os tamanhos). Lista de { id, nome, itens: [ids] }.
--    Separada do `create table` pra valer também em quem já rodou este arquivo.
alter table public.atividades_config
  add column if not exists visao_grupos jsonb not null default '[]'::jsonb;

create table if not exists public.atividades_opcoes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.estoque_itens(id) on delete cascade,
  nome text not null,
  setor text not null default 'Produção',
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  unique (item_id, nome)
);
create index if not exists atividades_opcoes_item_idx on public.atividades_opcoes (item_id);
alter table public.atividades_opcoes enable row level security;

-- A API passa a enxergar as tabelas na hora (sem esperar o cache do PostgREST).
notify pgrst, 'reload schema';
