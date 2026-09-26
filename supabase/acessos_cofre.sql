-- ── Cofre de acessos (Pessoas › Cofre de acessos) ───────────────────────────
-- Guarda as credenciais que a empresa entrega pra cada colaborador (GitHub,
-- AWS, Meta Business, RD Station…). A senha NUNCA entra aqui em claro: o
-- servidor cifra com AES-256-GCM antes de gravar, usando a chave que mora só
-- na variável de ambiente ACESSOS_CRYPTO_KEY. Sem a chave, `senha_enc` é lixo
-- ilegível — inclusive pra quem abrir o Supabase ou pegar um backup.
--
-- Idempotente: pode rodar de novo sem quebrar nada.

create extension if not exists "pgcrypto";

create table if not exists acessos_credenciais (
  id            uuid primary key default gen_random_uuid(),
  -- De QUEM é o acesso. Sai junto com a pessoa: credencial órfã é credencial
  -- que ninguém revoga.
  colaborador_id uuid not null references profiles(id) on delete cascade,
  servico       text not null,
  categoria     text not null default 'Outros',
  url           text,
  login         text,
  -- "v1:<iv>:<tag>:<dado>" em base64. Ver `cifrar()` em lib/acessos-cofre.ts.
  senha_enc     text not null,
  -- Observação livre (qual 2FA, quem é o dono da conta-mãe). Não é segredo:
  -- fica em claro de propósito, pra dar contexto sem exigir a chave.
  notas         text,
  criado_por    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- A tela lista SEMPRE por pessoa e ordena por serviço.
create index if not exists acessos_credenciais_colab_idx
  on acessos_credenciais (colaborador_id, servico);
create index if not exists acessos_credenciais_categoria_idx
  on acessos_credenciais (categoria);

-- ── Auditoria ───────────────────────────────────────────────────────────────
-- Cada revelação, cópia, criação, edição e exclusão vira uma linha. Os campos
-- `servico_snapshot` e `colaborador_nome` são cópias do momento: sem eles,
-- apagar a credencial apagaria junto o significado do log ("fulano revelou …
-- o quê?"). Por isso `credencial_id` é `set null` e não `cascade`.
create table if not exists acessos_log (
  id                uuid primary key default gen_random_uuid(),
  credencial_id     uuid references acessos_credenciais(id) on delete set null,
  ator_id           uuid references profiles(id) on delete set null,
  ator_nome         text,
  acao              text not null check (acao in ('revelar','copiar','criar','editar','apagar')),
  servico_snapshot  text,
  colaborador_nome  text,
  created_at        timestamptz not null default now()
);

create index if not exists acessos_log_created_idx on acessos_log (created_at desc);
create index if not exists acessos_log_credencial_idx on acessos_log (credencial_id, created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- O app lê e escreve com service_role (que atravessa RLS); ligar as políticas
-- aqui fecha a porta do anon/authenticated, que é justamente por onde um token
-- público vazado entraria. Nenhuma política permissiva de propósito: só o
-- servidor chega nestas tabelas.
alter table acessos_credenciais enable row level security;
alter table acessos_log         enable row level security;
