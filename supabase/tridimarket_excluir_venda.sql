-- TridiMarket — permitir EXCLUIR uma venda sem quebrar a imutabilidade do razão.
--
-- O problema: `lancamentos.venda_id` é `references vendas(id) on delete set
-- null`, mas o gatilho `lancamento_imutavel` recusa QUALQUER update na tabela.
-- Então o próprio SET NULL da chave estrangeira era barrado, e apagar uma venda
-- que tivesse lançamento (ou seja, toda venda do tablet) falhava com
--     P0001: lançamento é imutável — crie um lançamento compensatório
-- Medido: a exclusão nunca completava; a venda continuava lá e o valor devido
-- junto.
--
-- A correção NÃO afrouxa o razão no que importa: valor, tipo, pessoa, unidade,
-- descrição e datas seguem imutáveis, e DELETE continua proibido. O único
-- movimento liberado é soltar o vínculo com uma venda que deixou de existir —
-- que é exatamente o que a FK pede, e não muda um centavo de saldo.
--
-- Idempotente: pode rodar de novo.

create or replace function mercadinho.lancamento_imutavel() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'lançamento é imutável — crie um lançamento compensatório';
  end if;

  -- Única exceção: venda_id passando para NULL (a venda foi excluída) e mais
  -- nada mudando na linha.
  if new.id            is distinct from old.id
     or new.funcionario_id is distinct from old.funcionario_id
     or new.unidade_id     is distinct from old.unidade_id
     or new.tipo           is distinct from old.tipo
     or new.valor          is distinct from old.valor
     or new.descricao      is distinct from old.descricao
     or new.operacao_id    is distinct from old.operacao_id
     or new.metadados      is distinct from old.metadados
     or new.ocorrido_em    is distinct from old.ocorrido_em
     or new.criado_em      is distinct from old.criado_em
     or new.venda_id       is not null
  then
    raise exception 'lançamento é imutável — crie um lançamento compensatório';
  end if;

  return new;
end; $$;

-- O gatilho em si não muda (já cobre update e delete); só a função foi
-- reescrita. Recriado aqui para o arquivo poder ser rodado sozinho.
drop trigger if exists lancamentos_sem_update on mercadinho.lancamentos;
create trigger lancamentos_sem_update before update or delete on mercadinho.lancamentos
  for each row execute function mercadinho.lancamento_imutavel();


-- ── Mesmo defeito na AUDITORIA ──────────────────────────────────────────────
-- `auditoria.dispositivo_id` também é `on delete set null`, e o gatilho dela
-- barra qualquer update — então EXCLUIR UM TABLET falhava com
--     P0001: auditoria é append-only
-- Medido ao tentar limpar o cadastro de aparelhos: nenhum podia ser removido.
--
-- Mesma correção e mesmo limite: a trilha continua imutável no que importa
-- (autor, ação, entidade, antes/depois, datas) e DELETE segue proibido. Libera
-- só soltar o vínculo com um aparelho que deixou de existir.

create or replace function mercadinho.auditoria_imutavel() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'auditoria é append-only';
  end if;

  if new.id                 is distinct from old.id
     or new.autor_id           is distinct from old.autor_id
     or new.acao               is distinct from old.acao
     or new.entidade           is distinct from old.entidade
     or new.entidade_id        is distinct from old.entidade_id
     or new.antes              is distinct from old.antes
     or new.depois             is distinct from old.depois
     or new.ocorrido_em_device is distinct from old.ocorrido_em_device
     or new.registrado_em      is distinct from old.registrado_em
     or new.dispositivo_id     is not null
  then
    raise exception 'auditoria é append-only';
  end if;

  return new;
end; $$;

drop trigger if exists auditoria_sem_update on mercadinho.auditoria;
create trigger auditoria_sem_update before update or delete on mercadinho.auditoria
  for each row execute function mercadinho.auditoria_imutavel();
