-- ═════════════════════════════════════════════════════════════════════════════
--  O FORNECEDOR PASSA A SER UM SÓ — o do Financeiro
-- ═════════════════════════════════════════════════════════════════════════════
--
--  Havia dois cadastros de fornecedor no sistema: `estoque_fornecedores` (nome,
--  CNPJ, contato) e `fin_fornecedores` (o mesmo, mais prazo e forma de
--  pagamento). Dois cadastros da mesma coisa não ficam iguais: um ganha o CNPJ
--  novo, o outro fica com o telefone velho, e a pergunta "de quem a gente
--  compra isso?" passa a ter duas respostas — sendo que a errada é sempre a que
--  está aberta na tela.
--
--  O Financeiro vira a base. Não por ser mais bonito: é o cadastro que a
--  empresa REALMENTE usa (9 fornecedores contra 0 do estoque, no dia desta
--  mudança) e o único que sabe prazo e forma de pagamento, que é o que a compra
--  precisa. O do estoque tinha zero linha — a troca não perde nada de ninguém.
--
--  Este arquivo é idempotente: rode quantas vezes quiser.

-- ── 1. O item do catálogo aponta para o fornecedor do Financeiro ─────────────
--
-- A troca de chave estrangeira é feita DENTRO de uma guarda que confere se
-- sobrou órfão. Se algum item apontar para um fornecedor do estoque que não
-- existe no Financeiro, o bloco NÃO troca a chave e avisa: apagar o vínculo
-- para a migração passar seria decidir, sozinho e em silêncio, que a origem
-- daquele material não importa mais.
--
-- Rodar de novo com a chave já trocada não faz nada: o `conname` já aponta para
-- `fin_fornecedores` e o bloco sai pelo primeiro `if`.

do $$
declare
  aponta_para text;
  orfaos      bigint;
begin
  -- Só age se as duas tabelas existirem: quem ainda não rodou o
  -- `financeiro.sql` não pode ter o estoque quebrado por causa disso.
  if to_regclass('public.fin_fornecedores') is null
     or to_regclass('public.estoque_itens') is null then
    raise notice 'fin_fornecedores ou estoque_itens ainda não existem — nada a fazer.';
    return;
  end if;

  select confrelid::regclass::text into aponta_para
    from pg_constraint
   where conrelid = 'public.estoque_itens'::regclass
     and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                          where attrelid = 'public.estoque_itens'::regclass
                            and attname = 'fornecedor_id')];

  if aponta_para = 'fin_fornecedores' then
    raise notice 'estoque_itens.fornecedor_id já aponta para fin_fornecedores.';
    return;
  end if;

  select count(*) into orfaos
    from public.estoque_itens i
   where i.fornecedor_id is not null
     and not exists (select 1 from public.fin_fornecedores f where f.id = i.fornecedor_id);

  if orfaos > 0 then
    raise notice
      'NÃO troquei a chave: % item(ns) apontam para um fornecedor que não existe no Financeiro. '
      'Cadastre-os em fin_fornecedores com o MESMO id, ou limpe o vínculo à mão, e rode de novo.',
      orfaos;
    return;
  end if;

  alter table public.estoque_itens drop constraint if exists estoque_itens_fornecedor_id_fkey;
  alter table public.estoque_itens
    add constraint estoque_itens_fornecedor_id_fkey
    foreign key (fornecedor_id) references public.fin_fornecedores(id) on delete set null;

  raise notice 'estoque_itens.fornecedor_id agora aponta para fin_fornecedores.';
end $$;

-- ── 2. A mesma troca para a compra do recebimento ────────────────────────────
-- `compras.fornecedor_id` existe em alguns bancos e não em outros (depende de
-- quais arquivos já rodaram). O bloco confere a coluna antes de mexer.

do $$
declare
  aponta_para text;
  orfaos      bigint;
begin
  if to_regclass('public.fin_fornecedores') is null
     or to_regclass('public.compras') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'compras'
                       and column_name = 'fornecedor_id') then
    return;
  end if;

  select confrelid::regclass::text into aponta_para
    from pg_constraint
   where conrelid = 'public.compras'::regclass
     and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                          where attrelid = 'public.compras'::regclass
                            and attname = 'fornecedor_id')];

  if aponta_para is null or aponta_para = 'fin_fornecedores' then return; end if;

  select count(*) into orfaos
    from public.compras c
   where c.fornecedor_id is not null
     and not exists (select 1 from public.fin_fornecedores f where f.id = c.fornecedor_id);

  if orfaos > 0 then
    raise notice 'NÃO troquei a chave de compras: % compra(s) com fornecedor fora do Financeiro.', orfaos;
    return;
  end if;

  execute 'alter table public.compras drop constraint if exists compras_fornecedor_id_fkey';
  execute 'alter table public.compras
             add constraint compras_fornecedor_id_fkey
             foreign key (fornecedor_id) references public.fin_fornecedores(id) on delete set null';
end $$;

-- ── 3. A tabela velha fica, marcada como morta ───────────────────────────────
--
-- `estoque_fornecedores` NÃO é derrubada aqui de propósito. Ela está vazia no
-- banco desta empresa, mas este arquivo pode rodar num banco onde alguém
-- cadastrou alguma coisa — e `drop table` não pergunta. Um comentário no
-- catálogo é o suficiente para quem for ler o schema daqui a um ano entender
-- que aquilo não é usado, sem custar dado de ninguém.

do $$
begin
  if to_regclass('public.estoque_fornecedores') is not null then
    comment on table public.estoque_fornecedores is
      'MORTA desde 21/08/2026: o fornecedor do estoque passou a ser o do Financeiro '
      '(fin_fornecedores). Nada no app lê ou escreve aqui. Mantida só para não '
      'apagar dado de um banco onde alguém tenha cadastrado algo.';
  end if;
end $$;

-- ── Conferência ──────────────────────────────────────────────────────────────
select
  'item aponta pro Financeiro' as o_que,
  coalesce((select confrelid::regclass::text from pg_constraint
             where conrelid = 'public.estoque_itens'::regclass and contype = 'f'
               and conkey = array[(select attnum from pg_attribute
                                    where attrelid = 'public.estoque_itens'::regclass
                                      and attname = 'fornecedor_id')]), '—') as aponta_para;
