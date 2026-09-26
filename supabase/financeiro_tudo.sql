-- ═════════════════════════════════════════════════════════════════════════════
--  FINANCEIRO — TUDO, NUMA VEZ SÓ
-- ═════════════════════════════════════════════════════════════════════════════
--
--  Todos os arquivos do módulo, na ordem em que dependem uns dos outros. Serve
--  para pôr um banco em dia sem lembrar quais já rodaram: **é seguro rodar
--  inteiro mesmo com tudo já aplicado.** Nada aqui apaga dado — só cria o que
--  falta e recria gatilho, view e função, que é operação sem perda.
--
--  Gerado a partir de supabase/*.sql; se algum daqueles mudar, este precisa ser
--  gerado de novo. A trava que garante que ele ainda roda de ponta a ponta, num
--  banco vazio E num banco já cheio, é lib/__tests__/financeiro-tudo.test.ts.
--
--  Se você só quer o que FALTA, use `financeiro_pendente_agora.sql`.
--
--  ORDEM:
--     1. financeiro.sql                               Base — tabelas, índices, bucket, gatilhos de empresa cruzada
--     2. financeiro_config.sql                        Preferências por empresa
--     3. financeiro_fornecedor_completo.sql           Fornecedor: PIX, banco, prazos, endereço fiscal
--     4. financeiro_contato_banco_recorrencia.sql     Contato, marca dos bancos e campos novos da recorrência
--     5. financeiro_contato_empresa.sql               Contato pode ser empresa; recorrência e compromisso apontam para contato
--     6. financeiro_cadastro_unificado.sql            Diretório único (papéis, CNPJ) e a função fin_salvar_parte
--     7. financeiro_compromisso_recorrente.sql        Compromisso gerado por recorrência, com chave de idempotência
--     8. financeiro_view_conta_marca.sql              A view de saldo devolve a marca da conta
--     9. financeiro_patrimonio_foto.sql               Foto do bem
--    10. financeiro_recorrencia_variavel.sql          Recorrência de valor variável
--    11. financeiro_folha_mensal.sql                   Folha mensal — salário por mês, pago, faltas com DSR
--    12. financeiro_natureza_por_uso.sql              Arruma a natureza de quem já está cadastrado
-- ═════════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║   1/11  financeiro.sql                                                  ║
-- ║       Base — tabelas, índices, bucket, gatilhos de empresa cruzada       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

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


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║   2/11  financeiro_config.sql                                           ║
-- ║       Preferências por empresa                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ═════════════════════════════════════════════════════════════════════════════
--  CONFIGURAÇÃO DO FINANCEIRO — o que antes era número fixo no código
-- ═════════════════════════════════════════════════════════════════════════════
--
--  Uma linha por empresa. Quatro coisas que cada tela decidia sozinha, com um
--  número escrito no código, e que o dono não tinha como mudar sem pedir:
--
--  · o PREFIXO do código do patrimônio ("PAT-001");
--  · quantos DIAS antes um vencimento vira "vence em breve" na Visão Geral;
--  · as FORMAS DE PAGAMENTO sugeridas (PIX, Boleto, …) — eram texto livre, e
--    "Pix", "PIX" e "pix" viravam três coisas no filtro;
--  · o DIA PADRÃO de pagamento de quem entra na folha.
--
--  Rode DEPOIS de `supabase/financeiro.sql`. Idempotente.

create table if not exists public.fin_config (
  empresa_id          uuid primary key references public.fin_empresas(id) on delete cascade,
  patrimonio_prefixo  text not null default 'PAT',
  alerta_dias         int  not null default 7  check (alerta_dias between 1 and 90),
  formas_pagamento    text[] not null default array['PIX', 'Boleto', 'Cartão', 'Transferência', 'Dinheiro'],
  folha_dia_padrao    int  not null default 5  check (folha_dia_padrao between 1 and 31),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Toda empresa nasce com a linha: a tela lê com `maybeSingle` e cai nos
-- padrões se não houver, mas ter a linha desde já faz o primeiro "salvar" ser
-- um UPDATE comum — sem o caso especial de "ainda não existe".
insert into public.fin_config (empresa_id)
select id from public.fin_empresas
on conflict (empresa_id) do nothing;

drop trigger if exists fin_config_touch on public.fin_config;
create trigger fin_config_touch before update on public.fin_config
  for each row execute function public.fin_touch();

alter table public.fin_config enable row level security;

-- ── Conferência ──────────────────────────────────────────────────────────────
select e.nome, c.patrimonio_prefixo, c.alerta_dias, c.folha_dia_padrao, c.formas_pagamento
  from public.fin_empresas e
  left join public.fin_config c on c.empresa_id = e.id
 order by e.ordem;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║   3/11  financeiro_fornecedor_completo.sql                              ║
-- ║       Fornecedor: PIX, banco, prazos, endereço fiscal                    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ═════════════════════════════════════════════════════════════════════════════
--  FORNECEDOR COMPLETO — como se paga, como se fala, e mais de uma categoria
-- ═════════════════════════════════════════════════════════════════════════════
--
--  O cadastro tinha nome, CNPJ, uma categoria e um contato. Na prática falta
--  tudo o que se procura na hora de comprar ou de pagar: a chave PIX, a conta
--  para depósito, o WhatsApp de quem atende, quanto tempo a mercadoria demora
--  a chegar, e de onde ela vem.
--
--  Duas mudanças merecem explicação:
--
--  · CATEGORIA vira CATEGORIAS. Um fornecedor de MDF que também vende cola não
--    cabia em uma palavra só, e quem cadastrava escolhia a "mais certa" — o que
--    faz o outro filtro deixá-lo de fora. A coluna antiga CONTINUA existindo e
--    é preenchida com a primeira das novas: telas e consultas que ainda leem
--    `categoria` não quebram no dia do deploy.
--
--  · As categorias ganham CADASTRO (`fin_categorias`). Antes elas eram texto
--    solto, e o filtro mostrava o que estivesse escrito — inclusive "Matéria
--    Prima" e "materia prima" como duas coisas. O cadastro nasce PREENCHIDO com
--    o que já está em uso, então ninguém precisa recadastrar nada.
--
--  Idempotente: rode quantas vezes quiser.
--  Rode DEPOIS de `supabase/financeiro.sql`.

-- ── 1. Colunas novas do fornecedor ───────────────────────────────────────────

alter table public.fin_fornecedores
  -- Mais de uma categoria. `text[]` e não tabela de ligação: categoria aqui é
  -- rótulo de filtro, não entidade com regra — uma tabela a mais custaria um
  -- join em toda listagem para guardar duas palavras.
  add column if not exists categorias     text[],
  -- Como se paga
  add column if not exists pix_tipo        text,
  add column if not exists pix_chave       text,
  add column if not exists banco           text,
  add column if not exists agencia         text,
  add column if not exists conta_numero    text,
  add column if not exists aceita_boleto   boolean not null default false,
  -- Quem é e onde fica
  add column if not exists inscricao_estadual text,
  add column if not exists site            text,
  add column if not exists whatsapp        text,
  add column if not exists cidade          text,
  add column if not exists uf              text,
  add column if not exists endereco        text,
  -- Quanto tempo a mercadoria demora. NÃO confundir com `prazo_dias`, que é o
  -- prazo de PAGAMENTO: um é quando o material chega, o outro é quando o
  -- dinheiro sai, e trocá-los faz a compra ser planejada ao contrário.
  add column if not exists prazo_envio_dias int;

-- A primeira carga: quem tem `categoria` preenchida e `categorias` vazia ganha
-- o array com aquele valor. `where categorias is null` faz disto uma migração
-- de uma vez só — rodar de novo não desfaz o que alguém editou na tela depois.
update public.fin_fornecedores
   set categorias = array[categoria]
 where categorias is null
   and coalesce(btrim(categoria), '') <> '';

-- ── 2. Categoria vira cadastro ───────────────────────────────────────────────
--
-- `escopo` porque contato também categoriza ("encanador", "eletricista") e o
-- vocabulário dele não é o mesmo do fornecedor. Uma tabela com escopo evita
-- duas tabelas iguais que vão divergir.

create table if not exists public.fin_categorias (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.fin_empresas(id) on delete restrict,
  escopo     text not null check (escopo in ('fornecedor', 'contato')),
  nome       text not null,
  cor        text,
  ordem      int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

-- Único por NOME NORMALIZADO, não pelo texto cru: sem isto "Matéria Prima" e
-- "matéria prima" entram como duas categorias e o filtro passa a ter duas
-- linhas para a mesma coisa — que é o defeito que este cadastro veio resolver.
create unique index if not exists fin_categorias_nome
  on public.fin_categorias (empresa_id, escopo, lower(btrim(nome)));

create index if not exists fin_categorias_lista
  on public.fin_categorias (empresa_id, escopo, ordem, nome);

-- ── 3. O cadastro nasce com o que já está em uso ─────────────────────────────
--
-- Cadastro novo e vazio faria a tela pedir para recadastrar categoria que já
-- existe no dado. `on conflict do nothing` deixa isto re-rodável.

insert into public.fin_categorias (empresa_id, escopo, nome)
select distinct f.empresa_id, 'fornecedor', btrim(f.categoria)
  from public.fin_fornecedores f
 where coalesce(btrim(f.categoria), '') <> ''
   and f.deleted_at is null
on conflict do nothing;

insert into public.fin_categorias (empresa_id, escopo, nome)
select distinct c.empresa_id, 'contato', btrim(c.categoria)
  from public.fin_contatos c
 where coalesce(btrim(c.categoria), '') <> ''
   and c.deleted_at is null
on conflict do nothing;

-- ── 4. Gatilho de updated_at e a fechadura ───────────────────────────────────

drop trigger if exists fin_categorias_touch on public.fin_categorias;
create trigger fin_categorias_touch before update on public.fin_categorias
  for each row execute function public.fin_touch();

alter table public.fin_categorias enable row level security;

-- ── Conferência ──────────────────────────────────────────────────────────────
select
  (select count(*) from public.fin_categorias where escopo = 'fornecedor') as categorias_de_fornecedor,
  (select count(*) from public.fin_categorias where escopo = 'contato')    as categorias_de_contato,
  (select count(*) from public.fin_fornecedores where categorias is not null) as fornecedores_com_array;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║   4/11  financeiro_contato_banco_recorrencia.sql                        ║
-- ║       Contato, marca dos bancos e campos novos da recorrência            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

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


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║   5/11  financeiro_contato_empresa.sql                                  ║
-- ║       Contato pode ser empresa; recorrência e compromisso apontam para contato║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

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


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║   6/11  financeiro_cadastro_unificado.sql                               ║
-- ║       Diretório único (papéis, CNPJ) e a função fin_salvar_parte         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ═════════════════════════════════════════════════════════════════════════════
--  CADASTRO FINANCEIRO UNIFICADO — identidade canônica e extensão comercial
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Rode depois de `financeiro.sql`, `financeiro_fornecedor_completo.sql`,
-- `financeiro_contato_banco_recorrencia.sql` e
-- `financeiro_contato_empresa.sql`. É idempotente: fornecedores e seus IDs
-- legados continuam existindo, mas passam a apontar para a identidade em
-- `fin_contatos`.

-- ── 1. A identidade e a extensão ────────────────────────────────────────────

alter table public.fin_contatos
  add column if not exists papeis text[] not null default array['contato']::text[],
  add column if not exists cnpj text;

alter table public.fin_fornecedores
  add column if not exists contato_id uuid references public.fin_contatos(id) on delete restrict;

-- O CNPJ é armazenado somente em dígitos. Assim a trava vale igualmente para
-- `12.345.678/0001-99` e `12345678000199`; a tela é quem o formata.
update public.fin_contatos
   set cnpj = nullif(regexp_replace(cnpj, '[^0-9]', '', 'g'), '')
 where cnpj is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.fin_contatos'::regclass
       and conname = 'fin_contatos_papeis_validos'
  ) then
    alter table public.fin_contatos add constraint fin_contatos_papeis_validos
      check (
        array_position(papeis, null) is null
        and papeis <@ array['contato', 'fornecedor', 'cliente', 'parceiro', 'prestador', 'outro']::text[]
      );
  end if;
end $$;

-- `natureza` já existia sem domínio fechado. Corrigir valores legados antes de
-- travar a coluna mantém a migração reaplicável e faz a invariável valer também
-- para escrita direta, não só para a RPC.
update public.fin_contatos
   set natureza = 'pessoa'
 where natureza not in ('pessoa', 'empresa');

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.fin_contatos'::regclass
       and conname = 'fin_contatos_natureza_valida'
  ) then
    alter table public.fin_contatos add constraint fin_contatos_natureza_valida
      check (natureza in ('pessoa', 'empresa'));
  end if;
end $$;

create unique index if not exists fin_fornecedores_contato
  on public.fin_fornecedores(contato_id) where contato_id is not null;

create unique index if not exists fin_contatos_cnpj on public.fin_contatos(empresa_id, cnpj)
  where cnpj is not null and deleted_at is null;

-- ── 2. Backfill sem adivinhação por nome ────────────────────────────────────
--
-- Só CNPJ normalizado identifica uma identidade existente. Nome, telefone e
-- similaridade nunca participam da decisão: dois "Atlas" podem ser empresas
-- distintas. Sem CNPJ, cada fornecedor recebe sua própria identidade.
do $$
declare
  f record;
  v_contato_id uuid;
  v_cnpj text;
begin
  for f in
    select * from public.fin_fornecedores where contato_id is null order by created_at, id
  loop
    v_contato_id := null;
    v_cnpj := nullif(regexp_replace(coalesce(f.cnpj, ''), '[^0-9]', '', 'g'), '');

    -- Um contato com aquele CNPJ só pode servir quando ainda não é extensão de
    -- outro fornecedor: a extensão é 1:1 para preservar todas as FKs legadas.
    if v_cnpj is not null then
      select c.id into v_contato_id
        from public.fin_contatos c
       where c.empresa_id = f.empresa_id
         and c.cnpj = v_cnpj
         and c.deleted_at is null
         and not exists (
           select 1 from public.fin_fornecedores ja
            where ja.contato_id = c.id and ja.id <> f.id
         )
       order by c.created_at, c.id
       limit 1;
    end if;

    if v_contato_id is null then
      begin
        insert into public.fin_contatos (
          empresa_id, nome, cnpj, papeis, categoria, categorias, telefone,
          telefones, email, endereco, observacao, site, logo_url, icone,
          ativo, created_by, updated_by
        ) values (
          f.empresa_id, f.nome, v_cnpj, array['fornecedor']::text[],
          f.categoria, f.categorias, coalesce(f.contato_fone, f.whatsapp),
          case when coalesce(f.contato_fone, f.whatsapp) is not null
               then array[coalesce(f.contato_fone, f.whatsapp)] end,
          f.contato_email, f.endereco, f.observacao, f.site, f.logo_url, f.icone,
          f.ativo, f.created_by, f.updated_by
        ) returning id into v_contato_id;
      exception when unique_violation then
        -- Um banco antigo pode ter dois fornecedores com o mesmo CNPJ em
        -- formatos diferentes. Mantemos ambos e seus históricos, mas não
        -- inventamos uma fusão; o segundo fica sem CNPJ canônico até revisão.
        insert into public.fin_contatos (
          empresa_id, nome, papeis, categoria, categorias, telefone, telefones,
          email, endereco, observacao, site, logo_url, icone, ativo, created_by, updated_by
        ) values (
          f.empresa_id, f.nome, array['fornecedor']::text[], f.categoria,
          f.categorias, coalesce(f.contato_fone, f.whatsapp),
          case when coalesce(f.contato_fone, f.whatsapp) is not null
               then array[coalesce(f.contato_fone, f.whatsapp)] end,
          f.contato_email, f.endereco, f.observacao, f.site, f.logo_url, f.icone,
          f.ativo, f.created_by, f.updated_by
        ) returning id into v_contato_id;
      end;
    else
      -- Nunca sobrescrevemos uma ficha canônica com dado legado. Só incluímos
      -- o papel que torna explícita a extensão que acabamos de ligar.
      update public.fin_contatos c
         set papeis = case when 'fornecedor' = any(c.papeis) then c.papeis
                           else array_append(c.papeis, 'fornecedor') end
       where c.id = v_contato_id;
    end if;

    update public.fin_fornecedores set contato_id = v_contato_id where id = f.id;
  end loop;
end $$;

-- ── 3. Escrita atômica da ficha e da extensão ───────────────────────────────
--
-- `p_entrada` é plano de propósito: a rota valida o payload de UI e a RPC
-- aplica uma única transação. Campos comuns moram na raiz; os comerciais em
-- `fornecedor`. Exemplo mínimo:
-- { empresa_id, nome, natureza, papeis, cnpj, fornecedor: { prazo_dias } }
create or replace function public.fin_salvar_parte(p_entrada jsonb, p_user_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_empresa_id uuid := nullif(p_entrada ->> 'empresa_id', '')::uuid;
  v_contato_id uuid := nullif(p_entrada ->> 'id', '')::uuid;
  v_fornecedor_id uuid := coalesce(
    nullif(p_entrada ->> 'fornecedor_id', '')::uuid,
    nullif(p_entrada -> 'fornecedor' ->> 'id', '')::uuid
  );
  v_fornecedor jsonb := coalesce(p_entrada -> 'fornecedor', '{}'::jsonb);
  v_nome text := nullif(btrim(coalesce(p_entrada ->> 'nome', '')), '');
  v_natureza text := coalesce(nullif(p_entrada ->> 'natureza', ''), 'pessoa');
  v_cnpj text := nullif(regexp_replace(coalesce(nullif(p_entrada ->> 'cnpj', ''), nullif(v_fornecedor ->> 'cnpj', ''), ''), '[^0-9]', '', 'g'), '');
  v_categoria text := coalesce(
    nullif(btrim(coalesce(p_entrada ->> 'categoria', '')), ''),
    nullif(btrim(coalesce(p_entrada -> 'categorias' ->> 0, '')), ''),
    nullif(btrim(coalesce(v_fornecedor ->> 'categoria', '')), '')
  );
  v_categorias text[];
  v_telefone text := coalesce(
    nullif(btrim(coalesce(p_entrada ->> 'telefone', '')), ''),
    nullif(btrim(coalesce(p_entrada -> 'telefones' ->> 0, '')), ''),
    nullif(btrim(coalesce(v_fornecedor ->> 'contato_fone', '')), '')
  );
  v_email text := coalesce(nullif(btrim(coalesce(p_entrada ->> 'email', '')), ''), nullif(btrim(coalesce(v_fornecedor ->> 'contato_email', '')), ''));
  v_endereco text := coalesce(nullif(btrim(coalesce(p_entrada ->> 'endereco', '')), ''), nullif(btrim(coalesce(v_fornecedor ->> 'endereco', '')), ''));
  v_observacao text := coalesce(nullif(btrim(coalesce(p_entrada ->> 'observacao', '')), ''), nullif(btrim(coalesce(v_fornecedor ->> 'observacao', '')), ''));
  v_site text := coalesce(nullif(btrim(coalesce(p_entrada ->> 'site', '')), ''), nullif(btrim(coalesce(v_fornecedor ->> 'site', '')), ''));
  v_logo_url text := coalesce(nullif(btrim(coalesce(p_entrada ->> 'logo_url', '')), ''), nullif(btrim(coalesce(v_fornecedor ->> 'logo_url', '')), ''));
  v_icone text := coalesce(nullif(btrim(coalesce(p_entrada ->> 'icone', '')), ''), nullif(btrim(coalesce(v_fornecedor ->> 'icone', '')), ''));
  v_ativo boolean;
  v_papeis text[];
  v_empresa_fornecedor uuid;
  v_fornecedor_atual uuid;
begin
  if v_empresa_id is null then
    raise exception 'financeiro: empresa_id é obrigatório' using errcode = 'not_null_violation';
  end if;
  if v_nome is null then
    raise exception 'financeiro: nome é obrigatório' using errcode = 'not_null_violation';
  end if;
  if v_natureza not in ('pessoa', 'empresa') then
    raise exception 'financeiro: natureza inválida' using errcode = 'check_violation';
  end if;

  if p_entrada ? 'papeis' then
    select coalesce(array_agg(papel), array[]::text[]) into v_papeis
      from jsonb_array_elements_text(p_entrada -> 'papeis') as papel;
  else
    v_papeis := array['contato']::text[];
  end if;

  if array_position(v_papeis, null) is not null
     or not (v_papeis <@ array['contato', 'fornecedor', 'cliente', 'parceiro', 'prestador', 'outro']::text[])
  then
    raise exception 'financeiro: papéis inválidos' using errcode = 'check_violation';
  end if;

  if nullif(p_entrada ->> 'organizacao_id', '') is not null and not exists (
    select 1 from public.fin_contatos organizacao
     where organizacao.id = (p_entrada ->> 'organizacao_id')::uuid
       and organizacao.empresa_id = v_empresa_id
  ) then
    raise exception 'financeiro: organização aponta para outra empresa' using errcode = 'check_violation';
  end if;

  if v_contato_id is null then
    insert into public.fin_contatos (
      empresa_id, nome, natureza, papeis, cnpj, categoria, categorias,
      telefone, telefones, email, endereco, observacao, organizacao, cargo,
      organizacao_id, site,
      logo_url, icone, ativo, created_by, updated_by
    ) values (
      v_empresa_id, v_nome, v_natureza, v_papeis, v_cnpj,
      v_categoria,
      case when p_entrada ? 'categorias' then array(select jsonb_array_elements_text(p_entrada -> 'categorias')) end,
      v_telefone,
      case when p_entrada ? 'telefones' then array(select jsonb_array_elements_text(p_entrada -> 'telefones')) end,
      v_email, v_endereco, v_observacao,
      nullif(btrim(coalesce(p_entrada ->> 'organizacao', '')), ''),
      nullif(btrim(coalesce(p_entrada ->> 'cargo', '')), ''),
      nullif(p_entrada ->> 'organizacao_id', '')::uuid,
      v_site, v_logo_url, v_icone,
      coalesce((p_entrada ->> 'ativo')::boolean, true), p_user_id, p_user_id
    ) returning id into v_contato_id;
  else
    update public.fin_contatos c
       set nome = v_nome,
           natureza = v_natureza,
           papeis = v_papeis,
           cnpj = case when p_entrada ? 'cnpj' or v_fornecedor ? 'cnpj' then v_cnpj else c.cnpj end,
           categoria = case when p_entrada ? 'categoria' or p_entrada ? 'categorias' or v_fornecedor ? 'categoria' then v_categoria else c.categoria end,
           categorias = case when p_entrada ? 'categorias' then array(select jsonb_array_elements_text(p_entrada -> 'categorias')) else c.categorias end,
           telefone = case when p_entrada ? 'telefone' or p_entrada ? 'telefones' or v_fornecedor ? 'contato_fone' then v_telefone else c.telefone end,
           telefones = case when p_entrada ? 'telefones' then array(select jsonb_array_elements_text(p_entrada -> 'telefones')) else c.telefones end,
           email = case when p_entrada ? 'email' or v_fornecedor ? 'contato_email' then v_email else c.email end,
           endereco = case when p_entrada ? 'endereco' or v_fornecedor ? 'endereco' then v_endereco else c.endereco end,
           observacao = case when p_entrada ? 'observacao' or v_fornecedor ? 'observacao' then v_observacao else c.observacao end,
           organizacao = case when p_entrada ? 'organizacao' then nullif(btrim(coalesce(p_entrada ->> 'organizacao', '')), '') else c.organizacao end,
           cargo = case when p_entrada ? 'cargo' then nullif(btrim(coalesce(p_entrada ->> 'cargo', '')), '') else c.cargo end,
           organizacao_id = case when p_entrada ? 'organizacao_id' then nullif(p_entrada ->> 'organizacao_id', '')::uuid else c.organizacao_id end,
           site = case when p_entrada ? 'site' or v_fornecedor ? 'site' then v_site else c.site end,
           logo_url = case when p_entrada ? 'logo_url' or v_fornecedor ? 'logo_url' then v_logo_url else c.logo_url end,
           icone = case when p_entrada ? 'icone' or v_fornecedor ? 'icone' then v_icone else c.icone end,
           ativo = case when p_entrada ? 'ativo' then coalesce((p_entrada ->> 'ativo')::boolean, true) else c.ativo end,
           updated_by = p_user_id
     where c.id = v_contato_id and c.empresa_id = v_empresa_id;
    if not found then
      raise exception 'financeiro: contato não pertence à empresa' using errcode = 'check_violation';
    end if;
  end if;

  -- A identidade é a fonte de verdade. As colunas duplicadas do fornecedor
  -- permanecem sincronizadas apenas para consumidores legados durante a transição.
  select coalesce(c.categoria, c.categorias[1]), c.categorias,
         coalesce(c.telefone, c.telefones[1]), c.email,
         c.endereco, c.observacao, c.site, c.ativo
    into v_categoria, v_categorias, v_telefone, v_email,
         v_endereco, v_observacao, v_site, v_ativo
    from public.fin_contatos c where c.id = v_contato_id;

  if 'fornecedor' = any(v_papeis) then
    if v_fornecedor_id is null then
      select id into v_fornecedor_id from public.fin_fornecedores
       where contato_id = v_contato_id order by created_at, id limit 1;
    end if;

    if v_fornecedor_id is not null then
      select empresa_id, contato_id into v_empresa_fornecedor, v_fornecedor_atual
        from public.fin_fornecedores where id = v_fornecedor_id;
      if v_empresa_fornecedor is null then
        raise exception 'financeiro: fornecedor não encontrado' using errcode = 'foreign_key_violation';
      end if;
      if v_empresa_fornecedor <> v_empresa_id then
        raise exception 'financeiro: fornecedor aponta para outra empresa' using errcode = 'check_violation';
      end if;
      if v_fornecedor_atual is not null and v_fornecedor_atual <> v_contato_id then
        raise exception 'financeiro: fornecedor já pertence a outro contato' using errcode = 'unique_violation';
      end if;

      update public.fin_fornecedores f
         set contato_id = v_contato_id,
             nome = v_nome,
             cnpj = case when p_entrada ? 'cnpj' or v_fornecedor ? 'cnpj' then v_cnpj else f.cnpj end,
             categoria = v_categoria,
             categorias = v_categorias,
             contato_nome = case when v_fornecedor ? 'contato_nome' then nullif(btrim(coalesce(v_fornecedor ->> 'contato_nome', '')), '') else f.contato_nome end,
             contato_email = v_email,
             contato_fone = v_telefone,
             prazo_dias = case when v_fornecedor ? 'prazo_dias' then nullif(v_fornecedor ->> 'prazo_dias', '')::int else f.prazo_dias end,
             forma_pagamento = case when v_fornecedor ? 'forma_pagamento' then nullif(btrim(coalesce(v_fornecedor ->> 'forma_pagamento', '')), '') else f.forma_pagamento end,
             observacao = v_observacao,
             pix_tipo = case when v_fornecedor ? 'pix_tipo' then nullif(btrim(coalesce(v_fornecedor ->> 'pix_tipo', '')), '') else f.pix_tipo end,
             pix_chave = case when v_fornecedor ? 'pix_chave' then nullif(btrim(coalesce(v_fornecedor ->> 'pix_chave', '')), '') else f.pix_chave end,
             banco = case when v_fornecedor ? 'banco' then nullif(btrim(coalesce(v_fornecedor ->> 'banco', '')), '') else f.banco end,
             agencia = case when v_fornecedor ? 'agencia' then nullif(btrim(coalesce(v_fornecedor ->> 'agencia', '')), '') else f.agencia end,
             conta_numero = case when v_fornecedor ? 'conta_numero' then nullif(btrim(coalesce(v_fornecedor ->> 'conta_numero', '')), '') else f.conta_numero end,
             aceita_boleto = case when v_fornecedor ? 'aceita_boleto' then coalesce((v_fornecedor ->> 'aceita_boleto')::boolean, false) else f.aceita_boleto end,
             inscricao_estadual = case when v_fornecedor ? 'inscricao_estadual' then nullif(btrim(coalesce(v_fornecedor ->> 'inscricao_estadual', '')), '') else f.inscricao_estadual end,
             site = v_site,
             whatsapp = v_telefone,
             cidade = case when v_fornecedor ? 'cidade' then nullif(btrim(coalesce(v_fornecedor ->> 'cidade', '')), '') else f.cidade end,
             uf = case when v_fornecedor ? 'uf' then nullif(btrim(coalesce(v_fornecedor ->> 'uf', '')), '') else f.uf end,
             endereco = v_endereco,
             prazo_envio_dias = case when v_fornecedor ? 'prazo_envio_dias' then nullif(v_fornecedor ->> 'prazo_envio_dias', '')::int else f.prazo_envio_dias end,
             ativo = v_ativo,
             deleted_at = case when v_ativo then null else f.deleted_at end,
             updated_by = p_user_id
       where f.id = v_fornecedor_id;
    else
      insert into public.fin_fornecedores (
        empresa_id, contato_id, nome, cnpj, categoria, categorias, contato_nome,
        contato_email, contato_fone, prazo_dias, forma_pagamento, observacao,
        pix_tipo, pix_chave, banco, agencia, conta_numero, aceita_boleto,
        inscricao_estadual, site, whatsapp, cidade, uf, endereco,
        prazo_envio_dias, ativo, created_by, updated_by
      ) values (
        v_empresa_id, v_contato_id, v_nome, v_cnpj,
        v_categoria, v_categorias,
        nullif(btrim(coalesce(v_fornecedor ->> 'contato_nome', '')), ''), v_email, v_telefone,
        nullif(v_fornecedor ->> 'prazo_dias', '')::int,
        nullif(btrim(coalesce(v_fornecedor ->> 'forma_pagamento', '')), ''),
        v_observacao,
        nullif(btrim(coalesce(v_fornecedor ->> 'pix_tipo', '')), ''),
        nullif(btrim(coalesce(v_fornecedor ->> 'pix_chave', '')), ''),
        nullif(btrim(coalesce(v_fornecedor ->> 'banco', '')), ''),
        nullif(btrim(coalesce(v_fornecedor ->> 'agencia', '')), ''),
        nullif(btrim(coalesce(v_fornecedor ->> 'conta_numero', '')), ''),
        coalesce((v_fornecedor ->> 'aceita_boleto')::boolean, false),
        nullif(btrim(coalesce(v_fornecedor ->> 'inscricao_estadual', '')), ''),
        v_site, v_telefone,
        nullif(btrim(coalesce(v_fornecedor ->> 'cidade', '')), ''),
        nullif(btrim(coalesce(v_fornecedor ->> 'uf', '')), ''), v_endereco,
        nullif(v_fornecedor ->> 'prazo_envio_dias', '')::int,
        v_ativo, p_user_id, p_user_id
      ) returning id into v_fornecedor_id;
    end if;
  else
    -- Tirar o papel não destrói compras, compromissos nem a extensão histórica.
    update public.fin_fornecedores f
       set nome = v_nome,
           cnpj = case when p_entrada ? 'cnpj' then v_cnpj else f.cnpj end,
           categoria = v_categoria,
           categorias = v_categorias,
           contato_email = v_email,
           contato_fone = v_telefone,
           whatsapp = v_telefone,
           site = v_site,
           endereco = v_endereco,
           observacao = v_observacao,
           ativo = false,
           updated_by = p_user_id
     where contato_id = v_contato_id;
    v_fornecedor_id := null;
  end if;

  insert into public.fin_auditoria (empresa_id, entidade, entidade_id, acao, dados, user_id)
  values (
    v_empresa_id, 'contato', v_contato_id, 'salvar_parte',
    jsonb_build_object('papeis', v_papeis, 'fornecedor_id', v_fornecedor_id), p_user_id
  );

  return jsonb_build_object('contato_id', v_contato_id, 'fornecedor_id', v_fornecedor_id);
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║   7/11  financeiro_compromisso_recorrente.sql                           ║
-- ║       Compromisso gerado por recorrência, com chave de idempotência      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Cria a regra e sua primeira obrigação na MESMA transação.
-- Rode depois de financeiro_contato_empresa.sql.

create or replace function public.fin_criar_compromisso_recorrente(
  p_entrada jsonb,
  p_autor uuid default null
)
returns table (compromisso_id uuid, recorrencia_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa uuid := nullif(p_entrada->>'empresa_id', '')::uuid;
  v_descricao text := btrim(coalesce(p_entrada->>'descricao', ''));
  v_categoria text := coalesce(nullif(btrim(p_entrada->>'categoria'), ''), 'outros');
  v_valor numeric(14,2) := coalesce((p_entrada->>'valor')::numeric, 0);
  v_vencimento date := (p_entrada->>'vencimento')::date;
  v_competencia date := date_trunc('month', v_vencimento)::date;
  v_periodicidade text := coalesce(nullif(p_entrada->>'periodicidade', ''), 'mensal');
  v_intervalo int := greatest(1, least(60, coalesce((p_entrada->>'intervalo_meses')::int, 1)));
  v_dia int := greatest(1, least(31, coalesce((p_entrada->>'dia_vencimento')::int, extract(day from v_vencimento)::int)));
  v_fim date := nullif(p_entrada->>'fim', '')::date;
  v_conta uuid := nullif(p_entrada->>'conta_id', '')::uuid;
  v_fornecedor uuid := nullif(p_entrada->>'fornecedor_id', '')::uuid;
  v_contato uuid := nullif(p_entrada->>'contato_id', '')::uuid;
  v_passo int;
begin
  if v_empresa is null or v_descricao = '' or v_valor <= 0 then
    raise exception 'Dados inválidos para compromisso recorrente.';
  end if;
  if v_fornecedor is not null and v_contato is not null then
    raise exception 'Escolha somente um favorecido: fornecedor ou contato.';
  end if;
  if v_fim is not null and v_fim < v_vencimento then
    raise exception 'O fim não pode ser antes da primeira ocorrência.';
  end if;

  v_passo := case v_periodicidade
    when 'mensal' then 1 when 'bimestral' then 2 when 'trimestral' then 3
    when 'semestral' then 6 when 'anual' then 12 when 'customizada' then v_intervalo
    else 1 end;

  insert into public.fin_recorrencias (
    empresa_id, descricao, categoria, valor, periodicidade, intervalo_meses,
    dia_vencimento, conta_id, fornecedor_id, contato_id, inicio, fim,
    proxima_competencia, status, observacao, created_by
  ) values (
    v_empresa, v_descricao, v_categoria, v_valor, v_periodicidade, v_intervalo,
    v_dia, v_conta, v_fornecedor, v_contato, v_vencimento, v_fim,
    (v_competencia + make_interval(months => v_passo))::date,
    'ativa', nullif(btrim(p_entrada->>'observacao'), ''), p_autor
  ) returning id into recorrencia_id;

  insert into public.fin_compromissos (
    empresa_id, descricao, categoria, valor, vencimento, competencia, status,
    origem, origem_id, conta_id, fornecedor_id, contato_id, idempotency_key,
    observacao, created_by
  ) values (
    v_empresa, v_descricao, v_categoria, v_valor, v_vencimento, v_competencia,
    'pendente', 'recorrencia', recorrencia_id, v_conta, v_fornecedor, v_contato,
    'rec:' || recorrencia_id::text || ':' || to_char(v_competencia, 'YYYY-MM'),
    nullif(btrim(p_entrada->>'observacao'), ''), p_autor
  ) returning id into compromisso_id;

  return next;
end;
$$;

select count(*) as funcao_criada
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'fin_criar_compromisso_recorrente';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║   8/11  financeiro_view_conta_marca.sql                                 ║
-- ║       A view de saldo devolve a marca da conta                           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ═════════════════════════════════════════════════════════════════════════════
--  A VIEW DE SALDO PRECISA DEVOLVER A MARCA DA CONTA
-- ═════════════════════════════════════════════════════════════════════════════
--
--  `fin_contas.logo_url` e `fin_contas.icone` existem desde o `financeiro.sql`,
--  e a rota de upload grava neles corretamente — medido em produção: Sicred,
--  Itaú e Inter estão os três com o caminho gravado.
--
--  Só que a TELA não lê a tabela: ela lê a view `fin_contas_saldo`, que é onde
--  mora o saldo calculado. E a view nunca listou essas duas colunas. O
--  resultado é o pior tipo de defeito: a foto sobe, o banco guarda, e a tela
--  continua mostrando o ícone de reserva — "adiciono as fotos dos bancos e
--  gateways e nada acontece". Não havia erro em lugar nenhum, porque a leitura
--  é tolerante: ela tenta com as colunas, leva 42703, e repete sem elas.
--
--  Rode DEPOIS de `financeiro_contato_banco_recorrencia.sql` (que criou a
--  versão atual da view). Idempotente.
--
--  O `drop` antes do `create` NÃO é zelo. `create or replace view` no Postgres
--  só aceita ACRESCENTAR coluna no FIM; qualquer outra mudança morre em
--  «cannot change name of view column». E como o SQL Editor roda o arquivo
--  inteiro numa transação, esse erro derrubaria tudo. Já aconteceu neste banco.

drop view if exists public.fin_contas_saldo;
create view public.fin_contas_saldo as
select
  c.id, c.empresa_id, c.nome, c.tipo, c.instituicao, c.cor, c.ordem,
  c.ativa, c.inclui_no_saldo, c.saldo_inicial, c.responsavel_id,
  c.limite, c.conta_mae_id, c.bandeira, c.final,
  c.agencia, c.numero,
  -- O que faltava. `logo_url` é o CAMINHO no bucket privado (nunca a URL: link
  -- assinado vence, e coluna cheia de link morto é pior que coluna vazia);
  -- `icone` é o Tabler que aparece enquanto não há imagem.
  c.logo_url, c.icone,
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

-- ── Conferência ──────────────────────────────────────────────────────────────
-- `com_logo` tem de bater com o número de contas que têm imagem na tabela.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_contas_saldo'
      and column_name in ('logo_url','icone')) as colunas_de_marca,
  (select count(*) from public.fin_contas_saldo where logo_url is not null) as com_logo_na_view,
  (select count(*) from public.fin_contas      where logo_url is not null) as com_logo_na_tabela;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║   9/11  financeiro_patrimonio_foto.sql                                  ║
-- ║       Foto do bem                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ═════════════════════════════════════════════════════════════════════════════
--  FOTO DO BEM
-- ═════════════════════════════════════════════════════════════════════════════
--
--  Patrimônio era o único cadastro do módulo sem cara própria. Empresa, conta,
--  fornecedor, contato, pessoa da folha e recorrência já têm; o bem, que é a
--  única coisa desta lista que existe FISICAMENTE, não tinha.
--
--  E é onde a foto mais serve: "Monitor Gamer Concórdia 23,8\" H238F" descreve
--  o modelo e não distingue os três que estão no escritório. Quem confere
--  patrimônio anda com a lista na mão procurando o objeto — reconhecer é mais
--  rápido que ler um código.
--
--  `logo_url` guarda o CAMINHO no bucket privado, nunca a URL: link assinado
--  vence em uma hora, e coluna cheia de link morto é pior que coluna vazia.
--  Quem monta o link é o servidor, na hora. `icone` é o Tabler que aparece
--  enquanto não há imagem, para o bem nunca ficar sem marca nenhuma.
--
--  Rode DEPOIS de `financeiro.sql`. Idempotente.

alter table public.fin_patrimonio
  add column if not exists logo_url text,
  add column if not exists icone    text;

-- ── Conferência ──────────────────────────────────────────────────────────────
select count(*) as colunas_de_marca
  from information_schema.columns
 where table_schema = 'public' and table_name = 'fin_patrimonio'
   and column_name in ('logo_url', 'icone');


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  10/11  financeiro_recorrencia_variavel.sql                             ║
-- ║       Recorrência de valor variável                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ═════════════════════════════════════════════════════════════════════════════
--  RECORRÊNCIA DE VALOR VARIÁVEL — luz, água, cartão, comissão
-- ═════════════════════════════════════════════════════════════════════════════
--
--  A regra guardava um `valor` só, e isso obriga a escolher entre duas
--  mentiras: repetir o valor do mês passado (a agenda mostra um número que
--  ninguém combinou) ou deixar zero (o "a pagar" some, e previsão de caixa que
--  engana PARA MENOS é a pior direção, porque ninguém desconfia dela).
--
--  Duas peças:
--
--  1. `valor_variavel` na regra. Quando ligado, o `valor` continua existindo e
--     passa a ser ESTIMATIVA — a linha aparece na agenda marcada como palpite,
--     e ninguém paga achando que conferiu.
--
--  2. `fin_recorrencia_valores`: o número combinado para UM mês. Quem sabe que
--     a próxima do contador é diferente lança antes, e a geração usa o
--     combinado no lugar da estimativa.
--
--  POR QUE UMA TABELA E NÃO UM `jsonb` NA REGRA. O valor de um mês é um FATO
--  com autor e data — quem informou R$ 617,42 de luz em setembro, e quando.
--  Num `jsonb` isso vira um blob sem histórico e sem trava de unicidade; aqui
--  o par (regra, competência) é único por índice, então informar duas vezes
--  corrige em vez de duplicar.
--
--  Rode DEPOIS de `financeiro.sql`. Idempotente.

alter table public.fin_recorrencias
  add column if not exists valor_variavel boolean not null default false;

create table if not exists public.fin_recorrencia_valores (
  id             uuid primary key default gen_random_uuid(),
  recorrencia_id uuid not null references public.fin_recorrencias(id) on delete cascade,
  -- Sempre o 1º dia do mês. O `check` impede meia-competência entrar e nunca
  -- casar com a chave de idempotência, que é montada a partir de AAAA-MM.
  competencia    date not null check (competencia = date_trunc('month', competencia)::date),
  valor          numeric(14,2) not null default 0,
  observacao     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid,
  -- Informar de novo CORRIGE; não duplica.
  unique (recorrencia_id, competencia)
);

create index if not exists fin_rec_valores_regra
  on public.fin_recorrencia_valores (recorrencia_id, competencia);

drop trigger if exists fin_rec_valores_touch on public.fin_recorrencia_valores;
create trigger fin_rec_valores_touch before update on public.fin_recorrencia_valores
  for each row execute function public.fin_touch();

-- Mesma fechadura do resto do módulo: RLS ligada e ZERO políticas. O app lê
-- pelo `service_role`; a chave `anon`, que vive no navegador, não lê nada.
alter table public.fin_recorrencia_valores enable row level security;

-- ── Conferência ──────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_recorrencias'
      and column_name = 'valor_variavel') as coluna_na_regra,
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'fin_recorrencia_valores') as tabela_de_valores,
  (select count(*) from public.fin_recorrencias where valor_variavel) as regras_variaveis;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  11/11  financeiro_natureza_por_uso.sql                                 ║
-- ║       Arruma a natureza de quem já está cadastrado                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ═════════════════════════════════════════════════════════════════════════════
--  A NATUREZA DO CONTATO VIRA CONSEQUÊNCIA DO USO
-- ═════════════════════════════════════════════════════════════════════════════
--
--  `fin_contatos.natureza` nasce 'pessoa' e ninguém nunca troca — é um campo
--  que pede uma classificação antes de a pessoa saber para que ela serve. O
--  resultado, medido no diretório de produção em 24/08/2026: nove fichas, TODAS
--  empresas (Madeiranit Bauru, Packit, Molas ICO, Unitec, Acrílicos…), todas
--  gravadas como 'pessoa'.
--
--  Isso criava um beco sem saída na tela: o seletor "Organização" listava só
--  quem tinha natureza = 'empresa', então abria escrito "Sem organização
--  cadastrada" num diretório cheio de organizações. Para sair, alguém teria que
--  adivinhar que existe um campo a corrigir em cada ficha, uma por uma.
--
--  O código já não depende mais disso (a lista aceita qualquer ficha, e
--  escolher alguém como organização passa a marcá-lo). Este arquivo arruma o
--  que já está gravado, para o diretório começar organizado em vez de esperar
--  alguém usar cada ficha uma vez.
--
--  O CRITÉRIO É CONSERVADOR, e de propósito: marcar pessoa como empresa é
--  chato mas reversível na tela; o contrário também. Ainda assim, adivinhar
--  pelo nome ("tem Ltda?") erraria em cima de dado que é do dono, não meu.
--  Então só marca quem tem PROVA de ser empresa:
--
--    · tem CNPJ preenchido, ou
--    · alguém já a aponta como organização.
--
--  NÃO entra "é fornecedor". A primeira versão deste arquivo tinha esse
--  critério, com a justificativa de que "quem vende para a empresa é uma
--  empresa" — e ela é falsa. Rodado em produção, marcou como empresa o
--  "Mestre Marceneiro" e o "Alexandre Império das Chapas": um marceneiro
--  autônomo e uma pessoa com nome próprio. Fornecedor é PAPEL; empresa é
--  natureza jurídica, e as duas coisas não se deduzem uma da outra.
--  O passo 4, no fim, desfaz o que aquele critério marcou.
--
--  Quem não se encaixa fica como está. Idempotente: rodar de novo não desfaz
--  nada e não remarca o que já está certo.

-- ── 1. Tem CNPJ ──────────────────────────────────────────────────────────────
update public.fin_contatos
   set natureza = 'empresa'
 where natureza is distinct from 'empresa'
   and coalesce(nullif(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g'), ''), '') <> '';

-- ── 2. Alguém já a aponta como organização ───────────────────────────────────
update public.fin_contatos c
   set natureza = 'empresa'
 where c.natureza is distinct from 'empresa'
   and exists (select 1 from public.fin_contatos f where f.organizacao_id = c.id);

-- ── 3. DESFAZ o que o critério "é fornecedor" marcou ────────────────────────
--
-- A versão anterior deste arquivo marcava todo fornecedor como empresa. Quem
-- já rodou aquela versão tem pessoas gravadas como empresa; este passo as
-- devolve a 'pessoa'.
--
-- Só volta quem não tem NENHUMA prova independente: sem CNPJ e sem ninguém
-- apontando para ela como organização. Quem tem prova fica como está, e quem
-- alguém corrigiu à mão na tela também — porque a tela, ao vincular, é o
-- próprio critério 2.
do $$
begin
  update public.fin_contatos c
     set natureza = 'pessoa'
   where c.natureza = 'empresa'
     and coalesce(nullif(regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g'), ''), '') = ''
     and not exists (select 1 from public.fin_contatos f where f.organizacao_id = c.id)
     and c.papeis @> array['fornecedor']::text[];
exception
  when undefined_column then raise notice 'sem a coluna papeis — pulei o passo 3';
end $$;

-- ── Conferência ──────────────────────────────────────────────────────────────
select natureza, count(*) as fichas
  from public.fin_contatos
 group by natureza
 order by natureza;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  11/12  financeiro_folha_mensal.sql                                        ║
-- ║       Folha mensal — salário por mês, pago, faltas com DSR                 ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ═════════════════════════════════════════════════════════════════════════════
--  FOLHA MENSAL — o mês é a unidade, não o cadastro
-- ═════════════════════════════════════════════════════════════════════════════
--
--  O cadastro do colaborador guardava UM salário, e salário muda: o valor de
--  março não é o de outubro, e uma folha que só conhece o número atual
--  reescreve o passado toda vez que alguém ganha aumento. Aqui cada
--  competência tem a sua linha — salário, bônus, comissão, gratificação,
--  benefícios, vale, convênio da farmácia, mercadinho, faltas e o PAGO daquele
--  mês. O mês fechado fica congelado; o mês novo nasce zerado (só o salário é
--  herdado), que é o "bônus zera todo mês" pedido — de graça, pelo modelo.
--
--  FALTAS SÃO DATAS, NUNCA CONTAGEM. O DSR (Lei 605/49, art. 6º) é perdido por
--  SEMANA com falta: duas faltas na mesma semana perdem um descanso só. Sem a
--  data de cada uma, qualquer conta é chute — e folha não pode chutar.
--
--  Rode DEPOIS de `financeiro.sql`. Idempotente.

-- ── 1. O vínculo da pessoa (CLT, MEI, PF, Estágio) ───────────────────────────

alter table public.fin_colaboradores
  -- Sem `check` de propósito, como `tipo` e `natureza` dos contatos: o
  -- vocabulário é da tela, e um check transformaria "quero um vínculo novo"
  -- num arquivo de SQL.
  add column if not exists vinculo text;

-- ── 2. A linha do mês ────────────────────────────────────────────────────────

create table if not exists public.fin_folha_mensal (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.fin_empresas(id) on delete restrict,
  colaborador_id uuid not null references public.fin_colaboradores(id) on delete cascade,
  -- Sempre o 1º dia do mês TRABALHADO. O pagamento vence no 5º dia útil do mês
  -- seguinte (CLT 459 §1º) — isso é conta da tela, não coluna.
  competencia    date not null check (competencia = date_trunc('month', competencia)::date),

  salario        numeric(14,2) not null default 0,
  bonus          numeric(14,2) not null default 0,
  comissao       numeric(14,2) not null default 0,
  gratificacao   numeric(14,2) not null default 0,
  beneficios     numeric(14,2) not null default 0,

  -- Descontos do mês.
  vale               numeric(14,2) not null default 0,
  convenio_farmacia  numeric(14,2) not null default 0,
  mercadinho         numeric(14,2) not null default 0,

  -- As DATAS das faltas injustificadas (ver o cabeçalho: DSR é por semana).
  faltas         date[] not null default '{}',

  pago           boolean not null default false,
  pago_em        timestamptz,
  observacao     text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid,

  -- Um mês por pessoa. Gravar de novo CORRIGE, nunca duplica — é a mesma
  -- trava de idempotência do resto do módulo.
  unique (colaborador_id, competencia)
);

create index if not exists fin_folha_mensal_mes
  on public.fin_folha_mensal (empresa_id, competencia);
create index if not exists fin_folha_mensal_pessoa
  on public.fin_folha_mensal (colaborador_id, competencia desc);

-- Empresa cruzada: a linha do mês de uma pessoa da Tridi não nasce na Gedux.
drop trigger if exists fin_folha_mensal_empresa_ok on public.fin_folha_mensal;
create trigger fin_folha_mensal_empresa_ok before insert or update on public.fin_folha_mensal
  for each row execute function public.fin_confere_empresa('colaborador_id,fin_colaboradores');

drop trigger if exists fin_folha_mensal_touch on public.fin_folha_mensal;
create trigger fin_folha_mensal_touch before update on public.fin_folha_mensal
  for each row execute function public.fin_touch();

-- Mesma fechadura do módulo inteiro: RLS ligada, zero políticas. O app lê pelo
-- service_role; a chave anon, que vive no navegador, não lê salário de ninguém.
alter table public.fin_folha_mensal enable row level security;

-- ── Conferência ──────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_colaboradores'
      and column_name = 'vinculo') as vinculo_no_cadastro,
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'fin_folha_mensal') as tabela_da_folha,
  (select count(*) from public.fin_folha_mensal) as meses_ja_gravados;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  CONFERÊNCIA FINAL — o que o código espera encontrar                      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
--  Cada linha tem de vir com `ok`. `FALTA` aponta exatamente o que não subiu.

with esperado(tabela, coluna) as (values
  ('fin_empresas','logo_url'), ('fin_contas','logo_url'),
  ('fin_contatos','natureza'), ('fin_contatos','organizacao_id'),
  ('fin_contatos','papeis'),   ('fin_contatos','cnpj'),
  ('fin_fornecedores','contato_id'), ('fin_fornecedores','pix_chave'),
  ('fin_colaboradores','logo_url'),
  ('fin_recorrencias','contato_id'), ('fin_recorrencias','conta_destino_id'),
  ('fin_recorrencias','logo_url'),   ('fin_recorrencias','icone'),
  ('fin_compromissos','contato_id'), ('fin_compromissos','origem_id'),
  ('fin_compromissos','idempotency_key'),
  ('fin_patrimonio','garantia_ate'), ('fin_config','empresa_id'),
  ('fin_anexos','caminho'),          ('fin_auditoria','acao')
)
select e.tabela, e.coluna,
       case when c.column_name is null then 'FALTA' else 'ok' end as situacao
  from esperado e
  left join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = e.tabela and c.column_name = e.coluna
 order by situacao, e.tabela, e.coluna;

-- A função do cadastro unificado (contato + fornecedor numa transação só).
select case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'fin_salvar_parte')
       then 'ok' else 'FALTA' end as fin_salvar_parte;

-- E como ficou a natureza do diretório.
select natureza, count(*) as fichas from public.fin_contatos group by natureza order by natureza;
