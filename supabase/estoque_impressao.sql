-- ═════════════════════════════════════════════════════════════════════════════
--  ESTOQUE · IMPRESSÃO — a etiqueta deixa de ser ajuste de cada aparelho
-- ═════════════════════════════════════════════════════════════════════════════
--
--  Duas coisas, e as duas nasceram do mesmo pedido do dono:
--
--   (1) A ALTURA da etiqueta e quantas CÓPIAS saem de cada uma passam a ser
--       decisão do escritório, gravadas aqui e descidas pro tablet pelo
--       bootstrap. Antes moravam só no DataStore de cada tablet: dois
--       aparelhos no mesmo galpão imprimiam tiras de tamanhos diferentes e
--       ninguém tinha como saber, porque o ajuste estava dentro do modo totem.
--
--       O que NÃO desce, de propósito: a FOLGA DA GUILHOTINA e qual impressora
--       Bluetooth usar. Os dois dependem da lâmina e do rádio DAQUELE aparelho
--       — travá-los do escritório seria decidir por um hardware que o
--       escritório não está olhando. Ver o comentário de `ConfigImpressora.kt`.
--
--   (2) O TIPO da etiqueta vira propriedade do ITEM. Hoje o selo com a
--       quantidade é desenhado quando o número passa de 1, e só por isso — o
--       que faz uma caixa de chancelas com UMA chancela dentro sair sem selo,
--       como se fosse peça avulsa. Uma caixa com 1 continua sendo uma caixa;
--       uma chapa nunca é.
--
--  IDEMPOTENTE e ADITIVO: nada aqui apaga dado, e rodar duas vezes não faz mal.
--  O código FUNCIONA SEM ISTO — enquanto ninguém rodar, a tela de impressão
--  mostra os padrões, avisa em português que ainda não dá pra salvar, e a
--  etiqueta sai exatamente como sai hoje.
--
--  Este arquivo também está no consolidado (supabase/estoque_pendente_tudo.sql,
--  §8). Rodar os dois não faz mal — é o mesmo SQL.

begin;

-- `estoque_config` já existe desde supabase/estoque_automacao.sql; repetido
-- aqui só pra este arquivo poder ser rodado sozinho. `id boolean primary key
-- check (id)` é o truque que garante UMA linha só.
create table if not exists public.estoque_config (
  id                 boolean primary key default true check (id),
  automacao_ativa    boolean not null default false,
  ultima_varredura   date,
  atualizado_em      timestamptz not null default now(),
  atualizado_por     uuid
);
insert into public.estoque_config (id) values (true) on conflict (id) do nothing;

-- ── A configuração de impressão do galpão ────────────────────────────────────
--
-- Os limites do `check` são os MESMOS do layout da etiqueta
-- (EtiquetaLayout.ALTURA_MINIMA_MM / ALTURA_MAXIMA_MM). Estão repetidos aqui de
-- propósito: a tela valida, a API valida, e o banco é a última linha — um
-- `update` vindo de qualquer outro caminho não pode gravar uma altura em que a
-- barra do código não é mais legível.
alter table public.estoque_config
  add column if not exists etiqueta_altura_mm       int not null default 15,
  add column if not exists etiqueta_largura_mm      int not null default 72,
  add column if not exists etiqueta_copias          int not null default 1,
  add column if not exists etiqueta_atualizado_em   timestamptz,
  add column if not exists etiqueta_atualizado_por  uuid;

alter table public.estoque_config drop constraint if exists estoque_config_etiqueta_altura_chk;
alter table public.estoque_config add constraint estoque_config_etiqueta_altura_chk
  check (etiqueta_altura_mm between 10 and 80);

-- A LARGURA é a área IMPRIMÍVEL em mm — o que a cabeça térmica de fato alcança,
-- e não a bobina. A diferença é o erro caro: um rolo de 80mm tem ~72mm
-- imprimíveis (4mm de cada borda a cabeça não toca) e um de 58mm tem ~48mm.
-- Guardar "80" e descontar 8 daria a resposta errada pro rolo de 58, onde o
-- desconto é 10. Guardando o que vira TINTA, a conta é uma só.
--
-- 72 é o teto e não é escolha: é esta cabeça. Pedir 90 não imprime 90 — o
-- excedente simplesmente não sai, em silêncio, e quem descobre é o papel.
alter table public.estoque_config drop constraint if exists estoque_config_etiqueta_largura_chk;
alter table public.estoque_config add constraint estoque_config_etiqueta_largura_chk
  check (etiqueta_largura_mm between 25 and 72);

-- Teto de 3 cópias, e não "quantas quiser": cada cópia é uma tira de papel por
-- etiqueta, então um 30 digitado sem querer vira 30× o rolo num recebimento de
-- 40 peças. Três cobre o caso real (uma na caixa, uma na ficha da prateleira,
-- uma no romaneio) e não cobre o acidente.
alter table public.estoque_config drop constraint if exists estoque_config_etiqueta_copias_chk;
alter table public.estoque_config add constraint estoque_config_etiqueta_copias_chk
  check (etiqueta_copias between 1 and 3);

-- ── Quais campos vão IMPRESSOS ───────────────────────────────────────────────
--
-- O tamanho da etiqueta já era ajuste; o conteúdo dela não. Um galpão que não
-- usa prateleira numerada imprimia a linha do detalhe vazia, e um que refaz a
-- etiqueta toda semana não tinha uso pra data.
--
-- GUARDA-SE O QUE ESTÁ DESLIGADO, não o que está ligado, e isso é o desenho e
-- não uma preferência de estilo: no dia em que a etiqueta ganhar um campo novo,
-- ele nasce LIGADO em todo banco que já tem esta linha gravada. Guardando a
-- lista positiva, o campo novo nasceria desligado em cada instalação existente
-- — invisível, sem erro nenhum, e com a conclusão de que "a atualização não
-- veio". O default '{}' é, por construção, a etiqueta que o galpão imprime hoje.
--
-- As chaves são as MESMAS strings do servidor (lib/estoque-etiqueta-config.ts)
-- e do app do tablet (EtiquetaLayout.CampoEtiqueta) — um mapa de tradução entre
-- as três seria a quarta coisa a manter em dia, e a primeira a divergir.
--
-- O nome, as barras e o selo da caixa NÃO estão aqui: os dois primeiros são a
-- etiqueta, e o selo é o único número que ninguém confere sem romper o lacre.
alter table public.estoque_config
  add column if not exists etiqueta_ocultos text[] not null default '{}';

-- O banco é a última linha, como nos limites de altura e largura: a tela
-- valida, a API responde 400 com a frase, e um `update` por qualquer outro
-- caminho ainda não pode gravar um campo que a etiqueta não tem. Chave errada
-- gravada aqui sumiria na leitura seguinte (o servidor descarta o que não
-- conhece) e a pessoa concluiria que a tela não salva.
alter table public.estoque_config drop constraint if exists estoque_config_etiqueta_ocultos_chk;
alter table public.estoque_config add constraint estoque_config_etiqueta_ocultos_chk
  check (etiqueta_ocultos <@ array['cor_dimensoes','data_responsavel','codigo_legivel','local_detalhe']::text[]);

-- ── O tipo da etiqueta, no ITEM ──────────────────────────────────────────────
--
-- 'unica' = a peça avulsa (chapa, folha, perfil): não escreve quantidade.
-- 'caixa' = o lacre/conjunto (caixa de chancelas): escreve quantas peças tem
--           dentro, SEMPRE, inclusive quando é 1.
--
-- O default é 'unica' e é ele que dispensa preencher os 192 itens à mão:
-- 'unica' reproduz exatamente o que a etiqueta já faz hoje (selo só quando
-- passa de 1), então nada muda de aparência enquanto ninguém escolher nada. O
-- trabalho manual fica no punhado de itens que de fato vêm em caixa.
--
-- Nulo é aceito pelo `check` (é o que o Postgres faz com `in`) e o código lê
-- nulo como 'unica' — ver `tipoDeEtiqueta` em lib/estoque-etiqueta.ts.
alter table public.estoque_itens
  add column if not exists etiqueta_tipo text default 'unica';

alter table public.estoque_itens drop constraint if exists estoque_itens_etiqueta_tipo_chk;
alter table public.estoque_itens add constraint estoque_itens_etiqueta_tipo_chk
  check (etiqueta_tipo is null or etiqueta_tipo in ('unica', 'caixa'));

-- O tablet pergunta "quais SKUs são caixa?" no bootstrap, e a resposta é este
-- índice: só as linhas que fogem do padrão entram, então ele é minúsculo e a
-- consulta não varre o catálogo. Parcial de propósito — indexar 192 linhas
-- 'unica' pra achar 5 'caixa' seria pagar índice pelo que não se pergunta.
create index if not exists estoque_itens_etiqueta_caixa_idx
  on public.estoque_itens (sku)
  where etiqueta_tipo = 'caixa';

commit;
