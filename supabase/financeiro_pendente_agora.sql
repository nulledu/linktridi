-- ═════════════════════════════════════════════════════════════════════════════
--  FINANCEIRO — O QUE FALTA RODAR
-- ═════════════════════════════════════════════════════════════════════════════
--
--  Os três arquivos ainda não aplicados, na ordem. Rode tudo de uma vez.
--
--  Seguro rodar mesmo que algum já tenha sido aplicado: nada aqui apaga dado,
--  só cria o que falta. O código funciona SEM eles (é tolerante à ausência) —
--  o que muda é o que cada um destrava:
--
--    1. A foto do banco chega na tela (a view não devolvia logo_url)
--    2. O bem ganha foto
--    3. Recorrência de valor variável (luz, água, cartão)
--
--  A conferência no fim diz, linha por linha, o que entrou.
-- ═════════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  1/3  A foto do banco chega na tela (a view não devolvia logo_url)      ║
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


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  2/3  O bem ganha foto                                                  ║
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


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  3/3  Recorrência de valor variável (luz, água, cartão)                 ║
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


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  CONFERÊNCIA — tudo tem de vir `ok`                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

with esperado(o_que, existe) as (values
  ('view devolve a marca da conta',
    (select count(*) from information_schema.columns
      where table_schema='public' and table_name='fin_contas_saldo'
        and column_name in ('logo_url','icone')) = 2),
  ('patrimônio aceita foto',
    (select count(*) from information_schema.columns
      where table_schema='public' and table_name='fin_patrimonio'
        and column_name in ('logo_url','icone')) = 2),
  ('recorrência sabe que varia',
    (select count(*) from information_schema.columns
      where table_schema='public' and table_name='fin_recorrencias'
        and column_name='valor_variavel') = 1),
  ('tabela de valores por mês',
    (select count(*) from information_schema.tables
      where table_schema='public' and table_name='fin_recorrencia_valores') = 1)
)
select o_que, case when existe then 'ok' else 'FALTA' end as situacao
  from esperado order by situacao, o_que;

-- E o efeito imediato: quantas contas passam a mostrar a foto.
select count(*) as bancos_com_foto_visivel
  from public.fin_contas_saldo where logo_url is not null;
