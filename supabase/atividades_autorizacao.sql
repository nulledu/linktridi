-- Código de supervisor pra recusa no tablet (23/09/2026).
--
-- O tablet da bancada não deixa mais ninguém recusar/devolver uma atividade
-- sozinho: ele trava até alguém com Atividades › Autorizar digitar o código
-- pessoal. Duas tabelas:
--   · atividades_supervisor_pins — o código de cada supervisor, só o HASH
--     (HMAC-SHA256 com segredo do servidor). Único: o código IDENTIFICA a pessoa.
--   · atividades_autorizacoes — o livro: cada pedido, código errado, aprovação
--     e negação, com quem pediu e quem decidiu.
-- Idempotente.

create table if not exists public.atividades_supervisor_pins (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  pin_hash    text not null unique,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.atividades_autorizacoes (
  id              uuid primary key default gen_random_uuid(),
  device_id       uuid,
  atividade_id    uuid,
  tipo            text not null,            -- devolver | dispensar
  motivo          text,
  pedido_por_id   uuid,
  pedido_por_nome text,
  supervisor_id   uuid,
  supervisor_nome text,
  decisao         text not null check (decisao in ('codigo_errado','aprovada','negada')),
  created_at      timestamptz not null default now()
);
create index if not exists atividades_autorizacoes_device_idx on public.atividades_autorizacoes (device_id, created_at desc);
create index if not exists atividades_autorizacoes_atividade_idx on public.atividades_autorizacoes (atividade_id);

-- O app lê com service_role; ninguém pela sessão.
alter table public.atividades_supervisor_pins enable row level security;
alter table public.atividades_autorizacoes enable row level security;
