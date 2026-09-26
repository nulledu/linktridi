-- TridiMarket: extensão aditiva do banco legado.
-- Seguro para executar mais de uma vez. Não apaga nem reescreve vendas antigas.
--
-- ── PRINCÍPIO: REUSAR O QUE JÁ EXISTE ───────────────────────────────────────
-- O banco legado já resolve várias coisas, então NÃO criamos tabela paralela:
--   login/código   → usuarios_perfil.codigo_acesso   (todos já têm, 6 dígitos)
--   limite normal  → usuarios_perfil.limitacao/_valor
--   venda e dívida → vendas_usuarios + venda_itens
--   estoque        → estoque_perfil  (+ movimentacoes_estoque como histórico)
--   preço/unidade  → precos_perfil   (quando preenchida; senão produtos.preco_base)
--   suspeitas      → historico_suspeitas
--   sessão do totem→ sessoes_totem   (estendida abaixo com o token do dispositivo)
-- As market_* que duplicavam isso foram REMOVIDAS (drops logo abaixo).
-- Sobra só o que o legado não tinha: cadastro de dispositivo, código de
-- pareamento, estoque mínimo, cheque especial, ciclos e auditoria admin.

create extension if not exists pgcrypto;

-- ── Remoção das tabelas que duplicavam o legado ─────────────────────────────
drop table if exists public.market_employee_credentials cascade;  -- → usuarios_perfil.codigo_acesso
drop table if exists public.market_security_events cascade;       -- → historico_suspeitas
drop table if exists public.market_price_history cascade;         -- → precos_perfil

-- ── sessoes_totem: a tabela de sessão do legado ganha o que faltava ─────────
-- Estava vazia (nunca usada) e não tinha como autenticar o tablet. Em vez de
-- manter uma market_device_sessions em paralelo, estendemos a original.
-- ATENÇÃO aos tipos: as colunas originais usuario_perfil_id/empresa_id são UUID,
-- de um desenho antigo — hoje usuarios_perfil.id é numérico. Por isso a tabela
-- nunca foi usada. Em vez de ALTERAR o tipo dessas colunas (arriscado se algum
-- dia alguém depender delas), adicionamos employee_id no tipo certo e deixamos
-- as antigas nulas. Puramente aditivo.
alter table public.sessoes_totem add column if not exists device_id uuid;
alter table public.sessoes_totem add column if not exists token_hash text;
alter table public.sessoes_totem add column if not exists expires_at timestamptz;
alter table public.sessoes_totem add column if not exists employee_id bigint;
create unique index if not exists sessoes_totem_token_idx on public.sessoes_totem(token_hash) where token_hash is not null;
create index if not exists sessoes_totem_device_idx on public.sessoes_totem(device_id, expires_at desc);
drop table if exists public.market_device_sessions cascade;

create table if not exists public.market_product_rules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.perfis(id),
  product_id bigint not null references public.produtos(id),
  minimum_stock integer not null default 5 check (minimum_stock >= 0),
  safety_stock integer not null default 0 check (safety_stock >= 0),
  allow_stock_override boolean not null default true,
  max_per_purchase integer,
  max_per_employee_day integer,
  updated_at timestamptz not null default now(),
  unique(profile_id, product_id)
);

create table if not exists public.market_devices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.perfis(id),
  name text not null,
  token_hash text unique,
  installation_id uuid,
  active boolean not null default true,
  app_version text,
  last_seen_at timestamptz,
  last_sync_at timestamptz,
  pending_operations integer not null default 0,
  health jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.market_devices add column if not exists installation_id uuid;

create table if not exists public.market_employee_credit (
  employee_id bigint primary key references public.usuarios_perfil(id),
  overdraft_limit numeric(12,2) not null default 0 check (overdraft_limit >= 0),
  overdraft_expires_at timestamptz,
  blocked boolean not null default false,
  score integer not null default 50 check (score between 0 and 100),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_device_codes (
  code text primary key check (code ~ '^[0-9]{6}$'),
  profile_id uuid not null references public.perfis(id),
  device_name text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  device_id uuid references public.market_devices(id),
  created_at timestamptz not null default now()
);

create table if not exists public.market_billing_cycles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.perfis(id),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

-- profile_id  = unidade DO FUNCIONÁRIO (onde a dívida/carteira é registrada)
-- stock_profile_id = unidade DO TABLET (de onde o estoque físico saiu).
-- São diferentes quando alguém compra num tablet de outra empresa.
create table if not exists public.market_purchase_operations (
  operation_id uuid primary key,
  device_id uuid not null references public.market_devices(id),
  local_sequence bigint not null,
  employee_id bigint not null references public.usuarios_perfil(id),
  profile_id uuid not null references public.perfis(id),
  stock_profile_id uuid references public.perfis(id),
  company_id bigint not null,
  sale_id bigint references public.vendas_usuarios(id),
  payload_hash text not null,
  device_occurred_at timestamptz not null,
  server_received_at timestamptz not null default now(),
  rules_version integer not null default 1,
  stock_override boolean not null default false,
  status text not null check (status in ('LOCAL_PENDING','SYNCING','SYNCED','REQUIRES_REVIEW','REJECTED','REVERSED')),
  reason text,
  result jsonb,
  unique(device_id, local_sequence)
);

create table if not exists public.market_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references public.usuarios_perfil(id),
  profile_id uuid not null references public.perfis(id),
  operation_id uuid references public.market_purchase_operations(operation_id),
  billing_cycle_id uuid references public.market_billing_cycles(id),
  kind text not null check (kind in ('purchase','payment','credit','debit','refund','adjustment')),
  amount numeric(12,2) not null,
  description text not null,
  occurred_at timestamptz not null default now(),
  created_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.market_payments (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references public.usuarios_perfil(id),
  profile_id uuid not null references public.perfis(id),
  ledger_entry_id uuid not null unique references public.market_ledger_entries(id),
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'other',
  paid_at timestamptz not null default now(),
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.market_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

-- Bancos que já rodaram a versão anterior desta migração ganham a coluna aqui.
alter table public.market_purchase_operations add column if not exists stock_profile_id uuid references public.perfis(id);

create index if not exists market_ledger_employee_idx on public.market_ledger_entries(employee_id, occurred_at desc);
create index if not exists market_operations_stock_profile_idx on public.market_purchase_operations(stock_profile_id, server_received_at desc);
create index if not exists market_operations_device_idx on public.market_purchase_operations(device_id, local_sequence desc);
create index if not exists market_devices_seen_idx on public.market_devices(last_seen_at desc);

create or replace function public.market_activate_device(
  p_code text,
  p_token_hash text,
  p_app_version text,
  p_installation_id uuid
) returns table(device_id uuid, profile_id uuid, device_name text, error text)
language plpgsql security definer set search_path = public as $$
declare
  v_code public.market_device_codes%rowtype;
  v_device_id uuid;
begin
  select * into v_code from public.market_device_codes
    where code = p_code and used_at is null and expires_at > now()
    for update;
  if not found then
    return query select null::uuid, null::uuid, null::text, 'invalid_or_expired_code'::text;
    return;
  end if;
  insert into public.market_devices(profile_id, name, token_hash, app_version, installation_id, last_seen_at)
  values (v_code.profile_id, v_code.device_name, p_token_hash, p_app_version, p_installation_id, now())
  returning id into v_device_id;
  update public.market_device_codes set used_at = now(), device_id = v_device_id where code = p_code;
  return query select v_device_id, v_code.profile_id, v_code.device_name, null::text;
end;
$$;

revoke all on function public.market_activate_device(text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.market_activate_device(text,text,text,uuid) to service_role;

create or replace function public.market_prevent_ledger_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'market ledger is immutable; create a compensating entry';
end;
$$;

drop trigger if exists market_ledger_immutable_update on public.market_ledger_entries;
create trigger market_ledger_immutable_update before update or delete on public.market_ledger_entries
for each row execute function public.market_prevent_ledger_mutation();

-- A assinatura mudou (ganhou p_stock_profile_id): derruba a versão antiga antes,
-- senão o Postgres cria uma sobrecarga e o PostgREST fica ambíguo.
drop function if exists public.market_sync_purchase(uuid,uuid,bigint,bigint,uuid,bigint,timestamptz,integer,text,jsonb);

-- COMPRA CROSS-EMPRESA: qualquer funcionário pode comprar em qualquer tablet.
--   p_profile_id       → unidade do FUNCIONÁRIO: onde a venda/dívida é registrada
--                        (a carteira dele fica com a empresa dele).
--   p_stock_profile_id → unidade do TABLET: de onde o estoque físico é baixado.
-- Quando são iguais, é a compra "em casa" de sempre.
create or replace function public.market_sync_purchase(
  p_operation_id uuid,
  p_device_id uuid,
  p_local_sequence bigint,
  p_employee_id bigint,
  p_profile_id uuid,
  p_company_id bigint,
  p_device_occurred_at timestamptz,
  p_rules_version integer,
  p_payload_hash text,
  p_items jsonb,
  p_stock_profile_id uuid default null
) returns table(status text, sale_id bigint, reason text, server_received_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_existing public.market_purchase_operations%rowtype;
  v_sale_id bigint;
  v_item jsonb;
  v_qty integer;
  v_price numeric(12,2);
  v_total numeric(12,2) := 0;
  v_stock_override boolean := false;
  v_active boolean;
  v_stock_profile uuid := coalesce(p_stock_profile_id, p_profile_id);
  v_stock_company bigint;
  v_cross boolean;
begin
  select * into v_existing from public.market_purchase_operations where operation_id = p_operation_id;
  if found then
    if v_existing.payload_hash <> p_payload_hash then
      return query select 'REJECTED'::text, v_existing.sale_id, 'operation_payload_mismatch'::text, v_existing.server_received_at;
    else
      return query select v_existing.status, v_existing.sale_id, v_existing.reason, v_existing.server_received_at;
    end if;
    return;
  end if;

  -- O tablet é validado pela unidade DELE (v_stock_profile), não pela do
  -- funcionário: senão comprar em outra empresa seria sempre "device_revoked".
  select active into v_active from public.market_devices where id = p_device_id and profile_id = v_stock_profile;
  if coalesce(v_active, false) = false then
    return query select 'REJECTED'::text, null::bigint, 'device_revoked'::text, now();
    return;
  end if;

  -- Empresa dona do estoque (pra criar linha de estoque no lugar certo quando o
  -- produto ainda não existe naquela unidade).
  select empresa_user_id into v_stock_company from public.perfis where id = v_stock_profile;
  v_cross := v_stock_profile is distinct from p_profile_id;

  insert into public.market_purchase_operations(
    operation_id, device_id, local_sequence, employee_id, profile_id, stock_profile_id, company_id,
    payload_hash, device_occurred_at, rules_version, status
  ) values (
    p_operation_id, p_device_id, p_local_sequence, p_employee_id, p_profile_id, v_stock_profile, p_company_id,
    p_payload_hash, p_device_occurred_at, p_rules_version, 'SYNCING'
  ) on conflict (operation_id) do nothing;

  insert into public.vendas_usuarios(empresa_id, perfil_id, user_perfil_id, pago)
  values (p_company_id, p_profile_id, p_employee_id, false)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(1, coalesce((v_item->>'quantity')::integer, 1));
    v_price := greatest(0, coalesce((v_item->>'unitPrice')::numeric, 0));
    v_total := v_total + (v_qty * v_price);

    for i in 1..v_qty loop
      insert into public.venda_itens(venda_id, produto_id, valor)
      values (v_sale_id, (v_item->>'productId')::bigint, v_price);
    end loop;

    -- ESTOQUE sempre na unidade do TABLET (v_stock_profile): o produto saiu
    -- fisicamente de lá, mesmo que quem levou seja de outra empresa.
    update public.estoque_perfil
      set quantidade = quantidade - v_qty, updated_at = now()
      where perfil_id = v_stock_profile and produto_id = (v_item->>'productId')::bigint;
    if not found then
      insert into public.estoque_perfil(perfil_id, produto_id, empresa_id, quantidade)
      values (v_stock_profile, (v_item->>'productId')::bigint, coalesce(v_stock_company, p_company_id), -v_qty);
      v_stock_override := true;
    end if;
    if exists(select 1 from public.estoque_perfil where perfil_id = v_stock_profile and produto_id = (v_item->>'productId')::bigint and quantidade < 0) then
      v_stock_override := true;
    end if;

    -- HISTÓRICO DE SAÍDA: o legado só registrava ALOCACAO (entrada), então o
    -- consumo sumia do estoque sem deixar rastro. Toda compra do TridiMarket
    -- passa a gravar um CONSUMO na MESMA tabela de movimentação já usada.
    --
    -- A tabela tem DOIS CHECKs que esta linha precisa respeitar:
    --   • tipo  → só aceita ALOCACAO, VENDA, AJUSTE e ENTRADA. 'CONSUMO' NÃO
    --     existe; para uma compra no mercadinho o certo é VENDA.
    --   • quantidade → precisa ser POSITIVA. A direção do movimento vem do
    --     tipo, não do sinal.
    -- Violar qualquer um derrubava a função inteira e, como a exceção desfaz
    -- tudo, NENHUMA compra era registrada: a venda, os itens, a baixa de
    -- estoque e o lançamento na carteira voltavam atrás juntos, e a operação
    -- ficava no tablet como REQUIRES_REVIEW tentando para sempre.
    insert into public.movimentacoes_estoque(perfil_id, produto_id, empresa_id, tipo, quantidade, referencia)
    values (v_stock_profile, (v_item->>'productId')::bigint, coalesce(v_stock_company, p_company_id),
      'VENDA', v_qty,
      'TridiMarket · venda ' || v_sale_id || case when v_cross then ' (visitante)' else '' end);
  end loop;

  -- DÍVIDA sempre na unidade do FUNCIONÁRIO (p_profile_id): a carteira dele
  -- pertence à empresa dele, não ao lugar onde ele comprou.
  insert into public.market_ledger_entries(employee_id, profile_id, operation_id, kind, amount, description, occurred_at, metadata)
  values (p_employee_id, p_profile_id, p_operation_id, 'purchase', round(v_total, 2),
    case when v_cross then 'Compra no TridiMarket (outra unidade)' else 'Compra no TridiMarket' end,
    p_device_occurred_at,
    jsonb_build_object('sale_id', v_sale_id, 'stock_override', v_stock_override,
      'stock_profile_id', v_stock_profile, 'cross_company', v_cross));

  update public.market_purchase_operations
    set sale_id = v_sale_id, stock_override = v_stock_override, status = 'SYNCED',
        result = jsonb_build_object('sale_id', v_sale_id, 'total', round(v_total, 2))
    where operation_id = p_operation_id;

  return query select 'SYNCED'::text, v_sale_id, null::text, now();
exception when others then
  update public.market_purchase_operations set status = 'REQUIRES_REVIEW', reason = sqlerrm where operation_id = p_operation_id;
  return query select 'REQUIRES_REVIEW'::text, v_sale_id, sqlerrm, now();
end;
$$;

revoke all on function public.market_sync_purchase(uuid,uuid,bigint,bigint,uuid,bigint,timestamptz,integer,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.market_sync_purchase(uuid,uuid,bigint,bigint,uuid,bigint,timestamptz,integer,text,jsonb,uuid) to service_role;

alter table public.market_product_rules enable row level security;
alter table public.market_devices enable row level security;
alter table public.market_employee_credit enable row level security;
alter table public.market_device_codes enable row level security;
alter table public.market_billing_cycles enable row level security;
alter table public.market_purchase_operations enable row level security;
alter table public.market_ledger_entries enable row level security;
alter table public.market_payments enable row level security;
alter table public.market_admin_audit_logs enable row level security;
