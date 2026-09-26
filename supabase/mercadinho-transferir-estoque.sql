-- ── Mercadinho · transferir estoque entre empresas, atomicamente ────────────
-- Rodar no Supabase da plataforma (schema `mercadinho`, supabase/mercadinho-novo.sql).
-- Idempotente: `create or replace`, pode rodar de novo.
--
-- Por que uma função no banco, e não dois updates na rota:
--
-- Transferir é "sai de A, entra em B". Pelo cliente Supabase isso são duas
-- escritas separadas, sem transação entre elas. Se a primeira grava e a segunda
-- falha (rede, `check (quantidade >= 0)`, RLS, cold start), as unidades
-- SIMPLESMENTE DESAPARECEM do sistema — saíram de A e não chegaram em B. Não é
-- hipótese remota: é o modo de falha mais comum de qualquer transferência feita
-- em dois passos.
--
-- Aqui as duas pontas, mais as duas linhas de histórico, acontecem dentro de
-- uma função — logo, uma transação só. Ou vai inteiro, ou não vai.
--
-- A rota (app/api/tridimarket/inventory/route.ts) chama isto por RPC e tem um
-- caminho de reserva para quando a função ainda não existe no banco: faz em
-- dois passos e DESFAZ a primeira ponta se a segunda falhar. Funciona, mas é
-- inferior — rode este arquivo.

create or replace function mercadinho.transferir_estoque(
  p_produto  bigint,
  p_origem   uuid,
  p_destino  uuid,
  p_qtd      integer,
  p_motivo   text default null,
  p_autor    uuid default null
) returns table (saldo_origem integer, saldo_destino integer)
language plpgsql
security definer
set search_path = mercadinho, public
as $$
declare
  v_antes_origem  integer;
  v_antes_destino integer;
begin
  if p_qtd is null or p_qtd <= 0 then
    raise exception 'quantidade_invalida' using hint = 'A quantidade transferida tem que ser maior que zero.';
  end if;
  if p_origem = p_destino then
    raise exception 'mesma_empresa' using hint = 'Origem e destino são a mesma empresa.';
  end if;

  -- `for update` nas duas linhas: duas transferências simultâneas do mesmo
  -- produto não podem ler o mesmo saldo e gravar em cima uma da outra. Sem o
  -- lock, dois ajustes de -5 num saldo de 8 passariam os dois.
  select quantidade into v_antes_origem
    from mercadinho.estoque
   where unidade_id = p_origem and produto_id = p_produto
     for update;

  if v_antes_origem is null then
    raise exception 'sem_estoque_na_origem' using hint = 'A empresa de origem não tem linha de estoque para este produto.';
  end if;
  if v_antes_origem < p_qtd then
    raise exception 'estoque_insuficiente' using hint = format('Só há %s un. na origem — não dá para transferir %s.', v_antes_origem, p_qtd);
  end if;

  -- O destino pode não ter linha ainda (produto novo naquela loja): nasce em 0
  -- e recebe a quantidade. `minimo` fica no padrão da tabela.
  insert into mercadinho.estoque (unidade_id, produto_id, quantidade)
  values (p_destino, p_produto, 0)
      on conflict (unidade_id, produto_id) do nothing;

  select quantidade into v_antes_destino
    from mercadinho.estoque
   where unidade_id = p_destino and produto_id = p_produto
     for update;

  update mercadinho.estoque
     set quantidade = quantidade - p_qtd, atualizado_em = now()
   where unidade_id = p_origem and produto_id = p_produto;

  update mercadinho.estoque
     set quantidade = quantidade + p_qtd, atualizado_em = now()
   where unidade_id = p_destino and produto_id = p_produto;

  -- Histórico nas DUAS pontas, com o mesmo motivo. `TRANSFERENCIA` já é um
  -- tipo aceito pelo check de `movimentacoes` — a direção se lê pela unidade.
  insert into mercadinho.movimentacoes (unidade_id, produto_id, tipo, quantidade, motivo, autor_id)
  values (p_origem,  p_produto, 'TRANSFERENCIA', p_qtd,
          coalesce(nullif(trim(p_motivo), ''), 'transferência') || ' (saída)',  p_autor),
         (p_destino, p_produto, 'TRANSFERENCIA', p_qtd,
          coalesce(nullif(trim(p_motivo), ''), 'transferência') || ' (entrada)', p_autor);

  return query select v_antes_origem - p_qtd, v_antes_destino + p_qtd;
end $$;

-- A rota chama com a chave service_role, que ignora RLS; `security definer`
-- está aqui pra função seguir funcionando caso um dia ela seja chamada por uma
-- sessão comum. `revoke` do anon fecha a porta de quem não deveria chamar.
revoke all on function mercadinho.transferir_estoque(bigint, uuid, uuid, integer, text, uuid) from public;
revoke all on function mercadinho.transferir_estoque(bigint, uuid, uuid, integer, text, uuid) from anon;

-- Conferir (troque os ids): tem que devolver os dois saldos novos.
-- select * from mercadinho.transferir_estoque(
--   <produto_id>, '<unidade_origem>'::uuid, '<unidade_destino>'::uuid, 1, 'teste', null);
