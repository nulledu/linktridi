-- ─────────────────────────────────────────────────────────────────────────────
-- MÓDULO RH — Recursos Humanos
-- ─────────────────────────────────────────────────────────────────────────────
-- Rode no SQL Editor do Supabase. O arquivo é IDEMPOTENTE: rodar de novo não
-- apaga nada nem duplica nada, então pode reexecutar depois de cada ajuste.
--
-- TRÊS decisões que este arquivo carrega, e que não são óbvias:
--
-- 1. TABELA PRÓPRIA, NÃO COLUNA EM `employees`. O mesmo motivo que fez o
--    Financeiro criar `fin_colaboradores` em vez de pendurar salário em
--    `employees`: aquela tabela é lida pelo GATE de toda página protegida
--    (`lib/perfis.ts` → `acessoBruto`), por todo mundo, o tempo inteiro. Dado de
--    saúde, endereço e documento não podem morar na linha que o sistema abre
--    para decidir se você enxerga o menu.
--
-- 2. `rh_anamnese` É SEPARADA DE `rh_fichas`, e a separação é o ponto. A ficha
--    anamnésica é o dado mais íntimo que o sistema guarda; a chave que a abre
--    (`rh:anamnese`) não vem junto com nenhuma outra. Se ela fosse mais uma
--    coluna de `rh_fichas`, todo `select` da ficha a arrastaria junto e a
--    permissão viraria decoração — bastaria um `select *` distraído.
--
-- 3. RLS LIGADA E SEM NENHUMA POLÍTICA em todas as tabelas `rh_*`. Não é
--    descuido: é deny-all. O app inteiro lê o RH pelo `service_role` (que ignora
--    RLS por definição), então nada aqui depende de política — e quem chegar com
--    a chave `anon`, que é pública e vive no browser, não lê uma linha.
--
-- O vínculo com a pessoa é `employee_id` → `employees.id` (= `profiles.id`).
-- Sem FK declarada, igual ao `fin_colaboradores`: `employees` não é criada por
-- nenhum arquivo deste diretório (nasceu antes), e declarar a referência aqui
-- faria o arquivo falhar em ambiente novo.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ── updated_at por gatilho, nunca por lembrança ──────────────────────────────
create or replace function public.rh_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FICHA — a extensão de RH da pessoa
-- ─────────────────────────────────────────────────────────────────────────────
-- 1:1 com `employees`, e o `employee_id` é a própria PK: uma pessoa tem uma
-- ficha, e o banco é quem garante isso — não a rota.
--
-- `situacao` é a única coisa aqui que a LISTA lê. Ela existe porque
-- `profiles.active` responde outra pergunta: "essa pessoa consegue entrar no
-- sistema?". Quem está de férias entra; quem está afastado entra; os dois
-- precisam sumir da contagem de "trabalhando hoje", e nenhum dos dois é
-- desligado. Sem esta coluna a tela teria que adivinhar pelo login.
create table if not exists public.rh_fichas (
  employee_id         uuid primary key,
  situacao            text not null default 'ativo'
                        check (situacao in ('ativo', 'ferias', 'afastado', 'desligado')),
  -- Pessoais
  data_nascimento     date,
  cpf                 text,
  rg                  text,
  estado_civil        text,
  email_pessoal       text,
  -- Emergência: as duas colunas andam juntas — telefone sem nome não serve.
  contato_emergencia  text,
  telefone_emergencia text,
  -- Endereço
  cep                 text,
  logradouro          text,
  numero              text,
  complemento         text,
  bairro              text,
  cidade              text,
  uf                  text,
  observacoes         text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

-- A lista filtra por situação e a visão geral conta por ela. É o único índice
-- que esta tabela precisa: ela tem uma linha por pessoa, não por evento.
create index if not exists rh_fichas_situacao on public.rh_fichas (situacao);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DOCUMENTOS
-- ─────────────────────────────────────────────────────────────────────────────
-- `arquivo` guarda o caminho RELATIVO do armazenamento privado
-- (`/api/arquivos/<chave>`), nunca a URL do B2 — é a regra do CLAUDE.md, e ela
-- existe porque a URL assinada vence em 10 minutos: gravada no banco, o link
-- morre e ninguém entende por quê. Fica nulo enquanto o upload não existir; a
-- coluna nasce agora para o dia em que ele entrar não precisar de migração.
create table if not exists public.rh_documentos (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  tipo        text not null default 'outro'
                check (tipo in ('contrato','identidade','cpf','ctps','comprovante_residencia',
                                'titulo_eleitor','certificado','exame_admissional','exame_periodico',
                                'advertencia','rescisao','outro')),
  titulo      text not null,
  arquivo     text,
  emitido_em  date,
  validade    date,
  observacao  text,
  autor_id    uuid,
  autor_nome  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

create index if not exists rh_documentos_pessoa on public.rh_documentos (employee_id, created_at desc);
create index if not exists rh_documentos_validade on public.rh_documentos (validade) where validade is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ATESTADOS
-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela SEPARADA de documentos, e não um `tipo` a mais lá: atestado é dado de
-- saúde, tem período (não só data), abona falta e tem status de análise. Junto
-- dos outros documentos, a chave `rh:documentos` abriria diagnóstico para quem
-- só precisava conferir se o contrato estava assinado.
--
-- `dias` é gravado, não calculado na leitura: ele é o que foi ACEITO para
-- abono, que nem sempre é o tamanho do intervalo (meio período, dia já
-- descontado). A rota calcula o padrão e quem lança pode corrigir.
create table if not exists public.rh_atestados (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null,
  de           date not null,
  ate          date not null,
  dias         int  not null default 1 check (dias >= 0),
  emitido_em   date,
  cid          text,
  profissional text,
  status       text not null default 'pendente'
                 check (status in ('pendente', 'aceito', 'recusado')),
  arquivo      text,
  observacao   text,
  autor_id     uuid,
  autor_nome   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid,
  constraint rh_atestados_periodo check (ate >= de)
);

create index if not exists rh_atestados_pessoa on public.rh_atestados (employee_id, de desc);
create index if not exists rh_atestados_status on public.rh_atestados (status, de desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. FÉRIAS
-- ─────────────────────────────────────────────────────────────────────────────
-- O período AQUISITIVO (os 12 meses que dão direito) fica separado do período
-- de GOZO porque um aquisitivo pode virar dois ou três gozos. Guardar só as
-- datas de saída faria "quantos dias ainda tem" virar adivinhação.
create table if not exists public.rh_ferias (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null,
  aquisitivo_de  date,
  aquisitivo_ate date,
  de             date not null,
  ate            date not null,
  dias           int  not null default 0 check (dias >= 0),
  status         text not null default 'programada'
                   check (status in ('programada', 'em_gozo', 'concluida', 'cancelada')),
  observacao     text,
  autor_id       uuid,
  autor_nome     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid,
  constraint rh_ferias_periodo check (ate >= de)
);

create index if not exists rh_ferias_pessoa on public.rh_ferias (employee_id, de desc);
-- O calendário do RH (fase 3) vai varrer por DATA, sem saber de quem: quem está
-- fora neste mês. Sem este índice essa consulta vira varredura da tabela toda.
create index if not exists rh_ferias_janela on public.rh_ferias (de, ate) where status <> 'cancelada';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. FICHA ANAMNÉSICA
-- ─────────────────────────────────────────────────────────────────────────────
-- `dados jsonb` e não vinte colunas, de propósito: o pedido é que a empresa
-- possa incluir campos conforme a necessidade, e cada campo novo como coluna
-- seria um arquivo de SQL e um deploy. O formato dos campos vive no código
-- (`lib/rh/anamnese.ts`), que é onde ele pode mudar sem migração.
--
-- Uma linha por pessoa, chave primária no `employee_id`: histórico de saúde não
-- é lista de eventos, é o estado declarado hoje. Quem mudou o quê fica no
-- `rh_historico`, sem o conteúdo.
create table if not exists public.rh_anamnese (
  employee_id         uuid primary key,
  dados               jsonb not null default '{}'::jsonb,
  atualizado_em       timestamptz,
  atualizado_por      uuid,
  atualizado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. HISTÓRICO — a linha do tempo do colaborador
-- ─────────────────────────────────────────────────────────────────────────────
-- `titulo` e `detalhe` chegam PRONTOS de quem gravou, e a leitura nunca os
-- remonta. É o mesmo motivo do `alterado_por_nome` de `permissoes_historico`:
-- se a tela reescrevesse a frase a partir do `tipo` e dos ids, renomear um
-- cargo reescreveria o passado — e o histórico existe justamente para dizer
-- como as coisas eram.
--
-- `dados jsonb` guarda o de/para cru (`{"de":"Auxiliar","para":"Encarregado"}`)
-- para quando alguém precisar auditar de verdade.
create table if not exists public.rh_historico (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  tipo        text not null default 'nota'
                check (tipo in ('admissao','cargo','setor','situacao','cadastro','documento',
                                'atestado','ferias','anamnese','desligamento','nota')),
  titulo      text not null,
  detalhe     text,
  dados       jsonb not null default '{}'::jsonb,
  autor_id    uuid,
  autor_nome  text,
  created_at  timestamptz not null default now()
);

create index if not exists rh_historico_pessoa on public.rh_historico (employee_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. GATILHOS DE updated_at
-- ─────────────────────────────────────────────────────────────────────────────
-- Em laço com `drop trigger if exists` antes: o Postgres não tem
-- `create or replace trigger`, então sem o drop o arquivo deixa de ser
-- re-rodável na segunda execução.
do $$
declare t text;
begin
  foreach t in array array['rh_fichas','rh_documentos','rh_atestados','rh_ferias','rh_anamnese'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.rh_touch()',
      t || '_touch', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. FICHA PARA QUEM JÁ ESTÁ NA EMPRESA
-- ─────────────────────────────────────────────────────────────────────────────
-- Toda pessoa ativa nasce com ficha em 'ativo'; quem está com o login desligado
-- nasce 'desligado'. Sem isto a lista abriria com a situação em branco para a
-- equipe inteira e alguém teria que carimbar 40 fichas na mão.
--
-- `on conflict do nothing`: rodar de novo não mexe em quem já foi classificado.
insert into public.rh_fichas (employee_id, situacao)
select e.id, case when coalesce(p.active, true) then 'ativo' else 'desligado' end
  from public.employees e
  join public.profiles p on p.id = e.id
on conflict (employee_id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RLS — deny-all
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['rh_fichas','rh_documentos','rh_atestados','rh_ferias','rh_anamnese','rh_historico'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. OPCIONAL — quem herda o RH de Pessoas
-- ─────────────────────────────────────────────────────────────────────────────
-- NÃO RODE NO ESCURO. A regra do módulo é que ninguém recebe o RH por tabela,
-- nem por ter tido Pessoas antes: o superusuário abre a porta pessoa a pessoa,
-- pela grade. Este bloco existe só para o caso de a equipe que já cuidava do
-- ponto precisar continuar trabalhando no primeiro dia.
--
-- Troque a lista de usernames, tire o comentário e rode. O `||` MESCLA no mapa
-- existente em vez de substituí-lo: um `=` cru apagaria todas as outras áreas
-- da pessoa e ela perderia o sistema inteiro.
--
-- O que este bloco concede é o MÍNIMO de trabalho: ver, ponto e banco de horas.
-- Documento, atestado, férias e ficha anamnésica ficam de fora de propósito —
-- cada um é uma decisão separada, na ficha da pessoa.
--
-- update public.employees e
--    set permissoes = coalesce(e.permissoes, '{}'::jsonb) || jsonb_build_object(
--          'rh', true,
--          'rh:ver', true,
--          'rh:ponto', true,
--          'rh:banco_horas', true),
--        updated_at = now()
--   from public.profiles p
--  where p.id = e.id
--    and p.username in ('troque', 'pelos', 'usernames');

-- Fim. Rode de novo à vontade.
