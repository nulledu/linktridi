-- ═══════════════════════════════════════════════════════════════════════════
-- CORREÇÃO URGENTE — nenhuma compra do TridiMarket chegava ao banco
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SINTOMA: a compra sumia. No tablet ela ficava na fila com estado
-- REQUIRES_REVIEW e o motivo:
--   new row for relation "movimentacoes_estoque" violates check constraint
--   "movimentacoes_estoque_tipo_check"
--
-- CAUSA: a função gravava a saída de estoque como tipo 'CONSUMO' e quantidade
-- NEGATIVA. A tabela movimentacoes_estoque tem dois CHECKs:
--   • tipo        aceita apenas ALOCACAO, VENDA, AJUSTE e ENTRADA
--                 ('CONSUMO' não existe — o certo para o mercadinho é VENDA)
--   • quantidade  precisa ser positiva (a direção vem do tipo, não do sinal)
--
-- Como a exceção desfaz a função inteira, a venda, os itens, a baixa de
-- estoque e o lançamento na carteira eram TODOS revertidos junto — por isso
-- nada aparecia no painel.
--
-- Atinge compra ONLINE e OFFLINE: as duas passam por esta função.
--
-- DEPOIS DE RODAR: as compras presas nos tablets sobem sozinhas. Elas estão em
-- REQUIRES_REVIEW, que continua na fila de retentativa, e o operation_id
-- garante que cada uma entre UMA única vez, sem duplicar.
--
-- Idempotente: é um CREATE OR REPLACE, pode rodar quantas vezes quiser.

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
