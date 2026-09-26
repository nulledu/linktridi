-- ─────────────────────────────────────────────────────────────────────────────
-- MÓDULO FINANCEIRO — Tridi + Gedux
-- ─────────────────────────────────────────────────────────────────────────────
-- Rode no SQL Editor do Supabase. O arquivo é IDEMPOTENTE: rodar de novo não
-- apaga nada nem duplica nada, então pode reexecutar depois de cada ajuste.
--
-- O que ele monta (§15 da especificação):
--   empresas · acessos por empresa · fornecedores · colaboradores · contas
--   recorrências · compras (+ itens + parcelas) · compromissos · movimentos
--   notas fiscais · patrimônio · anexos · auditoria
--
-- TRÊS DECISÕES QUE O ARQUIVO CARREGA
--
-- 1. `empresa_id` é OBRIGATÓRIO em toda entidade operacional, e todo vínculo
--    entre entidades é conferido POR EMPRESA (gatilho `fin_confere_empresa`).
--    Sem isso, uma compra da Tridi conseguiria apontar para um fornecedor da
--    Gedux e o número certo apareceria na tela errada.
--
-- 2. Dinheiro é `numeric(14,2)`. Nunca float — `0.1 + 0.2` em float não dá 0.3,
--    e num extrato isso vira centavo que ninguém acha.
--
-- 3. RLS LIGADA E SEM NENHUMA POLÍTICA em todas as tabelas `fin_*`. Não é
--    descuido: é deny-all. O app inteiro lê o financeiro pelo `service_role`
--    (que ignora RLS por definição), então nada aqui depende de política — e
--    quem chegar com a chave `anon`, que é pública e vive no browser, não lê
--    uma linha. Se um dia alguma tela passar a ler direto do cliente, ela vai
--    voltar vazia; a correção é a rota de API, não uma política aberta.
--
-- Depende de: `pgcrypto` (gen_random_uuid) — já ativo em projeto Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ── 0. Utilidades ────────────────────────────────────────────────────────────

-- `updated_at` que se mantém sozinho. Uma coluna que depende de alguém lembrar
-- de preencher é uma coluna que mente na metade das linhas.
create or replace function public.fin_touch() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Confere que a linha e a linha apontada são da MESMA empresa (§2). Recebe
-- pares "coluna_da_fk,tabela_alvo" via TG_ARGV e resolve genericamente — assim
-- uma FK nova entra na trava acrescentando um argumento no gatilho, e não
-- copiando mais um bloco de `if` para cá.
create or replace function public.fin_confere_empresa() returns trigger language plpgsql as $$
declare
  i int; col text; alvo text; id_alvo uuid; emp_alvo uuid;
begin
  i := 0;
  while i < TG_NARGS loop
    col  := split_part(TG_ARGV[i], ',', 1);
    alvo := split_part(TG_ARGV[i], ',', 2);
    execute format('select ($1).%I', col) into id_alvo using new;
    if id_alvo is not null then
      execute format('select empresa_id from public.%I where id = $1', alvo) into emp_alvo using id_alvo;
      if emp_alvo is not null and emp_alvo <> new.empresa_id then
        raise exception
          'financeiro: % aponta para % de outra empresa (% <> %)', TG_TABLE_NAME, alvo, emp_alvo, new.empresa_id
          using errcode = 'check_violation';
      end if;
    end if;
    i := i + 1;
  end loop;
  return new;
end $$;

-- ── 1. Empresas ──────────────────────────────────────────────────────────────

create table if not exists public.fin_empresas (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  nome        text not null,
  razao_social text,
  cnpj        text,
  cor         text,                      -- token/cor de acento no seletor
  ordem       int  not null default 0,
  ativa       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Marca (§ tela de configuração) ───────────────────────────────────────────
-- Entraram DEPOIS do `create table`, então precisam do `alter`: um
-- `create table if not exists` não acrescenta coluna em tabela que já existe —
-- ele simplesmente não faz nada, e quem já rodou o arquivo nunca veria o campo.
--
-- `logo_url` guarda o CAMINHO no bucket privado `financeiro` (não a URL), pelo
-- mesmo motivo dos anexos: URL assinada vence, e uma coluna cheia de link morto
-- é pior do que coluna vazia. Quem monta o link é o servidor, na hora.
-- `icone` é o nome de um ícone Tabler, usado quando não há logo — assim toda
-- empresa tem uma marca, mesmo antes de alguém subir imagem nenhuma.
alter table public.fin_empresas
  add column if not exists logo_url text,
  add column if not exists icone    text;

insert into public.fin_empresas (slug, nome, ordem) values
  ('tridi', 'Tridi', 1),
  ('gedux', 'Gedux', 2)
on conflict (slug) do nothing;

-- Acesso POR EMPRESA. Regra: quem tem a área "financeiro" liberada na grade do
-- ERP enxerga TODAS as empresas ativas — a menos que exista linha aqui para
-- essa pessoa; aí ela passa a enxergar só as empresas listadas.
--
-- É restrição, não concessão: uma tabela vazia não abre nada (a porta continua
-- sendo a área restrita), e inverter isso obrigaria a cadastrar todo mundo duas
-- vezes para ninguém ganhar poder nenhum.
create table if not exists public.fin_acessos (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.fin_empresas(id) on delete cascade,
  user_id    uuid not null,
  papel      text not null default 'finance_operator'
             check (papel in ('finance_admin', 'finance_operator', 'finance_viewer')),
  created_at timestamptz not null default now(),
  unique (empresa_id, user_id)
);
create index if not exists fin_acessos_user on public.fin_acessos (user_id);

-- ── 2. Cadastros ─────────────────────────────────────────────────────────────

create table if not exists public.fin_fornecedores (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.fin_empresas(id) on delete restrict,
  nome          text not null,
  cnpj          text,
  categoria     text,
  contato_nome  text,
  contato_email text,
  contato_fone  text,
  prazo_dias    int,
  forma_pagamento text,
  observacao    text,
  ativo         boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid,
  deleted_at timestamptz
);
create index if not exists fin_fornecedores_empresa on public.fin_fornecedores (empresa_id, ativo);
create unique index if not exists fin_fornecedores_cnpj
  on public.fin_fornecedores (empresa_id, cnpj) where cnpj is not null and deleted_at is null;

-- ── Contatos ─────────────────────────────────────────────────────────────────
-- "Meio que um fornecedor, mas pra outros fins" — encanador, eletricista,
-- chaveiro: gente que se chama quando precisa, não gente de quem se COMPRA.
-- Por isso é tabela PRÓPRIA, e não uma categoria dentro de `fin_fornecedores`:
-- um contato nunca aparece no seletor de fornecedor de uma compra (§7), e um
-- fornecedor nunca precisa dividir espaço com o encanador na tela de quem
-- fornece matéria-prima. `categoria` aqui é o TIPO DE SERVIÇO (texto livre,
-- como em fornecedor) — "Encanador" é exemplo, não catálogo fechado.
--
-- Sem `cnpj`, `prazo_dias` nem `forma_pagamento`: são campos de quem se
-- COMPRA a prazo, e um contato não entra em compra nem em compromisso. Sem
-- FK apontando pra cá em lugar nenhum do schema — é o único cadastro do
-- módulo que não alimenta nada além de si mesmo, por isso o DELETE de quem
-- nunca foi citado é de verdade (`deleted_at`), sem a checagem de "está em
-- uso" que fornecedor precisa.
create table if not exists public.fin_contatos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.fin_empresas(id) on delete restrict,
  nome          text not null,
  categoria     text,
  telefone      text,
  email         text,
  endereco      text,
  observacao    text,
  ativo         boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid,
  deleted_at timestamptz
);
create index if not exists fin_contatos_empresa on public.fin_contatos (empresa_id, ativo);

-- ── Marca de quem tem cara própria ───────────────────────────────────────────
-- Mesma dupla que `fin_empresas` e `fin_contas` já carregam: `logo_url` guarda
-- o CAMINHO no bucket privado (URL assinada vence, e coluna cheia de link morto
-- é pior que coluna vazia) e `icone` é o nome de um Tabler para quando não há
-- imagem. Fornecedor e contato entram porque são as duas listas que a pessoa
-- percorre procurando UM nome no meio de dezenas — e reconhecer uma marca é
-- mais rápido que ler.
--
-- `alter` em vez de mexer no `create table`: quem já rodou o arquivo não
-- veria coluna nova (`create table if not exists` não acrescenta nada em
-- tabela existente — simplesmente não faz nada).
alter table public.fin_fornecedores
  add column if not exists logo_url text,
  add column if not exists icone    text;

alter table public.fin_contatos
  add column if not exists logo_url text,
  add column if not exists icone    text;

-- Colaboradores do FINANCEIRO. Tabela própria de propósito, e não uma coluna
-- nova em `employees`: salário e benefício não podem morar na tabela que a área
-- "Colaboradores" (RH) lê — senão liberar o RH para alguém entregaria junto a
-- folha inteira, que é exatamente o que a área restrita existe para impedir.
-- `employee_id` liga na pessoa do ERP quando ela existe lá (a Gedux tem gente
-- que não tem login no sistema).
create table if not exists public.fin_colaboradores (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.fin_empresas(id) on delete restrict,
  employee_id  uuid,
  nome         text not null,
  setor        text,
  cargo        text,
  salario_base numeric(14,2) not null default 0,
  beneficios   numeric(14,2) not null default 0,
  dia_pagamento int check (dia_pagamento between 1 and 31),
  admissao     date,
  desligamento date,
  status       text not null default 'ativo' check (status in ('ativo', 'afastado', 'desligado')),
  observacao   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index if not exists fin_colaboradores_empresa on public.fin_colaboradores (empresa_id, status);

-- O que muda TODO MÊS: bônus, hora extra, vale, falta, farmácia, mercadinho.
--
-- `valor` é sempre POSITIVO e o sinal vem do `tipo`. Guardar desconto como
-- número negativo parece economia de código até alguém digitar "-200" num campo
-- que já subtrai e o vale virar crédito — o erro não aparece na tela, aparece no
-- pagamento. Com o sinal na tabela de tipos, digitar errado é impossível.
--
-- `quantidade` é a leitura humana do lançamento: 8 horas, 2 faltas. Não entra na
-- conta (o valor já vem calculado), serve pra folha explicar de onde veio o
-- número — folha que não se explica é folha que ninguém confere.
create table if not exists public.fin_folha_lancamentos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.fin_empresas(id) on delete restrict,
  colaborador_id uuid not null references public.fin_colaboradores(id) on delete cascade,
  competencia    date not null,
  tipo           text not null check (tipo in (
                   'bonus', 'horas_extras', 'outro_credito',
                   'adiantamento', 'faltas', 'farmacia', 'mercadinho', 'outro_desconto')),
  descricao      text,
  quantidade     numeric(10,2),
  valor          numeric(14,2) not null default 0 check (valor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index if not exists fin_folha_lanc_pessoa
  on public.fin_folha_lancamentos (colaborador_id, competencia);
create index if not exists fin_folha_lanc_mes
  on public.fin_folha_lancamentos (empresa_id, competencia);

-- Bancos, gateways, cartões e carteiras. O saldo NÃO mora aqui: é derivado de
-- `saldo_inicial + soma dos movimentos confirmados`. Guardar um saldo gravado
-- ao lado dos movimentos cria duas verdades, e a que aparece na tela é sempre a
-- que ninguém conferiu.
create table if not exists public.fin_contas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.fin_empresas(id) on delete restrict,
  nome           text not null,
  tipo           text not null default 'banco' check (tipo in ('banco', 'gateway', 'cartao', 'carteira')),
  instituicao    text,
  agencia        text,
  numero         text,
  saldo_inicial  numeric(14,2) not null default 0,
  inclui_no_saldo boolean not null default true,   -- cartão de crédito fica fora do "saldo disponível"
  fechamento_dia int check (fechamento_dia between 1 and 31),
  vencimento_dia int check (vencimento_dia between 1 and 31),
  cor            text,
  ordem          int not null default 0,
  ativa          boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index if not exists fin_contas_empresa on public.fin_contas (empresa_id, ativa);

-- Quem cuida desta conta. Entrou DEPOIS do `create table`, então precisa do
-- `alter`: `create table if not exists` não acrescenta coluna em tabela que já
-- existe — ele simplesmente não faz nada, e a coluna nova nunca apareceria pra
-- quem já rodou o arquivo uma vez.
alter table public.fin_contas
  add column if not exists responsavel_id uuid references public.fin_colaboradores(id) on delete set null;

-- A marca do banco/gateway/cartão: é daqui que sai o "ícone do aplicativo do
-- banco" que aparece na Visão Geral e em Bancos e Gateways. Mesma dupla das
-- empresas — `logo_url` guarda o CAMINHO no bucket privado (URL assinada
-- vence), `icone` é o nome de um Tabler para quando não há imagem.
alter table public.fin_contas
  add column if not exists logo_url text,
  add column if not exists icone    text;

-- O que a pessoa TEM (fixo), separado do que ela RECEBE ou DEVE num mês.
-- Salário, gratificação e valor da hora entram aqui porque valem até alguém
-- mudar; vale, falta, farmácia e mercadinho NÃO entram — esses mudam todo mês,
-- e uma coluna que nunca zera transformaria o desconto de julho em desconto
-- eterno. Eles moram em `fin_folha_lancamentos`, logo abaixo.
--
-- `conta_id` é a conta DA EMPRESA que paga esta pessoa (não a conta dela): é o
-- que permite prever a saída na conta certa. Os dados bancários DELA são texto
-- solto de propósito — banco de terceiro não vira cadastro nosso.
alter table public.fin_colaboradores
  add column if not exists gratificacao  numeric(14,2) not null default 0,
  add column if not exists valor_hora    numeric(14,2) not null default 0,
  add column if not exists conta_id      uuid references public.fin_contas(id) on delete set null,
  add column if not exists banco         text,
  add column if not exists agencia       text,
  add column if not exists conta_numero  text,
  add column if not exists pix_tipo      text,
  add column if not exists pix_chave     text,
  add column if not exists whatsapp      text,
  add column if not exists logo_url      text,
  add column if not exists icone         text;

-- ── 3. Recorrências ──────────────────────────────────────────────────────────

create table if not exists public.fin_recorrencias (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.fin_empresas(id) on delete restrict,
  descricao      text not null,
  categoria      text,
  valor          numeric(14,2) not null default 0,
  periodicidade  text not null default 'mensal'
                 check (periodicidade in ('mensal', 'bimestral', 'trimestral', 'semestral', 'anual', 'customizada')),
  intervalo_meses int not null default 1 check (intervalo_meses between 1 and 60),
  dia_vencimento int not null default 1 check (dia_vencimento between 1 and 31),
  conta_id       uuid references public.fin_contas(id) on delete set null,
  fornecedor_id  uuid references public.fin_fornecedores(id) on delete set null,
  inicio         date not null default current_date,
  fim            date,
  proxima_competencia date,          -- 1º dia do mês da próxima geração
  status         text not null default 'ativa' check (status in ('ativa', 'pausada', 'encerrada')),
  observacao     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index if not exists fin_recorrencias_empresa on public.fin_recorrencias (empresa_id, status);

-- ── 4. Compras ───────────────────────────────────────────────────────────────
-- A compra é o FATO COMERCIAL. O pagamento dela não mora aqui: vira compromisso
-- (§21). O nome é `fin_compras` porque `compras` já existe neste banco, com
-- outro dono e outro significado (recebimento de material do estoque).

create table if not exists public.fin_compras (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.fin_empresas(id) on delete restrict,
  fornecedor_id uuid references public.fin_fornecedores(id) on delete set null,
  descricao     text not null,
  data          date not null default current_date,
  categoria     text not null default 'outros',
  valor_total   numeric(14,2) not null default 0,
  plano         text not null default 'a_vista' check (plano in ('a_vista', 'prazo', 'parcelado', 'customizado')),
  parcelas      int not null default 1 check (parcelas between 1 and 120),
  prazo_dias    int,                                   -- plano "prazo": 30, 45…
  primeiro_vencimento date,
  forma_pagamento text,
  conta_id      uuid references public.fin_contas(id) on delete set null,
  status        text not null default 'rascunho' check (status in ('rascunho', 'confirmada', 'recebida', 'cancelada')),
  gera_patrimonio boolean not null default false,
  observacao    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid,
  deleted_at timestamptz
);
create index if not exists fin_compras_empresa on public.fin_compras (empresa_id, data desc);
create index if not exists fin_compras_status  on public.fin_compras (empresa_id, status);

create table if not exists public.fin_compra_itens (
  id         uuid primary key default gen_random_uuid(),
  compra_id  uuid not null references public.fin_compras(id) on delete cascade,
  descricao  text not null,
  quantidade numeric(14,3) not null default 1,
  unidade    text,
  valor_unitario numeric(14,2) not null default 0,
  categoria  text,
  ordem      int not null default 0
);
create index if not exists fin_compra_itens_compra on public.fin_compra_itens (compra_id);

-- Plano de pagamento. `unique (compra_id, numero)` é a trava de idempotência
-- do §16: reprocessar a confirmação de uma compra de 3x não cria a 4ª parcela.
create table if not exists public.fin_compra_parcelas (
  id         uuid primary key default gen_random_uuid(),
  compra_id  uuid not null references public.fin_compras(id) on delete cascade,
  numero     int not null check (numero >= 1),
  vencimento date not null,
  valor      numeric(14,2) not null default 0,
  unique (compra_id, numero)
);

-- ── 5. Compromissos ──────────────────────────────────────────────────────────
-- A agenda central de obrigações. Tudo que é "a pagar" no sistema é uma linha
-- aqui — venha de compra, de recorrência, da folha ou digitada na mão.

create table if not exists public.fin_compromissos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.fin_empresas(id) on delete restrict,
  descricao     text not null,
  categoria     text not null default 'outros',
  valor         numeric(14,2) not null default 0,
  vencimento    date not null,
  competencia   date,                                  -- 1º dia do mês de competência
  status        text not null default 'pendente'
                check (status in ('previsto', 'pendente', 'agendado', 'pago', 'atrasado', 'cancelado')),
  origem        text not null default 'manual'
                check (origem in ('manual', 'compra', 'recorrencia', 'folha', 'imposto')),
  origem_id     uuid,                                  -- compra_id / recorrencia_id / colaborador_id
  parcela_numero int,
  parcela_total  int,
  conta_id      uuid references public.fin_contas(id) on delete set null,
  fornecedor_id uuid references public.fin_fornecedores(id) on delete set null,
  colaborador_id uuid references public.fin_colaboradores(id) on delete set null,
  pago_em       timestamptz,
  pago_valor    numeric(14,2),
  -- Chave de idempotência (§16). Duas fontes automáticas montam a sua:
  --   compra      → 'compra:<compra_id>:<numero da parcela>'
  --   recorrência → 'rec:<recorrencia_id>:<AAAA-MM da competência>'
  -- O índice único abaixo é o que faz clique duplo, retry de timeout e job
  -- reexecutado terminarem no MESMO estado — sem duplicar a obrigação.
  idempotency_key text,
  observacao    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
-- TOTAL, sem `where`: `on conflict (empresa_id, idempotency_key)` do PostgREST não
-- enxerga índice parcial (ver financeiro_indice_total.sql). NULL não colide.
create unique index if not exists fin_compromissos_idem
  on public.fin_compromissos (empresa_id, idempotency_key);
create index if not exists fin_compromissos_agenda
  on public.fin_compromissos (empresa_id, vencimento, status);
create index if not exists fin_compromissos_origem
  on public.fin_compromissos (empresa_id, origem, origem_id);

-- ── 6. Movimentos financeiros ────────────────────────────────────────────────
-- O dinheiro que de fato entrou ou saiu. `valor` é COM SINAL (negativo = saída),
-- para o saldo ser uma soma e não um `case` espalhado por cada consulta.
--
-- Movimento confirmado é IMUTÁVEL (§19): corrigir é lançar a reversão, que
-- aponta para o original em `reverte_id`. Apagar a linha apagaria o extrato.

create table if not exists public.fin_movimentos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.fin_empresas(id) on delete restrict,
  conta_id      uuid not null references public.fin_contas(id) on delete restrict,
  tipo          text not null default 'saida'
                check (tipo in ('entrada', 'saida', 'transferencia', 'ajuste', 'reversao')),
  valor         numeric(14,2) not null,
  descricao     text not null default '',
  compromisso_id uuid references public.fin_compromissos(id) on delete set null,
  transfer_group_id uuid,                             -- as duas pernas da transferência
  reverte_id    uuid references public.fin_movimentos(id) on delete set null,
  ocorrido_em   timestamptz not null default now(),
  status        text not null default 'confirmado' check (status in ('confirmado', 'revertido')),
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
-- TOTAL, sem `where`: `on conflict (empresa_id, idempotency_key)` do PostgREST não
-- enxerga índice parcial (ver financeiro_indice_total.sql). NULL não colide.
create unique index if not exists fin_movimentos_idem
  on public.fin_movimentos (empresa_id, idempotency_key);
create index if not exists fin_movimentos_extrato
  on public.fin_movimentos (empresa_id, conta_id, ocorrido_em desc);

-- ── 7. Notas fiscais ─────────────────────────────────────────────────────────

create table if not exists public.fin_notas (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.fin_empresas(id) on delete restrict,
  tipo          text not null default 'compra' check (tipo in ('emitida', 'compra')),
  numero        text,
  serie         text,
  parceiro_nome text,                                  -- cliente (emitida) ou fornecedor (compra)
  fornecedor_id uuid references public.fin_fornecedores(id) on delete set null,
  compra_id     uuid references public.fin_compras(id) on delete set null,
  chave_acesso  text,
  emissao       date not null default current_date,
  valor         numeric(14,2) not null default 0,
  categoria     text,
  status        text not null default 'autorizada'
                check (status in ('pendente', 'autorizada', 'cancelada', 'rejeitada')),
  xml_url       text,
  pdf_url       text,
  observacao    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create unique index if not exists fin_notas_chave
  on public.fin_notas (empresa_id, chave_acesso) where chave_acesso is not null;
create index if not exists fin_notas_empresa on public.fin_notas (empresa_id, emissao desc);
create index if not exists fin_notas_compra  on public.fin_notas (compra_id);

-- ── 8. Patrimônio ────────────────────────────────────────────────────────────
-- Registro gerencial do bem. NÃO cria despesa (§21): o custo já foi contado na
-- compra que o originou. Contar de novo aqui dobraria a saída no dashboard.

create table if not exists public.fin_patrimonio (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.fin_empresas(id) on delete restrict,
  codigo        text not null,
  descricao     text not null,
  categoria     text not null default 'outros',
  local         text,
  responsavel_id uuid references public.fin_colaboradores(id) on delete set null,
  fornecedor_id uuid references public.fin_fornecedores(id) on delete set null,
  compra_id     uuid references public.fin_compras(id) on delete set null,
  nota_id       uuid references public.fin_notas(id) on delete set null,
  valor         numeric(14,2) not null default 0,
  aquisicao     date,
  garantia_ate  date,
  status        text not null default 'em_uso'
                check (status in ('em_uso', 'estoque', 'manutencao', 'baixado', 'vendido')),
  observacao    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create unique index if not exists fin_patrimonio_codigo on public.fin_patrimonio (empresa_id, codigo);
create index if not exists fin_patrimonio_empresa on public.fin_patrimonio (empresa_id, status);

-- Bem que NASCE de uma compra marcada como patrimônio (§7) carrega a mesma
-- trava do resto do módulo: chave determinística `compra:<id>` + índice único.
-- Sem ela, reprocessar a confirmação da compra criaria um segundo registro do
-- MESMO bem — e aí o total do patrimônio passa a contar duas vezes o que
-- existe uma vez só. Bem cadastrado à mão fica com a chave nula e não conflita.
alter table public.fin_patrimonio
  add column if not exists idempotency_key text;
-- TOTAL, sem `where`: `on conflict (empresa_id, idempotency_key)` do PostgREST não
-- enxerga índice parcial (ver financeiro_indice_total.sql). NULL não colide.
create unique index if not exists fin_patrimonio_idem
  on public.fin_patrimonio (empresa_id, idempotency_key);

-- ── 9. Anexos e auditoria ────────────────────────────────────────────────────

create table if not exists public.fin_anexos (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.fin_empresas(id) on delete restrict,
  owner_tipo text not null,                            -- 'compra' | 'nota' | 'compromisso' | 'patrimonio'
  owner_id   uuid not null,
  nome       text not null,
  url        text not null,
  mime       text,
  tamanho    bigint,
  created_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists fin_anexos_owner on public.fin_anexos (owner_tipo, owner_id);

-- O CAMINHO no bucket, não a URL pública.
--
-- `url` nasceu aqui pensando no padrão do resto do app, que grava em bucket
-- PÚBLICO e guarda o link pronto. Comprovante de pagamento e XML de nota não
-- podem viver assim: quem descobre o link abre o arquivo, para sempre, sem
-- sessão e sem permissão. O §17 pede anexo privado e autorizado por empresa.
--
-- Então o que fica guardado é o caminho, e o link é assinado na hora, com
-- validade curta, por quem tem a área e a empresa. `url` continua para o que
-- já existir, e nasce vazio de agora em diante.
alter table public.fin_anexos
  add column if not exists caminho text;
alter table public.fin_anexos
  alter column url drop not null;
create index if not exists fin_anexos_empresa on public.fin_anexos (empresa_id, created_at desc);

-- O bucket PRIVADO onde os arquivos moram.
--
-- `public = false` e ZERO políticas: mesma lógica do RLS das tabelas. Só o
-- `service_role` (o app) sobe e assina; a chave `anon`, que vive no navegador,
-- não lista e não baixa. Quem pede o arquivo passa por `/api/financeiro/anexos`,
-- que confere a área e a empresa antes de assinar.
--
-- O `if` existe porque este arquivo também roda contra um Postgres cru nos
-- testes (PGlite), onde o schema `storage` do Supabase não existe. Sem a
-- guarda, o arquivo inteiro pararia ali.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('financeiro', 'financeiro', false)
    on conflict (id) do nothing;
  end if;
end $$;

create table if not exists public.fin_auditoria (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid references public.fin_empresas(id) on delete set null,
  entidade    text not null,
  entidade_id uuid,
  acao        text not null,
  dados       jsonb,
  user_id     uuid,
  user_nome   text,
  created_at  timestamptz not null default now()
);
create index if not exists fin_auditoria_linha  on public.fin_auditoria (entidade, entidade_id, created_at desc);
create index if not exists fin_auditoria_empresa on public.fin_auditoria (empresa_id, created_at desc);

-- ── 10. Gatilhos ─────────────────────────────────────────────────────────────
-- `drop … if exists` antes de cada `create` porque o Postgres não tem
-- `create or replace trigger`: sem isso a segunda execução do arquivo pararia
-- em "trigger already exists", e a segunda execução é o caso real.

do $$
declare t text;
begin
  foreach t in array array[
    'fin_empresas','fin_fornecedores','fin_contatos','fin_colaboradores','fin_contas','fin_recorrencias',
    'fin_compras','fin_compromissos','fin_movimentos','fin_notas','fin_patrimonio','fin_folha_lancamentos'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.fin_touch()',
      t || '_touch', t);
  end loop;
end $$;

drop trigger if exists fin_compras_empresa_ok on public.fin_compras;
create trigger fin_compras_empresa_ok before insert or update on public.fin_compras
  for each row execute function public.fin_confere_empresa('fornecedor_id,fin_fornecedores', 'conta_id,fin_contas');

drop trigger if exists fin_recorrencias_empresa_ok on public.fin_recorrencias;
create trigger fin_recorrencias_empresa_ok before insert or update on public.fin_recorrencias
  for each row execute function public.fin_confere_empresa('fornecedor_id,fin_fornecedores', 'conta_id,fin_contas');

drop trigger if exists fin_compromissos_empresa_ok on public.fin_compromissos;
create trigger fin_compromissos_empresa_ok before insert or update on public.fin_compromissos
  for each row execute function public.fin_confere_empresa(
    'fornecedor_id,fin_fornecedores', 'conta_id,fin_contas', 'colaborador_id,fin_colaboradores');

drop trigger if exists fin_colaboradores_empresa_ok on public.fin_colaboradores;
create trigger fin_colaboradores_empresa_ok before insert or update on public.fin_colaboradores
  for each row execute function public.fin_confere_empresa('conta_id,fin_contas');

drop trigger if exists fin_folha_lanc_empresa_ok on public.fin_folha_lancamentos;
create trigger fin_folha_lanc_empresa_ok before insert or update on public.fin_folha_lancamentos
  for each row execute function public.fin_confere_empresa('colaborador_id,fin_colaboradores');

drop trigger if exists fin_contas_empresa_ok on public.fin_contas;
create trigger fin_contas_empresa_ok before insert or update on public.fin_contas
  for each row execute function public.fin_confere_empresa('responsavel_id,fin_colaboradores');

drop trigger if exists fin_movimentos_empresa_ok on public.fin_movimentos;
create trigger fin_movimentos_empresa_ok before insert or update on public.fin_movimentos
  for each row execute function public.fin_confere_empresa('conta_id,fin_contas', 'compromisso_id,fin_compromissos');

drop trigger if exists fin_notas_empresa_ok on public.fin_notas;
create trigger fin_notas_empresa_ok before insert or update on public.fin_notas
  for each row execute function public.fin_confere_empresa('fornecedor_id,fin_fornecedores', 'compra_id,fin_compras');

drop trigger if exists fin_patrimonio_empresa_ok on public.fin_patrimonio;
create trigger fin_patrimonio_empresa_ok before insert or update on public.fin_patrimonio
  for each row execute function public.fin_confere_empresa(
    'fornecedor_id,fin_fornecedores', 'compra_id,fin_compras', 'nota_id,fin_notas', 'responsavel_id,fin_colaboradores');

-- Movimento CONFIRMADO é imutável (§19). O único campo que pode mudar é o
-- `status`, indo para 'revertido' — o resto é história e história não se
-- reescreve. Sem esta trava, "corrigir o valor" viraria o caminho natural e o
-- extrato deixaria de bater com a conta.
create or replace function public.fin_movimento_imutavel() returns trigger language plpgsql as $$
begin
  if old.status = 'confirmado' and (
       new.valor is distinct from old.valor
    or new.conta_id is distinct from old.conta_id
    or new.empresa_id is distinct from old.empresa_id
    or new.ocorrido_em is distinct from old.ocorrido_em
    or new.tipo is distinct from old.tipo
  ) then
    raise exception 'financeiro: movimento confirmado é imutável — lance uma reversão'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists fin_movimentos_imutavel on public.fin_movimentos;
create trigger fin_movimentos_imutavel before update on public.fin_movimentos
  for each row execute function public.fin_movimento_imutavel();

-- ── 11. Saldo das contas ─────────────────────────────────────────────────────
-- Saldo = saldo_inicial + soma dos movimentos CONFIRMADOS. Uma view, não uma
-- coluna: assim não existe o estado em que a soma e o total gravado discordam.

-- O `drop` antes do `create` NÃO é zelo: sem ele este arquivo deixa de ser
-- re-rodável na primeira vez que uma coluna nova entra no meio da lista.
-- `create or replace view` no Postgres só aceita ACRESCENTAR coluna no FIM —
-- qualquer outra mudança morre em «cannot change name of view column "saldo"
-- to "responsavel_id"». E como o SQL Editor do Supabase roda o arquivo inteiro
-- numa transação só, esse erro derruba TUDO: quem já tinha o banco de uma
-- versão anterior rodava de novo, via um erro no fim e não ganhava nenhuma das
-- colunas novas — o `alter table` lá em cima também voltava atrás.
--
-- Foi exatamente o que aconteceu: `fin_contas.responsavel_id`,
-- `fin_anexos.caminho` e `fin_patrimonio.idempotency_key` ficaram de fora, e a
-- tela de Contas passou a dizer "o banco ainda não foi criado" com o banco
-- criado do lado (a consulta pedia uma coluna que a view não tinha).
--
-- Nada depende desta view além do app, então derrubar e recriar é barato.
drop view if exists public.fin_contas_saldo;
create view public.fin_contas_saldo as
select
  c.id, c.empresa_id, c.nome, c.tipo, c.instituicao, c.cor, c.ordem,
  c.ativa, c.inclui_no_saldo, c.saldo_inicial, c.responsavel_id,
  c.saldo_inicial + coalesce(sum(m.valor) filter (where m.status = 'confirmado'), 0) as saldo
from public.fin_contas c
left join public.fin_movimentos m on m.conta_id = c.id
group by c.id;

-- ── 12. Fechadura (RLS deny-all) ─────────────────────────────────────────────
-- Ver o cabeçalho: RLS ligada e ZERO políticas. `service_role` (o app) passa;
-- `anon` e `authenticated` não leem nada. É a última linha de defesa, depois da
-- área restrita e do gate das rotas.

do $$
declare t text;
begin
  foreach t in array array[
    'fin_empresas','fin_acessos','fin_fornecedores','fin_contatos','fin_colaboradores','fin_contas',
    'fin_recorrencias','fin_compras','fin_compra_itens','fin_compra_parcelas',
    'fin_compromissos','fin_movimentos','fin_notas','fin_patrimonio','fin_anexos','fin_auditoria',
    'fin_folha_lancamentos'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Fim. Rode de novo à vontade.
