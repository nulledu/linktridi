-- ─────────────────────────────────────────────────────────────────────────────
-- TridiMarket · Ajustes globais + Score do funcionário
-- ─────────────────────────────────────────────────────────────────────────────
-- Rode no banco do TRIDIMARKET (wcxhyludixozqloqzjpn), não no banco do ERP.
--
-- Duas tabelas novas, ambas idempotentes (podem rodar mais de uma vez sem erro):
--
--  1. market_settings   — UMA linha global (id = 1) com as regras do mercadinho.
--                          Antes tudo era hardcoded: limite padrão 500, sem
--                          cheque especial, atraso fixo em 30 dias. Agora o
--                          gestor edita na aba Ajustes e vale pra TODAS as
--                          empresas (escopo global, como você pediu).
--
--  2. market_pessoa_score — score de cada funcionário (por cadastro em
--                          usuarios_perfil). Começa em 0. O servidor recalcula
--                          um score AUTOMÁTICO pelo comportamento (pagou = sobe,
--                          está em atraso = desce); quando `manual = true` o
--                          número é uma nota do gestor e o automático não mexe.
--
-- O código é tolerante à ausência: se você ainda não rodou este SQL, o painel
-- usa os padrões (limite 500, sem cheque especial, 30 dias, score 0) e nada
-- quebra.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Ajustes globais (singleton) ─────────────────────────────────────────────
create table if not exists public.market_settings (
  id                     smallint      primary key default 1 check (id = 1),
  -- Cheque especial: se ligado, todo mundo ganha `limite_extra` de saldo além
  -- do limite normal (é o "limite a mais de crédito").
  cheque_especial        boolean       not null default false,
  limite_extra           numeric(12,2) not null default 0,
  -- Limite padrão de quem não tem limite próprio marcado no cadastro.
  limite_padrao          numeric(12,2) not null default 500,
  -- Bloquear inadimplente: barra a compra de quem tem dívida vencida.
  bloquear_inadimplente  boolean       not null default false,
  -- A partir de quantos dias uma dívida em aberto vira "vencida".
  dias_inadimplencia     integer       not null default 30,
  updated_at             timestamptz   not null default now(),
  updated_by             uuid
);

-- Garante a linha única. Se já existir, não faz nada.
insert into public.market_settings (id) values (1)
  on conflict (id) do nothing;

-- 2) Score por funcionário ───────────────────────────────────────────────────
create table if not exists public.market_pessoa_score (
  employee_id  bigint       primary key,   -- usuarios_perfil.id
  score        integer      not null default 0,
  manual       boolean      not null default false,  -- true = nota do gestor (congela o automático)
  updated_at   timestamptz  not null default now(),
  updated_by   uuid
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Pronto. Sem RLS: o painel acessa com a service_role. Nada mais a fazer.
-- ─────────────────────────────────────────────────────────────────────────────
