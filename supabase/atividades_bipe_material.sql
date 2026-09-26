-- ── Atividades: bipar o material pra poder começar ───────────────────────────
-- Rode no Supabase NOVO (o mesmo do estoque_itens / atividades).
-- Idempotente e ADITIVO: rodar duas vezes não faz mal, nada aqui apaga dado.
--
-- RODE O ARQUIVO INTEIRO, de uma vez.
--
-- ═══ O QUE ISTO LIGA ═════════════════════════════════════════════════════════
--
-- Hoje a pessoa toca "Aceitar" no tablet da bancada e começa. Com o interruptor
-- LIGADO, antes de aceitar ela precisa BIPAR a etiqueta do material que vai
-- usar — a folha de alavanca, a chapa, a caixa lacrada. A caixa sai do estoque
-- naquele instante (não quando ela termina), e fica amarrada à atividade por
-- `estoque_unidades.baixa_atividade_id`, que já existe.
--
-- É esse vínculo que responde a pergunta do dono: "fulano fez chancela, usou
-- tal material que ciclano fez". `estoque_unidades` guarda os dois lados —
-- `criado_por` diz quem fez a caixa, `baixa_atividade_id` diz qual atividade
-- consumiu ela.
--
-- ═══ DUAS COISAS ENTRAM ══════════════════════════════════════════════════════
--
-- 1. O INTERRUPTOR (`estoque_config.bipe_para_iniciar`). Mora na mesma linha
--    única onde já mora o interruptor da automação de reposição. Nasce
--    DESLIGADO: uma exigência nova que se liga sozinha no dia do deploy é uma
--    bancada parada de manhã sem ninguém entender por quê.
--
-- 2. O LIVRO (`atividade_bipes`). Uma linha por bipe. Ele existe porque
--    `estoque_unidades` só sabe contar o que deu certo, e o que interessa
--    saber depois é justamente o que NÃO deu:
--
--      · `desconhecida` — o leitor leu, mas o banco não conhece este código;
--      · `ja_baixada`   — outra pessoa já tinha tirado esta caixa;
--      · `dispensado`   — ninguém bipou nada e a pessoa começou assim mesmo.
--
--    A ÚLTIMA é a razão de o livro existir. Exigir o bipe sem uma saída prende
--    gente na bancada quando a etiqueta descolou, o material chegou sem
--    etiqueta ou o leitor morreu — então a saída existe e é um toque só. Mas
--    saída que não deixa rastro vira o caminho normal em duas semanas. Aqui
--    ela fica escrita, com nome, hora e motivo, e dá pra medir: se metade das
--    aberturas for dispensa, o problema não é a pessoa, é a etiquetagem.
--
-- ═══ POR QUE NÃO EXIGIMOS O MATERIAL "CERTO" ════════════════════════════════
--
-- O sistema aceita QUALQUER etiqueta e registra o que foi, em vez de conferir
-- contra uma ficha técnica. Não é preguiça — é o que o banco permite hoje:
-- `atividades.produto_nome` está preenchido em 1 de 104 linhas. Uma exigência
-- que depende de um campo vazio em 99% dos casos não recusa material errado:
-- ela recusa TUDO, e a bancada inteira cai na saída de emergência no primeiro
-- dia. Aceitar e registrar produz, em duas semanas, exatamente o dado que
-- falta pra um dia poder exigir de verdade.

begin;

-- ── 1. O interruptor ─────────────────────────────────────────────────────────
-- Na linha única de `estoque_config` (`id boolean primary key check (id)`).
-- `create table if not exists` NÃO volta pra acrescentar coluna em quem já tem
-- a tabela — por isso a coluna entra por `alter`, e a tabela é criada antes só
-- pro caso de este arquivo rodar num banco onde estoque_automacao.sql nunca
-- rodou.
create table if not exists public.estoque_config (
  id                 boolean primary key default true check (id),
  automacao_ativa    boolean not null default false,
  ultima_varredura   date,
  atualizado_em      timestamptz not null default now(),
  atualizado_por     uuid
);
insert into public.estoque_config (id) values (true) on conflict (id) do nothing;

alter table public.estoque_config
  add column if not exists bipe_para_iniciar boolean not null default false;

comment on column public.estoque_config.bipe_para_iniciar is
  'Exigir bipe da etiqueta do material antes de aceitar a atividade no tablet. Nasce desligado.';

-- ── 2. O livro ───────────────────────────────────────────────────────────────
-- SEM chave estrangeira pra `atividades` de propósito, pela mesma razão de
-- `estoque_conferencias`: o livro é histórico, e histórico não pode sumir
-- junto com a linha que o originou (nem impedir que ela seja apagada).
create table if not exists public.atividade_bipes (
  id               uuid primary key default gen_random_uuid(),
  atividade_id     uuid not null,
  -- Quem bipou. O id soma no histórico da pessoa; o NOME é o que sobrevive se
  -- ela sair da empresa e a linha continuar precisando dizer quem foi.
  colaborador_id   uuid,
  colaborador_nome text,
  -- A etiqueta lida. NULO só na dispensa — ver o check mais abaixo.
  codigo           text,
  situacao         text not null,
  -- Nome do item COMO ESTAVA no dia. Snapshot: renomear o item depois não pode
  -- reescrever o histórico.
  item             text,
  -- Peças que saíram com este bipe. A caixa lacrada de 50 conta 50, não 1.
  pecas            int not null default 0,
  -- Só na dispensa: por que começou sem bipar.
  motivo           text,
  -- Quando aconteceu NO TABLET, não quando a fila offline subiu. A bancada
  -- trabalha sem Wi-Fi e tudo sobe junto depois; gravar `now()` carimbaria a
  -- manhã inteira no segundo do flush — a mesma armadilha já vivida no ponto.
  ocorrido_em      timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

-- As colunas também por `alter`, pelo mesmo motivo do §1: quem rodar uma versão
-- futura deste arquivo com a tabela já criada não ganharia coluna nenhuma.
alter table public.atividade_bipes add column if not exists colaborador_id   uuid;
alter table public.atividade_bipes add column if not exists colaborador_nome text;
alter table public.atividade_bipes add column if not exists codigo           text;
alter table public.atividade_bipes add column if not exists item             text;
alter table public.atividade_bipes add column if not exists pecas            int not null default 0;
alter table public.atividade_bipes add column if not exists motivo           text;
alter table public.atividade_bipes add column if not exists ocorrido_em      timestamptz not null default now();

-- Vocabulário fechado, e é o MESMO de `SituacaoBaixa` (lib/estoque-baixa.ts)
-- nas três primeiras — duas escadas de nomes pro mesmo desfecho é como elas
-- divergem. Quem escreve estes valores é o servidor, nunca o tablet.
alter table public.atividade_bipes drop constraint if exists atividade_bipes_situacao_chk;
alter table public.atividade_bipes add constraint atividade_bipes_situacao_chk
  check (situacao in ('baixada', 'desconhecida', 'ja_baixada', 'dispensado'));

-- Bipe sem código não é bipe. Só a DISPENSA pode não ter etiqueta.
alter table public.atividade_bipes drop constraint if exists atividade_bipes_codigo_chk;
alter table public.atividade_bipes add constraint atividade_bipes_codigo_chk
  check (codigo is not null or situacao = 'dispensado');

alter table public.atividade_bipes drop constraint if exists atividade_bipes_pecas_chk;
alter table public.atividade_bipes add constraint atividade_bipes_pecas_chk
  check (pecas >= 0);

-- A pergunta que a tela faz é sempre "o que entrou NESTA atividade, do mais
-- recente pro mais antigo".
create index if not exists atividade_bipes_atividade_idx
  on public.atividade_bipes (atividade_id, ocorrido_em desc);

-- Acesso só via service role nas rotas /api/* — RLS bloqueia o resto.
alter table public.atividade_bipes enable row level security;

commit;


-- ── Confira (deve devolver 2 linhas, as duas `true`) ─────────────────────────
select 'interruptor do bipe' as peca, exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'estoque_config'
     and column_name = 'bipe_para_iniciar') as ok
union all
select 'livro do bipe', to_regclass('public.atividade_bipes') is not null;


-- ═════════════════════════════════════════════════════════════════════════════
--  COMO LIGAR E DESLIGAR (por enquanto, aqui mesmo)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- A tela do Estoque ainda NÃO tem o botão deste interruptor — ele nasceu no
-- banco antes de nascer na interface. Até o botão existir, é por aqui:
--
--   -- LIGAR (as bancadas passam a exigir o bipe no próximo minuto)
--   update public.estoque_config set bipe_para_iniciar = true, atualizado_em = now();
--
--   -- DESLIGAR (volta a ser um toque em "Aceitar", como hoje)
--   update public.estoque_config set bipe_para_iniciar = false, atualizado_em = now();
--
-- O tablet leva ATÉ 1 MINUTO pra obedecer: o servidor guarda a resposta por
-- 60s pra não consultar o banco a cada ciclo de cada tablet. Não é atraso de
-- rede — é de propósito, e é o que impede este booleano de virar uma consulta
-- por tablet a cada 12 segundos.
--
-- LIGUE COM UM LEITOR JÁ NA MESA. Sem leitor, o tablet mostra o aviso e a
-- pessoa cai na saída ("Não deu pra bipar") a cada ordem — funciona, mas o
-- livro enche de dispensa e o dado do primeiro mês não vale nada.
--
-- Pra ver o que aconteceu:
--
--   select situacao, count(*), coalesce(sum(pecas), 0) as pecas
--     from public.atividade_bipes
--    where ocorrido_em > now() - interval '7 days'
--    group by 1 order by 2 desc;
--
--   -- as dispensas por motivo: é isto que diz ONDE falta etiqueta no galpão
--   select motivo, count(*) from public.atividade_bipes
--    where situacao = 'dispensado' and ocorrido_em > now() - interval '7 days'
--    group by 1 order by 2 desc;
