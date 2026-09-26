-- ═══════════════════════════════════════════════════════════════════════════
-- O razão precisa LEMBRAR de qual venda cada lançamento veio — inclusive
-- depois que a venda é excluída.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `lancamentos.venda_id` era uma FK com `on delete set null`. Isso parece
-- inofensivo (a venda sumiu, o ponteiro some junto), mas quebra a CONTA:
--
--   A dívida é lida agrupando os lançamentos POR VENDA — a compra e as
--   correções dela se anulam ali dentro, na fatura em que a compra caiu. Só
--   lançamento SEM venda é crédito solto, e crédito solto o FIFO gasta na
--   dívida MAIS ANTIGA.
--
--   Ao excluir uma venda de setembro, o `set null` soltava a compra E o
--   estorno dela. Os dois viravam avulsos: o estorno ia abater a fatura de
--   AGOSTO e a de setembro ficava parada. A dívida total fechava certo, mas o
--   número que a pessoa está olhando na tela não mexia — de novo.
--
-- A correção é tirar a FK e deixar `venda_id` como um id simples. O razão é
-- imutável por gatilho de propósito: ele é histórico, e histórico não pode
-- perder informação porque a linha de origem foi apagada.
--
-- Idempotente: pode rodar quantas vezes quiser.

do $$
declare
  v_nome text;
begin
  -- Descobre o nome real da constraint (não depende do padrão do Postgres).
  select con.conname into v_nome
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'mercadinho'
    and rel.relname = 'lancamentos'
    and con.contype = 'f'
    and con.conkey = array[(
      select attnum from pg_attribute
      where attrelid = rel.oid and attname = 'venda_id'
    )]
  limit 1;

  if v_nome is not null then
    execute format('alter table mercadinho.lancamentos drop constraint %I', v_nome);
    raise notice 'FK % removida: venda_id agora sobrevive à exclusão da venda.', v_nome;
  else
    raise notice 'Nada a fazer: lancamentos.venda_id já não tem FK.';
  end if;
end $$;

-- O índice continua valendo a pena: toda leitura de saldo agrupa por venda.
create index if not exists lancamentos_venda on mercadinho.lancamentos (venda_id)
  where venda_id is not null;
