-- ═══════════════════════════════════════════════════════════════════════════
-- CORREÇÃO — compra travava quando o produto estava SEM estoque na unidade
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SINTOMA: parte das compras do tablet não caía no sistema. No tablet elas
-- ficavam em REQUIRES_REVIEW com o motivo:
--   new row for relation "estoque_perfil" violates check constraint
--   "estoque_perfil_quantidade_check"
--
-- CAUSA: o desenho é "vender sem estoque é permitido" (marca stock_override),
-- mas a função tentava gravar quantidade NEGATIVA no estoque — e a tabela tem
-- um CHECK que proíbe quantidade < 0. A exceção desfaz a função INTEIRA, então
-- a venda, os itens E a dívida eram revertidos juntos: a compra "sumia" e a
-- carteira continuava sem dever nada.
--
-- FIX: o estoque agora TRAVA EM ZERO (nunca negativo). Vendeu mais do que
-- tinha → estoque vai a 0 e stock_override marca a venda descoberta, que é o
-- sinal que o painel de suspeitas usa. Linha de estoque inexistente → cria
-- zerada com override, em vez de criar negativa.
--
-- As compras presas nos tablets sobem sozinhas no próximo ciclo de sync (o
-- estado REQUIRES_REVIEW continua na fila de retentativa e a tentativa
-- anterior não deixou NADA gravado — a exceção reverteu tudo, inclusive o
-- registro da operação, então o reprocesso parte do zero, sem duplicar).
--
-- Idempotente: CREATE OR REPLACE, pode rodar quantas vezes quiser.
-- Rodar no Supabase do MERCADINHO (wcxhyludixozqloqzjpn).

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
  v_qtd_atual integer;
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

    -- ESTOQUE sempre na unidade do TABLET, e NUNCA NEGATIVO: a tabela tem um
    -- CHECK (quantidade >= 0) e gravar negativo estourava a exceção que
    -- revertia a venda inteira. Vendeu sem ter → trava em 0 + stock_override.
    select quantidade into v_qtd_atual from public.estoque_perfil
      where perfil_id = v_stock_profile and produto_id = (v_item->>'productId')::bigint
      for update;
    if not found then
      insert into public.estoque_perfil(perfil_id, produto_id, empresa_id, quantidade)
      values (v_stock_profile, (v_item->>'productId')::bigint, coalesce(v_stock_company, p_company_id), 0);
      v_stock_override := true;
    else
      if v_qtd_atual < v_qty then v_stock_override := true; end if;
      update public.estoque_perfil
        set quantidade = greatest(0, v_qtd_atual - v_qty), updated_at = now()
        where perfil_id = v_stock_profile and produto_id = (v_item->>'productId')::bigint;
    end if;

    -- Histórico de saída: mesmo padrão do fix anterior (tipo VENDA, qtd positiva).
    insert into public.movimentacoes_estoque(perfil_id, produto_id, empresa_id, tipo, quantidade, referencia)
    values (v_stock_profile, (v_item->>'productId')::bigint, coalesce(v_stock_company, p_company_id),
      'VENDA', v_qty,
      'TridiMarket · venda ' || v_sale_id || case when v_cross then ' (visitante)' else '' end);
  end loop;

  -- DÍVIDA sempre na unidade do FUNCIONÁRIO (p_profile_id).
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
