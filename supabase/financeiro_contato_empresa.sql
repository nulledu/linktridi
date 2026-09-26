-- ═════════════════════════════════════════════════════════════════════════════
--  CONTATO PODE SER EMPRESA — e a recorrência pode apontar para um contato
-- ═════════════════════════════════════════════════════════════════════════════
--
--  Duas coisas pedidas:
--
--  1. Em Contatos, poder cadastrar EMPRESAS e as pessoas DELAS. Hoje só existe
--     `organizacao` em texto: dá para escrever "Elétrica Rápida" na ficha de
--     três pessoas e ninguém sabe que são a mesma empresa — nem dá para achar
--     "todo mundo da Elétrica Rápida".
--
--     A empresa NÃO vira tabela nova. Um contato ganha uma NATUREZA: pessoa ou
--     empresa. A empresa é um contato como outro qualquer — tem foto, telefone,
--     site, categoria, endereço, tudo o que já existe — e cada pessoa aponta
--     para ela em `organizacao_id`. Tabela separada custaria duplicar os oito
--     campos que os dois já compartilham, mais uma tela, mais uma rota, mais um
--     lugar para a foto morar.
--
--     `organizacao` (texto) CONTINUA: é o que serve para quem não vale a pena
--     cadastrar ("o eletricista do prédio"). Quem tem `organizacao_id` mostra o
--     nome dela; quem não tem, mostra o texto.
--
--  2. A recorrência pode apontar para um CONTATO. `fornecedor_id` só serve para
--     quem está no cadastro de fornecedores — o aluguel é pago para uma pessoa
--     que não vende nada, e hoje não havia onde dizer para quem.
--
--  Rode DEPOIS de `supabase/financeiro_contato_banco_recorrencia.sql`.
--  Idempotente.

-- ── 1. A natureza do contato, e a empresa a que ele pertence ────────────────

alter table public.fin_contatos
  -- Sem `check` de propósito, como o `tipo`: o vocabulário é da TELA, e um
  -- `check` transformaria "quero uma natureza nova" num arquivo de SQL.
  add column if not exists natureza       text not null default 'pessoa',
  add column if not exists organizacao_id uuid references public.fin_contatos(id) on delete set null;

-- Uma empresa não é dela mesma. Sem isto a árvore da tela entra em looping e a
-- pergunta "quem trabalha aqui?" nunca termina.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.fin_contatos'::regclass and conname = 'fin_contatos_org_nao_e_ela'
  ) then
    alter table public.fin_contatos
      add constraint fin_contatos_org_nao_e_ela check (organizacao_id is null or organizacao_id <> id);
  end if;
end $$;

create index if not exists fin_contatos_org on public.fin_contatos (organizacao_id);
create index if not exists fin_contatos_natureza on public.fin_contatos (empresa_id, natureza);

-- A empresa do contato-pai tem de ser a MESMA: uma pessoa da Tridi não pende
-- de uma empresa cadastrada na Gedux.
drop trigger if exists fin_contatos_empresa_ok on public.fin_contatos;
create trigger fin_contatos_empresa_ok before insert or update on public.fin_contatos
  for each row execute function public.fin_confere_empresa('organizacao_id,fin_contatos');

-- ── 2. A recorrência aponta para um contato ─────────────────────────────────

alter table public.fin_recorrencias
  add column if not exists contato_id uuid references public.fin_contatos(id) on delete set null;

alter table public.fin_compromissos
  add column if not exists contato_id uuid references public.fin_contatos(id) on delete set null;

-- O gatilho é recriado com a lista COMPLETA: o Postgres não tem
-- `create or replace trigger`, e recriar só com o vínculo novo derrubaria as
-- conferências que já existiam (fornecedor, conta, conta de destino, responsável).
drop trigger if exists fin_recorrencias_empresa_ok on public.fin_recorrencias;
create trigger fin_recorrencias_empresa_ok before insert or update on public.fin_recorrencias
  for each row execute function public.fin_confere_empresa(
    'fornecedor_id,fin_fornecedores', 'conta_id,fin_contas',
    'conta_destino_id,fin_contas', 'responsavel_id,fin_colaboradores',
    'contato_id,fin_contatos');

-- O favorecido materializado acompanha a regra. A lista precisa permanecer
-- completa: recriar este trigger sem conta/fornecedor/colaborador removeria
-- proteções antigas em silêncio.
drop trigger if exists fin_compromissos_empresa_ok on public.fin_compromissos;
create trigger fin_compromissos_empresa_ok before insert or update on public.fin_compromissos
  for each row execute function public.fin_confere_empresa(
    'fornecedor_id,fin_fornecedores', 'conta_id,fin_contas',
    'colaborador_id,fin_colaboradores', 'contato_id,fin_contatos');

-- ── Conferência ──────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_contatos'
      and column_name in ('natureza','organizacao_id')) as colunas_contato,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_recorrencias'
      and column_name = 'contato_id') as coluna_recorrencia,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_compromissos'
      and column_name = 'contato_id') as coluna_compromisso,
  (select count(*) from public.fin_contatos where natureza = 'empresa') as empresas_cadastradas;
