-- ── Estoque: conferência da produção (CERTO ou ERRADO) ───────────────────────
-- Rode no Supabase NOVO (o mesmo do estoque_itens / ponto / recebimento).
-- Idempotente: rodar duas vezes não faz mal.
--
-- Pré-requisito: supabase/estoque_hierarquia_unidades.sql e
-- supabase/estoque_dispositivos.sql (ou estoque_ativar_este_tablet.sql) já
-- rodados — este arquivo referencia estoque_itens.id, estoque_unidades.id e
-- estende o `tipo` de estoque_operacoes, que os dois criam.
--
-- RODE O ARQUIVO INTEIRO, de uma vez. O `begin`/`commit` protege contra ficar
-- parado no meio: sem ele, uma falha a meio caminho deixaria a tabela criada
-- mas sem o índice ou sem a extensão do `check` de estoque_operacoes — mais
-- frágil que antes de começar, e em silêncio.
--
-- ⚠ O FORMATO MUDOU. A conferência era "nota de 1 a 5 + quantas aprovadas e
-- quantas recusadas"; agora é BINÁRIA, do jeito que o galpão trabalha: o
-- gerente olha a caixa e diz CERTO ou ERRADO.
--   · certo  → nasce UMA etiqueta com a quantidade que a PESSOA registrou ao
--              concluir, e o estoque recebe automaticamente;
--   · errado → não entra nada e a atividade REABRE pra refazer. O material de
--              entrada já saiu do estoque quando foi bipado no começo, então a
--              perda se contabiliza sozinha — ninguém lança nada.
-- Como esta tabela nunca chegou a existir em produção, isto é um REDESENHO do
-- arquivo pendente, não uma migração. Se você rodou a versão antiga em algum
-- banco de teste, o bloco de guarda logo abaixo te avisa e diz o que fazer.

begin;

-- Formato antigo? Resolve sozinho quando é seguro, e só para quando NÃO é.
--
-- `create table if not exists` sozinho seria o pior dos mundos: acharia a tabela
-- velha, não faria nada, e toda conferência falharia depois no INSERT (`nota` é
-- `not null` lá e o app não manda mais `nota`) — longe daqui, sem ninguém ligar
-- uma coisa na outra.
--
-- A versão anterior deste bloco mandava a pessoa rodar `drop table` à mão e
-- depois o arquivo de novo. Dois passos, e o segundo é o arquivo inteiro: o
-- reflexo natural é reexecutar o arquivo — que bate na mesma exceção. Errar
-- assim não é desatenção, é o passo escondido.
--
-- Então: tabela velha e VAZIA é apagada aqui mesmo (não há o que preservar — a
-- coluna `nota` nunca guardou uma conferência de verdade). Tabela velha COM
-- linhas para tudo e diz quantas são: apagar dado de conferência é destruir o
-- histórico de quem produziu o quê, e isso não se faz por conveniência de
-- migração.
do $$
declare
  n bigint;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'estoque_conferencias'
       and column_name = 'nota'
  ) then
    execute 'select count(*) from public.estoque_conferencias' into n;

    if n = 0 then
      drop table public.estoque_conferencias;
      raise notice 'estoque_conferencias estava no formato antigo e VAZIA: apagada e recriada abaixo no formato binário (certo/errado).';
    else
      raise exception
        'estoque_conferencias está no formato ANTIGO (coluna "nota") e tem % conferência(s) gravada(s). Não apago histórico de produção automaticamente. Confira o que há ali (select * from public.estoque_conferencias) e, se puder mesmo descartar, rode "drop table public.estoque_conferencias;" antes deste arquivo.', n;
    end if;
  end if;
end $$;

-- ── 1. Conferência ────────────────────────────────────────────────────────────
-- Um registro por "o gestor foi até a caixa e disse se estava certo". A ORIGEM
-- do trabalho é a atividade (`atividade_id`); o RESULTADO é o que entra (ou
-- não) no estoque.
--
-- `executor` e `conferido_por` são pessoas DIFERENTES por definição — quem faz
-- não confere o próprio trabalho (a rota recusa isso, ver
-- lib/estoque-conferencia.ts). Guarda os DOIS ids e os DOIS nomes: o id é a
-- verdade pra somar score (lib/estoque-qualidade.ts::scoreDe), o nome é o que
-- sobrevive se a pessoa sair da empresa e a linha do histórico continuar
-- precisando dizer quem foi — mesmo raciocínio de `para_nome`/`por_nome` em
-- `atividades` e de `baixado_por`/`criado_por` em `estoque_unidades`.
create table if not exists public.estoque_conferencias (
  id                  uuid primary key default gen_random_uuid(),
  atividade_id        uuid not null,
  item_id             uuid references public.estoque_itens(id) on delete set null,
  executor_id         uuid,            -- quem FEZ o trabalho
  executor_nome       text,
  conferido_por_id    uuid,            -- quem CONFERIU
  conferido_por_nome  text,
  -- Duas opções e só duas. Cinco notas viravam "mediano" pra tudo que não era
  -- claramente bom nem claramente ruim, e "mediano" não diz o que fazer com a
  -- caixa. Certo entra no estoque; errado volta pra bancada.
  resultado           text not null check (resultado in ('certo','errado')),
  -- Quantas peças ENTRARAM no estoque. Sempre 0 no errado.
  quantidade          int not null default 0 check (quantidade >= 0),
  -- Por que estava errado. Catálogo fechado em lib/estoque-qualidade.ts
  -- (DEFEITOS) — só faz sentido no errado, e é o que alimenta
  -- "o que mais dá errado" na ficha de quem produz.
  defeitos            text[] not null default '{}',
  obs                 text,
  -- A etiqueta que NASCEU desta conferência (a caixa pronta). Nulo no errado,
  -- e nulo também no item não serializado, que não ganha etiqueta.
  unidade_id          uuid references public.estoque_unidades(id) on delete set null,
  conferido_em        timestamptz not null default now()
);

create index if not exists estoque_conferencias_executor_idx
  on public.estoque_conferencias (executor_id, conferido_em desc);
-- A fila do tablet pergunta "esta atividade já foi conferida?" por lote de ids.
create index if not exists estoque_conferencias_atividade_idx
  on public.estoque_conferencias (atividade_id);

-- UMA APROVAÇÃO por atividade, garantido pelo banco e não só pela aplicação —
-- e reprovação à vontade.
--
-- `registrarConferencia` já procura uma aprovação existente antes de gravar
-- (ErroAtividadeJaConferida), mas essa checagem é um SELECT seguido de um
-- INSERT: entre os dois cabe a segunda requisição. Dois gestores tocando na
-- mesma caixa ao mesmo tempo — ou o reenvio da fila offline do tablet chegando
-- junto com o toque na web — gravavam duas conferências, e o estoque recebia a
-- MESMA caixa duas vezes.
--
-- O índice é PARCIAL (`where resultado = 'certo'`) por causa do refazer: o
-- errado devolve a atividade pra pessoa, e a MESMA atividade vai ser conferida
-- de novo — talvez várias vezes. Um índice único simples bloquearia justamente
-- o refazer, que é metade do ciclo. Parcial protege o que precisa ser
-- protegido (o estoque não recebe a mesma caixa duas vezes) e deixa o
-- histórico das tentativas reprovadas inteiro, que é o que conta a história.
--
-- O `drop` mantém a idempotência pra quem rodou uma versão anterior deste
-- arquivo, que criava o índice único TOTAL com este mesmo nome — `create
-- unique index if not exists` sozinho manteria o índice errado calado.
drop index if exists public.estoque_conferencias_atividade_uidx;
create unique index if not exists estoque_conferencias_atividade_uidx
  on public.estoque_conferencias (atividade_id)
  where resultado = 'certo';

alter table public.estoque_conferencias enable row level security;
-- Acesso só via service role nas rotas /api/* — RLS bloqueia o resto, mesma
-- regra do resto do domínio de estoque (ver seção 8 de
-- estoque_hierarquia_unidades.sql).

-- ── 2. `estoque_operacoes.tipo` ganha 'conferencia' ──────────────────────────
-- POST /api/estoque/device/conferencia segue O MESMO padrão de idempotência
-- por operationId de /baixa e /recebimento (estoque_operacoes, ver
-- estoque_dispositivos.sql §2) — sem esta linha, o `upsert` com
-- tipo:'conferencia' estoura o `check` antigo (só 'baixa'/'recebimento') e o
-- replay para de funcionar (a linha de idempotência nunca grava, então um
-- reenvio de rede reprocessaria a conferência inteira, gerando etiqueta e
-- somando estoque de novo).
alter table public.estoque_operacoes drop constraint if exists estoque_operacoes_tipo_check;
alter table public.estoque_operacoes add constraint estoque_operacoes_tipo_check
  check (tipo in ('baixa','recebimento','conferencia'));

commit;
