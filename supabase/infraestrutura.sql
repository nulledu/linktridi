-- ── Acessos & Infra (Cofre + Domínios + Hospedagens) ─────────────────────────
-- Três coisas num arquivo só porque nasceram juntas (set/2026):
--
-- 1. O cofre ganha a coluna `tipo`: a credencial pode ser de um FUNCIONÁRIO
--    (o acesso que a empresa entregou pra pessoa — o que o cofre sempre foi)
--    ou de um APLICATIVO/SERVIÇO da empresa (Meta Business, Hostinger,
--    Cloudflare…), onde `colaborador_id` passa a significar o RESPONSÁVEL.
--    Tudo que já existe vira 'funcionario' sozinho, pelo default.
-- 2. `infra_dominios`: cada domínio da empresa, com vencimento, valor e a
--    DECISÃO (renovar / avaliar / não renovar) — a tela existe pra responder
--    "o que vamos parar de pagar?".
-- 3. `infra_hospedagens`: onde as coisas rodam (Hostinger, VPS, Vercel…).
--
-- Vínculos são FKs `on delete set null`: apagar uma hospedagem ou credencial
-- não pode derrubar o domínio — só desfaz o vínculo.
--
-- Idempotente: pode rodar de novo sem quebrar nada.

create extension if not exists "pgcrypto";

-- 1 ── Cofre: tipo da credencial ──────────────────────────────────────────────
alter table acessos_credenciais
  add column if not exists tipo text not null default 'funcionario';

-- 2 ── Domínios ───────────────────────────────────────────────────────────────
create table if not exists infra_dominios (
  id              uuid primary key default gen_random_uuid(),
  dominio         text not null,
  registrador     text,
  vencimento      date,
  -- Valor da renovação em reais. Numeric, não float: dinheiro não arredonda.
  valor_renovacao numeric(12,2),
  renovacao_automatica boolean not null default false,
  -- A pergunta da tela. 'avaliar' é o default de propósito: domínio recém
  -- cadastrado ainda não tem decisão tomada.
  decisao         text not null default 'avaliar'
                  check (decisao in ('renovar','avaliar','nao_renovar')),
  responsavel_id  uuid references profiles(id) on delete set null,
  observacao      text,
  -- Vínculos: onde ele está hospedado e com qual acesso se mexe nele.
  hospedagem_id   uuid,
  credencial_id   uuid references acessos_credenciais(id) on delete set null,
  criado_por      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists infra_dominios_vencimento_idx
  on infra_dominios (vencimento asc nulls last);

-- 2b ── Domínios: ativo/inativo ───────────────────────────────────────────────
-- Status independente da DECISÃO de renovação: um domínio pode estar marcado
-- "renovar" e já estar fora do ar (site tirado, redirecionado), ou "não
-- renovar" e ainda estar ativo até a data virar. Um campo não decide o outro.
alter table infra_dominios
  add column if not exists ativo boolean not null default true;

create index if not exists infra_dominios_ativo_idx on infra_dominios (ativo);

-- 3 ── Hospedagens ────────────────────────────────────────────────────────────
create table if not exists infra_hospedagens (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  provedor        text,
  url_painel      text,
  valor           numeric(12,2),
  periodicidade   text not null default 'mensal'
                  check (periodicidade in ('mensal','anual','unico')),
  proxima_cobranca date,
  responsavel_id  uuid references profiles(id) on delete set null,
  observacao      text,
  credencial_id   uuid references acessos_credenciais(id) on delete set null,
  criado_por      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists infra_hospedagens_nome_idx on infra_hospedagens (nome);

-- 4 ── VPS ────────────────────────────────────────────────────────────────────
-- Servidores próprios (VPS Produção, servidor de chats…). Igual à hospedagem,
-- mais o endereço (IP/host) e a porta de SSH — que NÃO são segredo: a senha ou
-- chave de entrar mora no cofre, via credencial vinculada.
create table if not exists infra_vps (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  provedor        text,
  ip              text,
  porta_ssh       integer,
  url_painel      text,
  valor           numeric(12,2),
  periodicidade   text not null default 'mensal'
                  check (periodicidade in ('mensal','anual','unico')),
  proxima_cobranca date,
  responsavel_id  uuid references profiles(id) on delete set null,
  observacao      text,
  credencial_id   uuid references acessos_credenciais(id) on delete set null,
  criado_por      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists infra_vps_nome_idx on infra_vps (nome);
alter table infra_vps enable row level security;

-- A FK de domínio → hospedagem entra DEPOIS da tabela existir (e é tolerante a
-- rodar de novo: o nome fixo + o drop antes garantem idempotência).
alter table infra_dominios
  drop constraint if exists infra_dominios_hospedagem_fk;
alter table infra_dominios
  add constraint infra_dominios_hospedagem_fk
  foreign key (hospedagem_id) references infra_hospedagens(id) on delete set null;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Mesmo modelo do cofre: o app lê e escreve com service_role; nenhuma política
-- permissiva de propósito — anon/authenticated não chegam nestas tabelas.
alter table infra_dominios    enable row level security;
alter table infra_hospedagens enable row level security;
