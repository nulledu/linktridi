-- ═════════════════════════════════════════════════════════════════════════════
--  ESTOQUE · IMPRESSÃO LIVRE — a fila que faz o papel sair no galpão
-- ═════════════════════════════════════════════════════════════════════════════
--
--  O PROBLEMA QUE ESTA TABELA RESOLVE
--
--  A impressora térmica está pareada por BLUETOOTH no tablet do galpão. O
--  navegador do escritório não alcança ela — não existe caminho direto, e não é
--  questão de permissão do navegador: é que o rádio está do outro lado do
--  prédio, emparelhado com outro aparelho.
--
--  Então o trabalho de impressão vira DADO. O escritório compõe a etiqueta,
--  grava aqui, e o tablet a busca no mesmo ciclo de sincronização que ele já
--  faz (`EstoqueSyncWorker`, a cada ~15 min). Nenhuma rota nova é chamada em
--  ritmo nenhum: os trabalhos descem anexados ao bootstrap que já descia.
--
--  ── POR QUE O DESTINO É EXPLÍCITO (dispositivo_id NOT NULL) ─────────────────
--
--  Poderia ser "qualquer tablet imprime". Não é, e a razão é física: com dois
--  aparelhos no galpão, "qualquer um" significa que os dois podem pegar o mesmo
--  trabalho no mesmo minuto — e o resultado é a etiqueta saindo duas vezes, em
--  duas impressoras, em dois cantos. Quem manda imprimir sabe onde quer o
--  papel; a tela pergunta.
--
--  Isso também é o que deixa a tela dizer a verdade ANTES do clique: ela mostra
--  quando aquele tablet foi visto pela última vez. Mandar imprimir num aparelho
--  desligado há três dias é um erro que se evita olhando, não explicando depois.
--
--  ── POR QUE NÃO SAI DUAS VEZES ──────────────────────────────────────────────
--
--  O caso perigoso não é o reenvio da web: é o tablet imprimir e a CONFIRMAÇÃO
--  se perder na volta. Aí o trabalho continua `fila` aqui, desce de novo no
--  ciclo seguinte, e sairia um segundo papel.
--
--  A trava mora no APARELHO, e é o espelho do que `estoque_operacoes` faz pro
--  resto do módulo: lá o servidor guarda a operação pra não processar duas
--  vezes; aqui o tablet guarda o ID DO TRABALHO pra não imprimir duas vezes.
--  Trabalho que ele já conhece é ignorado na entrada, mesmo que o servidor o
--  ofereça de novo — e ele volta a tentar confirmar, que é o que de fato faltou.
--
--  ── O QUE ENVELHECE ─────────────────────────────────────────────────────────
--
--  Nada aqui apaga sozinho e NÃO existe rotina agendada. A validade é um FILTRO
--  DE LEITURA (6 horas, ver VALIDADE_HORAS em lib/estoque-impressao-livre.ts):
--  trabalho velho simplesmente não é mais entregue, e a tela o mostra como
--  "expirou sem imprimir". Expiração que depende de cron é expiração que para
--  de acontecer no dia em que o cron falha, sem ninguém notar.
--
--  IDEMPOTENTE e ADITIVO: rodar duas vezes não faz mal, nada aqui apaga dado.
--  O código FUNCIONA SEM ISTO — enquanto ninguém rodar, a tela de composição
--  abre, a prévia desenha, a FOLHA A4 imprime normalmente, e só o botão "mandar
--  pro tablet" avisa em português o que falta rodar.
--
--  Este arquivo também está no consolidado (supabase/estoque_pendente_tudo.sql,
--  §10). Rodar os dois não faz mal — é o mesmo SQL.

begin;

-- `estoque_dispositivos` vem de supabase/estoque_dispositivos.sql; repetida
-- aqui com `if not exists` só pra este arquivo poder rodar sozinho num banco
-- que ainda não tem o leitor do galpão configurado.
create table if not exists public.estoque_dispositivos (
  id              uuid primary key default gen_random_uuid(),
  nome            text,
  codigo_ativacao text
);

create table if not exists public.estoque_impressao_trabalhos (
  id              uuid primary key default gen_random_uuid(),

  -- ON DELETE CASCADE: tirar um tablet do ar leva junto a fila DELE. Não há
  -- pra onde reapontar — o trabalho existia porque alguém queria papel naquela
  -- impressora, e ela foi embora com o aparelho.
  dispositivo_id  uuid not null references public.estoque_dispositivos(id) on delete cascade,

  -- Como o trabalho aparece na fila. Vem da primeira linha quando ninguém deu
  -- um nome (ver `tituloDoTrabalho`) — a fila tem que ser legível pra quem
  -- mandou, e "trabalho #4" não é.
  titulo          text not null default '',

  -- As linhas, o código de barras e a altura. `jsonb` e não colunas porque o
  -- formato é do COMPOSITOR, não do banco: o dia em que a etiqueta ganhar
  -- alinhamento ou uma linha de moldura, não deve exigir migração de schema
  -- num banco que o dono roda à mão. O teto de tamanho é da aplicação
  -- (6 linhas × 120 caracteres), e ele existe porque isto viaja no bootstrap
  -- de todo tablet.
  conteudo        jsonb not null,

  copias          int not null default 1,

  -- `fila` → o tablet ainda não pegou. `impresso` → saiu no papel e ele
  -- confirmou. `falhou` → ele tentou e não deu (sem impressora escolhida,
  -- Bluetooth fora, ou o trabalho não passou na validação DELE). `cancelado` →
  -- alguém desistiu antes de o tablet pegar.
  --
  -- `expirado` NÃO é um valor gravado: é calculado na leitura pelo tempo. Ver
  -- `statusVisivel` em lib/estoque-impressao-livre.ts.
  status          text not null default 'fila',

  -- A frase do que deu errado, do jeito que o tablet contou. É o que aparece na
  -- fila do escritório — "o tablet não conseguiu" sem o motivo obriga alguém a
  -- atravessar o galpão pra descobrir que faltava papel.
  detalhe         text,

  criado_por      uuid,
  criado_por_nome text,
  criado_em       timestamptz not null default now(),
  resolvido_em    timestamptz
);

-- Os limites são os MESMOS da aplicação, e estão repetidos aqui porque o banco
-- é a última linha: a tela valida, a rota valida, e um `insert` por qualquer
-- outro caminho ainda não pode enfileirar 30 vias de uma etiqueta.
alter table public.estoque_impressao_trabalhos
  drop constraint if exists estoque_impressao_trabalhos_status_chk;
alter table public.estoque_impressao_trabalhos
  add constraint estoque_impressao_trabalhos_status_chk
  check (status in ('fila', 'impresso', 'falhou', 'cancelado'));

alter table public.estoque_impressao_trabalhos
  drop constraint if exists estoque_impressao_trabalhos_copias_chk;
alter table public.estoque_impressao_trabalhos
  add constraint estoque_impressao_trabalhos_copias_chk
  check (copias between 1 and 3);

-- Índice PARCIAL, e é a consulta que mais roda: o tablet pergunta "o que está
-- na MINHA fila?" a cada ciclo, de cada aparelho, para sempre. Indexar as
-- linhas já impressas seria pagar índice pelo que ninguém pergunta — elas só
-- são lidas pela tela do escritório, que é uma pessoa de vez em quando.
create index if not exists estoque_impressao_trabalhos_fila_idx
  on public.estoque_impressao_trabalhos (dispositivo_id, criado_em)
  where status = 'fila';

-- A fila que a TELA mostra: tudo, do mais novo pro mais velho.
create index if not exists estoque_impressao_trabalhos_recentes_idx
  on public.estoque_impressao_trabalhos (criado_em desc);

alter table public.estoque_impressao_trabalhos enable row level security;

commit;
