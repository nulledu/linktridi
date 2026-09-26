-- Venda excluída passa a ESTORNAR a operação do tablet.
--
-- O buraco que isto fecha (diagnosticado em 03/08/2026):
--
-- `operacoes_compra.venda_id` referencia `vendas(id)` com ON DELETE SET NULL.
-- Quando alguém apagava uma venda pelo ERP, o vínculo virava NULL mas o status
-- continuava 'SINCRONIZADA'. O resultado era um registro que MENTE: diz que a
-- compra foi sincronizada e não aponta para venda nenhuma.
--
-- Pior: o tablet guarda a operação como SYNCED e nunca reenvia, e a idempotência
-- do `registrar_compra` devolve 'SINCRONIZADA' se ele tentar. Ou seja, a venda
-- apagada era irrecuperável E invisível — foi o que fez parecer, por dias, que a
-- sincronização do mercadinho estava quebrada, quando na verdade dez vendas
-- tinham sido apagadas à mão durante uma limpeza de teste.
--
-- É gatilho, e não código na rota de exclusão, porque a venda pode sumir por
-- vários caminhos: a rota do ERP, o painel do Supabase, um script de limpeza.
-- Só o banco vê todos eles.
--
-- Idempotente: pode rodar quantas vezes quiser.

create or replace function mercadinho.estornar_operacao_da_venda()
returns trigger
language plpgsql
security definer
set search_path = mercadinho, public
as $$
begin
  -- Roda ANTES do ON DELETE SET NULL apagar o vínculo — depois dele não haveria
  -- mais como saber qual operação pertencia a esta venda.
  update mercadinho.operacoes_compra
     set status = 'ESTORNADA',
         motivo = coalesce(motivo, 'venda_excluida')
   where venda_id = old.id
     and status <> 'ESTORNADA';
  return old;
end;
$$;

drop trigger if exists venda_excluida_estorna_operacao on mercadinho.vendas;
create trigger venda_excluida_estorna_operacao
  before delete on mercadinho.vendas
  for each row execute function mercadinho.estornar_operacao_da_venda();

-- Corrige o que já ficou órfão antes do gatilho existir.
--
-- Uma operação SINCRONIZADA sem `venda_id` só pode ter chegado a este estado por
-- exclusão da venda: a RPC preenche os dois campos na mesma transação, então não
-- existe janela em que ela grave um sem o outro.
update mercadinho.operacoes_compra
   set status = 'ESTORNADA',
       motivo = coalesce(motivo, 'venda_excluida_retroativo')
 where status = 'SINCRONIZADA'
   and venda_id is null;
