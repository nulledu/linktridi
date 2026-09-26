-- ═════════════════════════════════════════════════════════════════════════════
--  CONTATO, BANCO E RECORRÊNCIA — o que faltava dos três
-- ═════════════════════════════════════════════════════════════════════════════
--
--  Fecha a lista de campos pedida. Três assuntos num arquivo só porque um deles
--  (a view de saldo) precisa nascer DEPOIS das colunas de cartão, e separar em
--  três arquivos criaria a chance de rodar na ordem errada.
--
--  Rode DEPOIS de `supabase/financeiro.sql` e de
--  `supabase/financeiro_fornecedor_completo.sql`. Idempotente.

-- ── 1. Contato ───────────────────────────────────────────────────────────────
--
-- `telefones text[]` porque uma pessoa tem o WhatsApp pessoal e o da empresa, e
-- com um campo só quem cadastra escolhe um e perde o outro — justamente o que
-- faz alguém procurar no papel na hora de precisar.
--
-- A coluna `telefone` (singular) CONTINUA existindo e é escrita com o primeiro
-- da lista: a ficha, o CSV e a busca ainda leem dela.

alter table public.fin_contatos
  add column if not exists telefones  text[],
  add column if not exists categorias text[],
  -- Fornecedor / Cliente / Parceiro / Prestador / Outro. Sem `check` de
  -- propósito: o vocabulário é da TELA, e um `check` no banco transformaria
  -- "quero um tipo novo" num arquivo de SQL para o dono rodar.
  add column if not exists tipo       text,
  add column if not exists cargo      text,
  -- Onde a pessoa trabalha. Texto, e não `references fin_fornecedores`: o
  -- encanador não é fornecedor cadastrado, e obrigar um vínculo faria cadastrar
  -- empresa de terceiro só para anotar um nome.
  add column if not exists organizacao text,
  add column if not exists site       text;

-- Primeira carga: quem tem telefone/categoria em texto ganha a lista com aquele
-- valor. `where ... is null` faz disto uma migração de uma vez só — rodar de
-- novo não desfaz o que alguém editou na tela depois.
update public.fin_contatos
   set telefones = array[telefone]
 where telefones is null and coalesce(btrim(telefone), '') <> '';

update public.fin_contatos
   set categorias = array[categoria]
 where categorias is null and coalesce(btrim(categoria), '') <> '';

-- ── 2. Banco: cartão pendurado na conta, com limite ─────────────────────────
--
-- "Cartões" não vira tabela nova: um cartão JÁ é uma conta (`tipo = 'cartao'`).
-- O que faltava era dizer de qual banco ele é e quanto ele aguenta.
--
-- O quanto está EM USO não é coluna. Ele é derivado do saldo, como todo o resto
-- do módulo — um número gravado ao lado dos movimentos cria duas verdades, e a
-- que aparece na tela é sempre a que ninguém conferiu.

alter table public.fin_contas
  add column if not exists limite       numeric(14,2),
  add column if not exists conta_mae_id uuid references public.fin_contas(id) on delete set null,
  add column if not exists bandeira     text,
  add column if not exists final        text;

-- Um cartão não pode ser mãe de si mesmo, nem a conta apontar para ela própria:
-- o `left join` da view entraria em looping lógico e a árvore da tela também.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.fin_contas'::regclass and conname = 'fin_contas_mae_nao_e_ela'
  ) then
    alter table public.fin_contas
      add constraint fin_contas_mae_nao_e_ela check (conta_mae_id is null or conta_mae_id <> id);
  end if;
end $$;

create index if not exists fin_contas_mae on public.fin_contas (conta_mae_id);

-- ── 3. A view de saldo ganha limite, usado e disponível ─────────────────────
--
-- O `drop` antes do `create` NÃO é zelo: `create or replace view` no Postgres só
-- aceita ACRESCENTAR coluna no FIM, e qualquer outra mudança morre em «cannot
-- change name of view column». Como o SQL Editor roda o arquivo inteiro numa
-- transação, esse erro derrubaria TUDO — inclusive os `alter table` acima. Já
-- aconteceu neste banco uma vez.
--
-- `usado` é o quanto da fatura está aberto. Num cartão o saldo anda para o
-- NEGATIVO conforme se gasta, então usado = -saldo, nunca abaixo de zero. Em
-- conta que não é cartão o conceito não existe e o campo fica nulo, em vez de
-- zero: zero diria "tem limite e não usou nada", o que é falso.

drop view if exists public.fin_contas_saldo;
create view public.fin_contas_saldo as
select
  c.id, c.empresa_id, c.nome, c.tipo, c.instituicao, c.cor, c.ordem,
  c.ativa, c.inclui_no_saldo, c.saldo_inicial, c.responsavel_id,
  c.limite, c.conta_mae_id, c.bandeira, c.final,
  -- Agência e número: a tela de Bancos passou a mostrá-los e editá-los, e ela
  -- lê pela view — sem isto o formulário abriria sempre em branco.
  c.agencia, c.numero,
  c.saldo_inicial + coalesce(sum(m.valor) filter (where m.status = 'confirmado'), 0) as saldo,
  case when c.tipo = 'cartao'
       then greatest(0, -(c.saldo_inicial + coalesce(sum(m.valor) filter (where m.status = 'confirmado'), 0)))
  end as usado,
  case when c.tipo = 'cartao' and c.limite is not null
       then c.limite - greatest(0, -(c.saldo_inicial + coalesce(sum(m.valor) filter (where m.status = 'confirmado'), 0)))
  end as disponivel
from public.fin_contas c
left join public.fin_movimentos m on m.conta_id = c.id
group by c.id;

-- ── 4. Recorrência ───────────────────────────────────────────────────────────
--
-- `conta_id` já dizia de qual conta SAI o dinheiro. Faltava dizer em qual conta
-- ENTRA, para a recorrência que é receita (aluguel recebido, mensalidade) —
-- sem isso ela existia só como despesa.

alter table public.fin_recorrencias
  add column if not exists forma_pagamento   text,
  add column if not exists conta_destino_id  uuid references public.fin_contas(id) on delete set null,
  add column if not exists responsavel_id    uuid references public.fin_colaboradores(id) on delete set null,
  add column if not exists logo_url          text,
  add column if not exists icone             text;

-- A empresa cruzada vale para os vínculos novos também: uma recorrência da
-- Tridi não pode receber numa conta da Gedux. O gatilho é recriado com a lista
-- completa porque o Postgres não tem `create or replace trigger`.
drop trigger if exists fin_recorrencias_empresa_ok on public.fin_recorrencias;
create trigger fin_recorrencias_empresa_ok before insert or update on public.fin_recorrencias
  for each row execute function public.fin_confere_empresa(
    'fornecedor_id,fin_fornecedores', 'conta_id,fin_contas',
    'conta_destino_id,fin_contas', 'responsavel_id,fin_colaboradores');

-- E para o cartão pendurado na conta: cartão da Tridi não mora em banco da Gedux.
drop trigger if exists fin_contas_empresa_ok on public.fin_contas;
create trigger fin_contas_empresa_ok before insert or update on public.fin_contas
  for each row execute function public.fin_confere_empresa(
    'responsavel_id,fin_colaboradores', 'conta_mae_id,fin_contas');

-- ── Conferência ──────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_contatos'
      and column_name in ('telefones','categorias','tipo','cargo','organizacao','site')) as colunas_contato,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_contas'
      and column_name in ('limite','conta_mae_id','bandeira','final')) as colunas_conta,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_contas_saldo'
      and column_name in ('limite','usado','disponivel','agencia','numero')) as colunas_view,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_recorrencias'
      and column_name in ('forma_pagamento','conta_destino_id','responsavel_id','logo_url','icone')) as colunas_recorrencia;
