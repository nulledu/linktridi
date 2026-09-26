-- ═══════════════════════════════════════════════════════════════════════════
-- TRIDIMARKET — SISTEMA NOVO, DO ZERO (schema `mercadinho`)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Substitui as 9 tabelas herdadas do ERP antigo (perfis, usuarios_perfil,
-- produtos, categorias, estoque_perfil, precos_perfil, vendas_usuarios,
-- venda_itens, movimentacoes_estoque) por estrutura PRÓPRIA.
--
-- Fica num SCHEMA SEPARADO de propósito:
--   • zero dependência do antigo — nada aqui referencia public.*
--   • o ERP antigo continua intocado (rollback é só apontar o app de volta)
--   • nomes limpos, sem herança ("unidades" em vez de "perfis")
--
-- O QUE MELHOREI em relação ao antigo (não é cópia):
--   1. venda_itens tem QUANTIDADE. O antigo inseria uma linha por unidade —
--      comprar 3 refrigerantes gerava 3 linhas iguais.
--   2. Preço fica GRAVADO na venda. No antigo, mudar o preço do produto
--      reescrevia o histórico de vendas passadas.
--   3. Estoque com CHECK >= 0 e a venda tratando isso (foi o bug que fazia
--      compra sumir quando o produto estava zerado).
--   4. CUSTO do produto existe desde o início → margem/lucro reais.
--   5. Toda tabela tem RLS ligada. Acesso só via service role (as rotas /api).
--
-- Rodar no Supabase do MERCADINHO (wcxhyludixozqloqzjpn). Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists mercadinho;

-- ── Cadastro ────────────────────────────────────────────────────────────────

-- Unidade = loja/empresa onde o mercadinho existe (era `perfis`).
create table if not exists mercadinho.unidades (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  cnpj          text,
  descricao     text,
  cor           text,
  imagem_url    text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Funcionário que compra no mercadinho (era `usuarios_perfil`).
-- `codigo_hash`: o código de acesso NUNCA é guardado em texto puro — o tablet
-- compara pelo verificador (mesma ideia do diretório offline já existente).
create table if not exists mercadinho.funcionarios (
  id             bigint generated always as identity primary key,
  unidade_id     uuid not null references mercadinho.unidades(id) on delete restrict,
  nome           text not null,
  codigo_hash    text,
  foto_url       text,
  ativo          boolean not null default true,
  limite_proprio numeric(12,2),          -- null = usa o limite padrão dos ajustes
  bloqueado      boolean not null default false,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists funcionarios_unidade on mercadinho.funcionarios (unidade_id) where ativo;
-- `create table if not exists` NÃO acrescenta coluna em tabela que já existe.
-- Num banco criado antes de `codigo_hash` entrar neste arquivo, o create acima
-- é ignorado inteiro, a coluna nunca aparece, e o índice abaixo derrubava a
-- execução do arquivo com
--     42703: column "codigo_hash" does not exist
-- Vale pra toda coluna nova daqui pra frente: acrescente com `alter table ...
-- add column if not exists` ao lado do create, senão o arquivo só funciona em
-- banco zerado.
alter table mercadinho.funcionarios add column if not exists codigo_hash text;
create index if not exists funcionarios_codigo on mercadinho.funcionarios (codigo_hash);

create table if not exists mercadinho.categorias (
  id         bigint generated always as identity primary key,
  nome       text not null unique,
  imagem_url text,
  criado_em  timestamptz not null default now()
);

-- Catálogo. `codigo_barras` é único quando existe; `sem_codigo` marca os itens
-- que a pessoa escolhe pelo toque (paçoca, granel) em vez de bipar.
create table if not exists mercadinho.produtos (
  id            bigint generated always as identity primary key,
  nome          text not null,
  codigo_barras text unique,
  categoria_id  bigint references mercadinho.categorias(id) on delete set null,
  preco_padrao  numeric(12,2) not null default 0 check (preco_padrao >= 0),
  custo_padrao  numeric(12,2) check (custo_padrao >= 0),   -- base da margem
  imagem_url    text,
  ativo         boolean not null default true,
  sem_codigo    boolean not null default false,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists produtos_ativos on mercadinho.produtos (nome) where ativo;
create index if not exists produtos_sem_codigo on mercadinho.produtos (sem_codigo) where sem_codigo;

-- Preço POR UNIDADE (sobrepõe o preco_padrao). Era `precos_perfil`.
create table if not exists mercadinho.precos (
  unidade_id    uuid not null references mercadinho.unidades(id) on delete cascade,
  produto_id    bigint not null references mercadinho.produtos(id) on delete cascade,
  preco         numeric(12,2) not null check (preco >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (unidade_id, produto_id)
);

-- Estoque POR UNIDADE. Era `estoque_perfil`, agora com PK composta (o antigo
-- deixava duplicar a mesma dupla unidade+produto).
create table if not exists mercadinho.estoque (
  unidade_id       uuid not null references mercadinho.unidades(id) on delete cascade,
  produto_id       bigint not null references mercadinho.produtos(id) on delete cascade,
  quantidade       integer not null default 0 check (quantidade >= 0),
  minimo           integer not null default 5 check (minimo >= 0),
  permite_negativo boolean not null default true,   -- vender sem estoque é permitido
  atualizado_em    timestamptz not null default now(),
  primary key (unidade_id, produto_id)
);
create index if not exists estoque_critico on mercadinho.estoque (unidade_id) where quantidade <= 5;

-- ── Venda ───────────────────────────────────────────────────────────────────

create table if not exists mercadinho.vendas (
  id             bigint generated always as identity primary key,
  unidade_id     uuid not null references mercadinho.unidades(id) on delete restrict,
  funcionario_id bigint not null references mercadinho.funcionarios(id) on delete restrict,
  total          numeric(12,2) not null default 0 check (total >= 0),
  pago           boolean not null default false,
  pago_em        timestamptz,
  origem         text not null default 'tablet' check (origem in ('tablet','manual','ajuste')),
  ocorrido_em    timestamptz not null default now(),   -- hora no APARELHO
  criado_em      timestamptz not null default now()    -- hora no SERVIDOR
);
create index if not exists vendas_unidade_data on mercadinho.vendas (unidade_id, criado_em desc);
create index if not exists vendas_funcionario on mercadinho.vendas (funcionario_id, criado_em desc);
create index if not exists vendas_em_aberto on mercadinho.vendas (funcionario_id) where not pago;

-- Uma linha POR PRODUTO (com quantidade), não por unidade vendida.
-- Preço e custo ficam CONGELADOS aqui: é o que garante que relatório antigo não
-- muda quando alguém corrige o preço do produto hoje.
create table if not exists mercadinho.venda_itens (
  id            bigint generated always as identity primary key,
  venda_id      bigint not null references mercadinho.vendas(id) on delete cascade,
  produto_id    bigint not null references mercadinho.produtos(id) on delete restrict,
  quantidade    integer not null check (quantidade > 0),
  preco_unit    numeric(12,2) not null check (preco_unit >= 0),
  custo_unit    numeric(12,2),
  subtotal      numeric(12,2) generated always as (quantidade * preco_unit) stored
);
create index if not exists venda_itens_venda on mercadinho.venda_itens (venda_id);
create index if not exists venda_itens_produto on mercadinho.venda_itens (produto_id);

-- Histórico de estoque (era `movimentacoes_estoque`).
create table if not exists mercadinho.movimentacoes (
  id         bigint generated always as identity primary key,
  unidade_id uuid not null references mercadinho.unidades(id) on delete cascade,
  produto_id bigint not null references mercadinho.produtos(id) on delete cascade,
  tipo       text not null check (tipo in ('ENTRADA','VENDA','AJUSTE','PERDA','TRANSFERENCIA')),
  quantidade integer not null check (quantidade > 0),   -- direção vem do tipo
  motivo     text,
  referencia text,
  autor_id   uuid,
  criado_em  timestamptz not null default now()
);
create index if not exists movimentacoes_produto on mercadinho.movimentacoes (unidade_id, produto_id, criado_em desc);

-- ── Carteira (dívida) ───────────────────────────────────────────────────────

-- Razão IMUTÁVEL: compra soma, pagamento abate. Nunca se edita uma linha —
-- corrige-se com um lançamento compensatório.
create table if not exists mercadinho.lancamentos (
  id             bigint generated always as identity primary key,
  funcionario_id bigint not null references mercadinho.funcionarios(id) on delete restrict,
  unidade_id     uuid not null references mercadinho.unidades(id) on delete restrict,
  tipo           text not null check (tipo in ('compra','pagamento','credito','debito','estorno')),
  valor          numeric(12,2) not null,   -- + aumenta dívida, − abate
  descricao      text,
  venda_id       bigint references mercadinho.vendas(id) on delete set null,
  operacao_id    uuid,
  metadados      jsonb,
  ocorrido_em    timestamptz not null default now(),
  criado_em      timestamptz not null default now()
);
create index if not exists lancamentos_funcionario on mercadinho.lancamentos (funcionario_id, ocorrido_em desc);

create or replace function mercadinho.lancamento_imutavel() returns trigger
language plpgsql as $$
begin
  raise exception 'lançamento é imutável — crie um lançamento compensatório';
end; $$;
drop trigger if exists lancamentos_sem_update on mercadinho.lancamentos;
create trigger lancamentos_sem_update before update or delete on mercadinho.lancamentos
  for each row execute function mercadinho.lancamento_imutavel();

create table if not exists mercadinho.pagamentos (
  id             bigint generated always as identity primary key,
  funcionario_id bigint not null references mercadinho.funcionarios(id) on delete restrict,
  unidade_id     uuid not null references mercadinho.unidades(id) on delete restrict,
  valor          numeric(12,2) not null check (valor > 0),
  metodo         text not null default 'outro' check (metodo in ('dinheiro','pix','cartao','transferencia','desconto_folha','outro')),
  observacao     text,
  registrado_por uuid,
  criado_em      timestamptz not null default now()
);

-- Limite extra (cheque especial) individual.
create table if not exists mercadinho.creditos (
  funcionario_id bigint primary key references mercadinho.funcionarios(id) on delete cascade,
  limite_extra   numeric(12,2) not null default 0 check (limite_extra >= 0),
  bloqueado      boolean not null default false,
  atualizado_em  timestamptz not null default now()
);

-- Nota do gestor (congela o score automático quando preenchida).
create table if not exists mercadinho.scores (
  funcionario_id bigint primary key references mercadinho.funcionarios(id) on delete cascade,
  score          smallint check (score between 0 and 100),
  manual         boolean not null default true,
  atualizado_em  timestamptz not null default now()
);

-- ── Tablets ─────────────────────────────────────────────────────────────────

create table if not exists mercadinho.dispositivos (
  id             uuid primary key default gen_random_uuid(),
  unidade_id     uuid not null references mercadinho.unidades(id) on delete cascade,
  nome           text not null,
  token_hash     text unique,
  ativo          boolean not null default true,
  versao_app     text,
  instalacao_id  text,
  bateria        smallint,
  visto_em       timestamptz,
  criado_em      timestamptz not null default now()
);

create table if not exists mercadinho.dispositivo_codigos (
  codigo     text primary key,
  unidade_id uuid not null references mercadinho.unidades(id) on delete cascade,
  nome       text not null,
  usado_em   timestamptz,
  expira_em  timestamptz not null default (now() + interval '1 day'),
  criado_em  timestamptz not null default now()
);

-- Idempotência da compra: o tablet gera o uuid, o servidor rejeita repetido.
-- É o que garante que retry de sincronização não duplica venda.
create table if not exists mercadinho.operacoes_compra (
  operacao_id     uuid primary key,
  dispositivo_id  uuid references mercadinho.dispositivos(id) on delete set null,
  funcionario_id  bigint not null references mercadinho.funcionarios(id) on delete restrict,
  unidade_id      uuid not null references mercadinho.unidades(id) on delete restrict,
  venda_id        bigint references mercadinho.vendas(id) on delete set null,
  sequencia_local bigint,
  hash_payload    text,
  estoque_furado  boolean not null default false,   -- vendeu sem ter
  status          text not null default 'SINCRONIZANDO'
                  check (status in ('SINCRONIZANDO','SINCRONIZADA','REVISAR','REJEITADA','ESTORNADA')),
  motivo          text,
  ocorrido_em     timestamptz not null,             -- hora do APARELHO
  recebido_em     timestamptz not null default now()-- hora do SERVIDOR
);
create index if not exists operacoes_status on mercadinho.operacoes_compra (status) where status <> 'SINCRONIZADA';

-- ── Operação e auditoria ────────────────────────────────────────────────────

create table if not exists mercadinho.ajustes (
  id                    smallint primary key default 1 check (id = 1),
  limite_padrao         numeric(12,2) not null default 500,
  cheque_especial       boolean not null default false,
  limite_extra          numeric(12,2) not null default 0,
  bloquear_inadimplente boolean not null default false,
  dias_inadimplencia    smallint not null default 30,
  atualizado_em         timestamptz not null default now()
);
insert into mercadinho.ajustes (id) values (1) on conflict (id) do nothing;

-- Empresa principal da pessoa (quando ela tem conta em mais de uma unidade).
create table if not exists mercadinho.pessoa_unidade (
  funcionario_id bigint primary key references mercadinho.funcionarios(id) on delete cascade,
  unidade_id     uuid not null references mercadinho.unidades(id) on delete cascade,
  atualizado_em  timestamptz not null default now()
);

-- Trilha append-only. Guarda as DUAS datas: a do aparelho e a do servidor —
-- a diferença entre elas é o próprio sinal de fraude (relógio adulterado).
create table if not exists mercadinho.auditoria (
  id                bigint generated always as identity primary key,
  autor_id          uuid,                       -- null = ação do tablet
  dispositivo_id    uuid references mercadinho.dispositivos(id) on delete set null,
  acao              text not null,
  entidade          text not null,
  entidade_id       text,
  antes             jsonb,
  depois            jsonb,
  ocorrido_em_device timestamptz,
  registrado_em     timestamptz not null default now()
);
create index if not exists auditoria_data on mercadinho.auditoria (registrado_em desc);
create index if not exists auditoria_entidade on mercadinho.auditoria (entidade, entidade_id);

create or replace function mercadinho.auditoria_imutavel() returns trigger
language plpgsql as $$
begin
  raise exception 'auditoria é append-only';
end; $$;
drop trigger if exists auditoria_sem_update on mercadinho.auditoria;
create trigger auditoria_sem_update before update or delete on mercadinho.auditoria
  for each row execute function mercadinho.auditoria_imutavel();

create table if not exists mercadinho.suspeitas (
  id             bigint generated always as identity primary key,
  funcionario_id bigint references mercadinho.funcionarios(id) on delete set null,
  unidade_id     uuid references mercadinho.unidades(id) on delete set null,
  venda_id       bigint references mercadinho.vendas(id) on delete set null,
  tipo           text not null,
  detalhe        text,
  resolvida      boolean not null default false,
  criado_em      timestamptz not null default now()
);

-- Fila do worker (leitura de nota fiscal → estoque).
create table if not exists mercadinho.worker_jobs (
  id            bigint generated always as identity primary key,
  tipo          text not null,
  status        text not null default 'pendente' check (status in ('pendente','processando','ok','erro')),
  payload       jsonb,
  resultado     jsonb,
  erro          text,
  tentativas    smallint not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists worker_jobs_fila on mercadinho.worker_jobs (status, criado_em) where status = 'pendente';

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC — registrar compra (idempotente, estoque nunca negativo)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function mercadinho.registrar_compra(
  p_operacao_id    uuid,
  p_dispositivo_id uuid,
  p_funcionario_id bigint,
  p_unidade_id     uuid,          -- unidade do TABLET (de onde sai o estoque)
  p_ocorrido_em    timestamptz,
  p_hash_payload   text,
  p_itens          jsonb,         -- [{produto_id, quantidade, preco_unit}]
  p_sequencia      bigint default null
) returns table(status text, venda_id bigint, motivo text, recebido_em timestamptz)
language plpgsql security definer set search_path = mercadinho, public as $$
declare
  v_existente mercadinho.operacoes_compra%rowtype;
  v_venda_id  bigint;
  v_item      jsonb;
  v_qtd       integer;
  v_preco     numeric(12,2);
  v_custo     numeric(12,2);
  v_produto   bigint;
  v_total     numeric(12,2) := 0;
  v_furado    boolean := false;
  v_atual     integer;
  v_unid_func uuid;
begin
  -- Idempotência: mesma operação chegando de novo devolve o resultado anterior.
  select * into v_existente from mercadinho.operacoes_compra where operacao_id = p_operacao_id;
  if found then
    if v_existente.hash_payload is distinct from p_hash_payload then
      return query select 'REJEITADA'::text, v_existente.venda_id, 'payload_divergente'::text, v_existente.recebido_em;
    end if;
    return query select v_existente.status, v_existente.venda_id, v_existente.motivo, v_existente.recebido_em;
    return;
  end if;

  if not exists (select 1 from mercadinho.dispositivos where id = p_dispositivo_id and ativo) then
    return query select 'REJEITADA'::text, null::bigint, 'dispositivo_revogado'::text, now();
    return;
  end if;

  -- A DÍVIDA fica na unidade do funcionário; o ESTOQUE sai na do tablet.
  select unidade_id into v_unid_func from mercadinho.funcionarios where id = p_funcionario_id and ativo;
  if v_unid_func is null then
    return query select 'REJEITADA'::text, null::bigint, 'funcionario_inativo'::text, now();
    return;
  end if;

  insert into mercadinho.operacoes_compra(
    operacao_id, dispositivo_id, funcionario_id, unidade_id, sequencia_local, hash_payload, ocorrido_em, status
  ) values (
    p_operacao_id, p_dispositivo_id, p_funcionario_id, p_unidade_id, p_sequencia, p_hash_payload, p_ocorrido_em, 'SINCRONIZANDO'
  );

  insert into mercadinho.vendas(unidade_id, funcionario_id, pago, origem, ocorrido_em)
  values (v_unid_func, p_funcionario_id, false, 'tablet', p_ocorrido_em)
  returning id into v_venda_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_produto := (v_item->>'produto_id')::bigint;
    v_qtd     := greatest(1, coalesce((v_item->>'quantidade')::integer, 1));
    v_preco   := greatest(0, coalesce((v_item->>'preco_unit')::numeric, 0));
    select custo_padrao into v_custo from mercadinho.produtos where id = v_produto;
    v_total   := v_total + (v_qtd * v_preco);

    insert into mercadinho.venda_itens(venda_id, produto_id, quantidade, preco_unit, custo_unit)
    values (v_venda_id, v_produto, v_qtd, v_preco, v_custo);

    -- Estoque TRAVA EM ZERO. Gravar negativo violava o CHECK e a exceção
    -- desfazia a venda inteira — era o bug de "compra sumiu".
    select quantidade into v_atual from mercadinho.estoque
      where unidade_id = p_unidade_id and produto_id = v_produto for update;
    if not found then
      insert into mercadinho.estoque(unidade_id, produto_id, quantidade) values (p_unidade_id, v_produto, 0);
      v_furado := true;
    else
      if v_atual < v_qtd then v_furado := true; end if;
      update mercadinho.estoque
        set quantidade = greatest(0, v_atual - v_qtd), atualizado_em = now()
        where unidade_id = p_unidade_id and produto_id = v_produto;
    end if;

    insert into mercadinho.movimentacoes(unidade_id, produto_id, tipo, quantidade, referencia)
    values (p_unidade_id, v_produto, 'VENDA', v_qtd, 'venda ' || v_venda_id);
  end loop;

  update mercadinho.vendas set total = round(v_total, 2) where id = v_venda_id;

  insert into mercadinho.lancamentos(funcionario_id, unidade_id, tipo, valor, descricao, venda_id, operacao_id, ocorrido_em, metadados)
  values (p_funcionario_id, v_unid_func, 'compra', round(v_total, 2), 'Compra no mercadinho', v_venda_id, p_operacao_id, p_ocorrido_em,
          jsonb_build_object('estoque_furado', v_furado, 'unidade_estoque', p_unidade_id));

  if v_furado then
    insert into mercadinho.suspeitas(funcionario_id, unidade_id, venda_id, tipo, detalhe)
    values (p_funcionario_id, p_unidade_id, v_venda_id, 'venda_sem_estoque', 'Estoque insuficiente no momento da venda');
  end if;

  update mercadinho.operacoes_compra
    set venda_id = v_venda_id, estoque_furado = v_furado, status = 'SINCRONIZADA'
    where operacao_id = p_operacao_id;

  return query select 'SINCRONIZADA'::text, v_venda_id, null::text, now();
exception when others then
  update mercadinho.operacoes_compra set status = 'REVISAR', motivo = sqlerrm where operacao_id = p_operacao_id;
  return query select 'REVISAR'::text, v_venda_id, sqlerrm, now();
end; $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC — ativar tablet pelo código de 6 dígitos
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function mercadinho.ativar_dispositivo(
  p_codigo        text,
  p_token_hash    text,
  p_versao_app    text default null,
  p_instalacao_id text default null
) returns table(dispositivo_id uuid, unidade_id uuid, nome text, erro text)
language plpgsql security definer set search_path = mercadinho, public as $$
declare
  v_cod mercadinho.dispositivo_codigos%rowtype;
  v_id  uuid;
begin
  select * into v_cod from mercadinho.dispositivo_codigos where codigo = p_codigo for update;
  if not found then
    return query select null::uuid, null::uuid, null::text, 'codigo_invalido'::text; return;
  end if;
  if v_cod.usado_em is not null then
    return query select null::uuid, null::uuid, null::text, 'codigo_ja_usado'::text; return;
  end if;
  if v_cod.expira_em < now() then
    return query select null::uuid, null::uuid, null::text, 'codigo_expirado'::text; return;
  end if;

  insert into mercadinho.dispositivos(unidade_id, nome, token_hash, versao_app, instalacao_id, visto_em)
  values (v_cod.unidade_id, v_cod.nome, p_token_hash, p_versao_app, p_instalacao_id, now())
  returning id into v_id;

  update mercadinho.dispositivo_codigos set usado_em = now() where codigo = p_codigo;

  insert into mercadinho.auditoria(dispositivo_id, acao, entidade, entidade_id, depois)
  values (v_id, 'dispositivo.ativado', 'dispositivo', v_id::text,
          jsonb_build_object('unidade_id', v_cod.unidade_id, 'versao_app', p_versao_app));

  return query select v_id, v_cod.unidade_id, v_cod.nome, null::text;
end; $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Visões de leitura (o painel consome estas em vez de recalcular no app)
-- ═══════════════════════════════════════════════════════════════════════════

-- Saldo de cada funcionário direto do razão — uma fonte só de verdade.
create or replace view mercadinho.saldos as
select f.id                                   as funcionario_id,
       f.nome,
       f.unidade_id,
       coalesce(sum(l.valor), 0)::numeric(12,2) as em_aberto,
       max(l.ocorrido_em) filter (where l.tipo = 'pagamento') as ultimo_pagamento
from mercadinho.funcionarios f
left join mercadinho.lancamentos l on l.funcionario_id = f.id
group by f.id, f.nome, f.unidade_id;

-- Catálogo pronto pro tablet: preço da unidade (ou o padrão) + estoque.
create or replace view mercadinho.catalogo as
select u.id            as unidade_id,
       p.id            as produto_id,
       p.nome,
       p.codigo_barras,
       p.sem_codigo,
       p.imagem_url,
       c.nome          as categoria,
       coalesce(pr.preco, p.preco_padrao)::numeric(12,2) as preco,
       coalesce(e.quantidade, 0) as estoque,
       coalesce(e.minimo, 5)     as minimo
from mercadinho.unidades u
cross join mercadinho.produtos p
left join mercadinho.categorias c on c.id = p.categoria_id
left join mercadinho.precos  pr on pr.unidade_id = u.id and pr.produto_id = p.id
left join mercadinho.estoque e  on e.unidade_id = u.id and e.produto_id = p.id
where p.ativo and u.ativo;

-- ═══════════════════════════════════════════════════════════════════════════
-- Segurança: RLS em tudo. Sem policy = ninguém acessa via anon/authenticated.
-- As rotas /api/tridimarket/* usam service_role, que ignora RLS.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'mercadinho'
  loop
    execute format('alter table mercadinho.%I enable row level security', t);
  end loop;
end $$;

-- O PostgREST só enxerga o schema se ele estiver exposto. Depois de rodar,
-- vá em Settings → API → Exposed schemas e adicione `mercadinho`.
grant usage on schema mercadinho to anon, authenticated, service_role;
grant all on all tables in schema mercadinho to service_role;
grant all on all sequences in schema mercadinho to service_role;
grant all on all functions in schema mercadinho to service_role;

-- `grant all on all tables` alcança só o que EXISTE neste instante: tabela
-- acrescentada depois nasce sem privilégio, e o PostgREST não expõe tabela que o
-- papel não pode ler — o erro que volta é "not found in the schema cache", que a
-- tela mostra como "market_schema_missing". Foi assim que `worker_jobs` (a fila
-- da foto da nota) ficou invisível enquanto o resto do painel funcionava.
-- Com o default privileges abaixo, tabela nova já nasce visível.
alter default privileges in schema mercadinho grant all on tables    to service_role;
alter default privileges in schema mercadinho grant all on sequences to service_role;
alter default privileges in schema mercadinho grant all on functions to service_role;

-- O PostgREST guarda o schema em cache; sem o aviso ele pode seguir minutos com
-- a versão antiga depois de um grant ou de uma tabela nova.
notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- SEMENTE — cria a primeira unidade pra o sistema não nascer vazio.
-- Troque o nome antes de rodar, se quiser.
-- ═══════════════════════════════════════════════════════════════════════════
insert into mercadinho.unidades (nome, descricao)
select 'Tridi Escritório', 'Unidade criada na migração para o sistema novo'
where not exists (select 1 from mercadinho.unidades);
