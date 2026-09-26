-- ── Financeiro · Estornos e chargebacks ──────────────────────────────────────
--
-- O dinheiro que VOLTA (ou ameaça voltar): reembolso feito ao cliente e
-- contestação aberta no cartão. Cada linha é um caso, do dia em que abriu até
-- a resolução — devolvido, ganho ou perdido.
--
-- `tipo` e `status` são texto sem CHECK de propósito: o vocabulário é da tela,
-- e um check transformaria "quero um status novo" num arquivo de SQL.
--
-- Idempotente: rodar de novo não quebra nem apaga caso registrado.

create extension if not exists pgcrypto;

create table if not exists public.fin_estornos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.fin_empresas(id) on delete restrict,

  -- 'estorno' (reembolso direto) | 'chargeback' (contestação no cartão).
  tipo          text not null default 'estorno',
  -- 'em_disputa' | 'devolvido' | 'ganho' | 'perdido'.
  status        text not null default 'em_disputa',

  -- O caso: qual venda ("pedido 8412"), de quem, por quê.
  referencia    text not null,
  cliente       text,
  motivo        text,
  observacao    text,

  -- Por onde o dinheiro sai/sairia — um banco ou gateway do cadastro.
  conta_id      uuid references public.fin_contas(id) on delete set null,

  valor         numeric(14,2) not null default 0,
  aberto_em     date not null default current_date,
  -- Preenchida quando o caso fecha (devolvido/ganho/perdido).
  resolvido_em  date,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  updated_by    uuid
);

create index if not exists fin_estornos_empresa_dia
  on public.fin_estornos (empresa_id, aberto_em desc);
create index if not exists fin_estornos_status
  on public.fin_estornos (empresa_id, status);

-- Conta cruzada: um estorno da Tridi não sai por uma conta da Gedux.
create or replace function public.fin_estorno_conta_ok() returns trigger
language plpgsql as $$
begin
  if new.conta_id is not null and not exists (
    select 1 from public.fin_contas c
    where c.id = new.conta_id and c.empresa_id = new.empresa_id
  ) then
    raise exception 'conta de outra empresa';
  end if;
  return new;
end $$;

drop trigger if exists fin_estornos_conta_ok on public.fin_estornos;
create trigger fin_estornos_conta_ok before insert or update on public.fin_estornos
  for each row execute function public.fin_estorno_conta_ok();

-- O carimbo de updated_at, igual ao resto do módulo.
drop trigger if exists fin_estornos_touch on public.fin_estornos;
create trigger fin_estornos_touch before update on public.fin_estornos
  for each row execute function public.fin_touch();

-- A fechadura do módulo: o app entra com service_role; sessão comum não lê.
alter table public.fin_estornos enable row level security;

select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'fin_estornos') as tabela_de_estornos,
  (select count(*) from public.fin_estornos) as casos_ja_registrados;
