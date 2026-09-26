-- ═════════════════════════════════════════════════════════════════════════════
--  ESTOQUE — TUDO QUE FALTA RODAR, NUM ARQUIVO SÓ
-- ═════════════════════════════════════════════════════════════════════════════
--
--  Cole isto inteiro no SQL Editor do Supabase e rode UMA VEZ.
--
--  Junta DEZ arquivos que se acumularam em supabase/ e precisavam ser rodados
--  na ordem certa. Eles continuam existindo separados (é onde mora a explicação
--  longa de cada um); este aqui é só a fila montada, pra não sobrar a chance de
--  rodar o §3 antes do §1 e ver um erro que não é erro nenhum:
--
--    §1  estoque_automacao.sql          — interruptor da automação
--    §2  estoque_conferencias.sql       — conferência CERTO ou ERRADO
--    §3  estoque_sku_unico.sql          — SKU não colide
--    §4  estoque_recebimento_v3.sql     — compra fala a língua do catálogo novo
--    §5  estoque_device_seguranca.sql   — código do tablet pode ter prazo
--    §6  estoque_hierarquia_unidades.sql — a etiqueta vira CAIXA (peças por etiqueta)
--    §7  estoque_faxina_organizar.sql   — o mutirão anota o que é e deixa rastro
--    §8  estoque_impressao.sql          — a impressão é do escritório, e a
--                                         etiqueta tem DOIS tipos (peça/caixa)
--    §9  recebimento_v4.sql             — chegou ≠ está no estoque: a caixa
--                                         parada no corredor deixa de contar
--    §10 estoque_impressao_livre.sql    — a fila que leva texto e código de
--                                         barras do escritório até a térmica
--    §11 atividades_bipe_material.sql   — bipar o material pra poder começar
--                                         a atividade (e o rastro de quem não
--                                         conseguiu bipar)
--    §13 estoque_fornecedor_do_financeiro.sql — o fornecedor passa a ser UM só,
--                                         o do Financeiro (roda DEPOIS de
--                                         financeiro.sql)
--    §12 atividades_genealogia.sql      — o índice que falta pra perguntar
--                                         "de onde veio esta peça" sem varrer
--                                         a tabela de conferências inteira
--
--  O §6 vem de um arquivo que você JÁ RODOU: são as colunas novas de
--  `estoque_unidades` e a recontagem, que agora SOMA peças em vez de contar
--  etiquetas. Sem ele, uma caixa de 50 folhas conta como 1 no estoque.
--
--  Tudo é IDEMPOTENTE e ADITIVO: nada aqui apaga dado. Rodar duas vezes não faz
--  mal. O único `drop` é de um `check` que volta na linha seguinte, dentro da
--  mesma transação.
--
--  O sistema JÁ RODA sem isto — todas as telas degradam sozinhas quando a tabela
--  não existe. O que muda ao rodar:
--    · a conferência passa a existir (hoje ela não grava nada);
--    · a etiqueta passa a poder valer várias peças (a caixa lacrada);
--    · o interruptor da automação passa a guardar o estado;
--    · a compra passa a registrar fornecedor e lugar de verdade;
--    · /fotos-estoque ganha o campo da NOTA e passa a guardar quem mexeu.
--      (a LOCALIZAÇÃO já funciona lá sem isto — ela usa `estoque_locais`, que
--       existe desde o arquivo da hierarquia.)
--    · a altura da etiqueta passa a ser decidida no escritório (e o tablet
--      obedece), e a caixa de UMA peça passa a poder dizer que é caixa.
--    · o escritório passa a poder MANDAR IMPRIMIR no galpão — texto livre e
--      código de barras personalizado saem na térmica do tablet. (A folha A4
--      do navegador já funciona sem isto.)
--    · a bancada passa a poder EXIGIR o bipe do material antes de aceitar a
--      atividade, e o que a pessoa bipou (ou por que não conseguiu bipar) fica
--      registrado. O interruptor nasce DESLIGADO — nada muda no dia em que
--      este arquivo roda.
--
--  Conferido em 12/08/2026 contra o banco: nenhum SKU duplicado hoje, então o
--  índice único do §3 aplica limpo. Se algum dia falhar ali, ache o par com:
--    select upper(sku), count(*), array_agg(nome) from public.estoque_itens
--     where sku is not null group by 1 having count(*) > 1;
-- ═════════════════════════════════════════════════════════════════════════════


-- ── §1 · Interruptor da automação de reposição ───────────────────────────────
-- `id boolean primary key check (id)` é o truque que garante UMA linha só: só
-- existe um valor possível pra chave, então não existe "qual configuração usar".
begin;

create table if not exists public.estoque_config (
  id                 boolean primary key default true check (id),
  automacao_ativa    boolean not null default false,
  ultima_varredura   date,
  atualizado_em      timestamptz not null default now(),
  atualizado_por     uuid
);

-- Nasce DESLIGADA de propósito: automação que cria atividade pra outra pessoa
-- não se liga sozinha. Quem liga é humano, pela aba "Produção do dia".
insert into public.estoque_config (id) values (true) on conflict (id) do nothing;

alter table public.estoque_config enable row level security;

commit;


-- ── §2 · Conferência: CERTO ou ERRADO ────────────────────────────────────────
-- Um registro por "o gestor foi até a caixa e disse se estava certo".
--
--   · certo  → nasce UMA etiqueta com a quantidade que a PESSOA registrou ao
--              concluir, e o estoque recebe automaticamente;
--   · errado → não entra nada e a atividade REABRE pra refazer. O material de
--              entrada já saiu do estoque quando foi bipado no começo do
--              trabalho, então a perda se contabiliza sozinha.
--
-- `executor` e `conferido_por` são pessoas DIFERENTES por definição — quem faz
-- não confere o próprio trabalho. Guarda os DOIS ids e os DOIS nomes: o id soma
-- o score, o nome é o que sobrevive se a pessoa sair da empresa e a linha do
-- histórico continuar precisando dizer quem foi.
begin;

-- Formato antigo (nota de 1 a 5)? Resolve sozinho quando é seguro.
--
-- `create table if not exists` sozinho seria o pior dos mundos: acharia a
-- tabela velha, não faria nada, e toda conferência falharia depois no INSERT
-- (`nota` é `not null` lá e o app não manda mais `nota`) — longe daqui.
--
-- A versão anterior mandava rodar `drop table` à mão e depois este arquivo de
-- novo. Dois passos, e o segundo é o arquivo inteiro: o reflexo é reexecutar o
-- arquivo, que bate na mesma exceção. O passo escondido era o defeito.
--
-- Velha e VAZIA: apagada aqui mesmo — `nota` nunca guardou conferência de
-- verdade. Velha COM linhas: para tudo e diz quantas são, porque apagar isso é
-- destruir o histórico de quem produziu o quê.
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
        'estoque_conferencias está no formato ANTIGO (coluna "nota") e tem % conferência(s) gravada(s). Não apago histórico de produção automaticamente. Confira (select * from public.estoque_conferencias) e, se puder descartar, rode "drop table public.estoque_conferencias;" antes deste arquivo.', n;
    end if;
  end if;
end $$;

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
  quantidade          int not null default 0 check (quantidade >= 0),  -- o que ENTROU (0 no errado)
  defeitos            text[] not null default '{}',                    -- por que estava errado
  obs                 text,
  unidade_id          uuid references public.estoque_unidades(id) on delete set null,  -- a caixa que nasceu
  conferido_em        timestamptz not null default now()
);

create index if not exists estoque_conferencias_executor_idx
  on public.estoque_conferencias (executor_id, conferido_em desc);
create index if not exists estoque_conferencias_atividade_idx
  on public.estoque_conferencias (atividade_id);

-- UMA APROVAÇÃO por atividade, garantido pelo BANCO e não só pela aplicação —
-- e reprovação à vontade.
--
-- `registrarConferencia` já procura uma aprovação existente antes de gravar,
-- mas isso é um SELECT seguido de um INSERT: entre os dois cabe a segunda
-- requisição. Dois gestores tocando na mesma caixa ao mesmo tempo — ou o
-- reenvio da fila offline do tablet chegando junto com o toque na web —
-- gravavam duas conferências, e o estoque recebia a MESMA caixa duas vezes.
--
-- O índice é PARCIAL (`where resultado = 'certo'`) por causa do refazer: o
-- errado devolve a atividade pra pessoa, e a MESMA atividade vai ser conferida
-- de novo. Um índice único total bloquearia justamente o refazer, que é metade
-- do ciclo. Parcial protege o estoque e deixa o histórico das tentativas
-- reprovadas inteiro.
--
-- O `drop` mantém a idempotência pra quem já rodou uma versão anterior deste
-- arquivo, que criava o índice único TOTAL com este mesmo nome.
drop index if exists public.estoque_conferencias_atividade_uidx;
create unique index if not exists estoque_conferencias_atividade_uidx
  on public.estoque_conferencias (atividade_id)
  where resultado = 'certo';

alter table public.estoque_conferencias enable row level security;

-- `estoque_operacoes.tipo` ganha 'conferencia'. Sem esta linha o `upsert` de
-- idempotência estoura o check antigo (só 'baixa'/'recebimento') e o replay para
-- de funcionar — um reenvio de rede reprocessaria a conferência inteira,
-- gerando etiqueta e somando estoque de novo.
alter table public.estoque_operacoes drop constraint if exists estoque_operacoes_tipo_check;
alter table public.estoque_operacoes add constraint estoque_operacoes_tipo_check
  check (tipo in ('baixa','recebimento','conferencia'));

commit;


-- ── §3 · SKU não colide ──────────────────────────────────────────────────────
-- O código de CADA etiqueta física nasce do SKU ('<SKU>-<seq 6 dígitos>') e
-- `estoque_unidades.codigo` é UNIQUE global. Dois itens com o mesmo SKU calculam
-- cada um o seu `max(seq)`, montam o MESMO código, e o segundo bate na UNIQUE —
-- a tela acusa "duas gerações ao mesmo tempo, tente de novo", e tentar de novo
-- nunca resolve, porque a causa é a duplicata e ela é permanente.
--
-- `upper(...)` porque caixa não conta na prateleira e a rota compara com ilike.
-- Item sem SKU fica de fora (partial index) — muitos itens legítimos não têm um.
create unique index if not exists estoque_itens_sku_uniq
  on public.estoque_itens (upper(sku))
  where sku is not null;


-- ── §4 · A compra fala a língua do catálogo novo ─────────────────────────────
-- Três buracos: o recebimento criava item com o eixo morto `tipo` e sem
-- `hierarquia` (item assim não aparece em nenhuma das 8 abas do Catálogo e nem
-- gera SKU); fornecedor era texto solto mesmo existindo a tabela, e lugar não
-- existia em campo nenhum (por isso a aba Localização mostrava "0 itens" em toda
-- prateleira depois de receber); e quando o lançamento falhava a compra virava
-- "Recebido e lançado" do mesmo jeito, sem ninguém reconferir.
alter table public.compras add column if not exists fornecedor_id uuid
  references public.estoque_fornecedores(id) on delete set null;
alter table public.compras add column if not exists local_id uuid
  references public.estoque_locais(id) on delete set null;

alter table public.compras add column if not exists hierarquia text;
alter table public.compras drop constraint if exists compras_hierarquia_chk;
alter table public.compras add constraint compras_hierarquia_chk
  check (hierarquia is null or hierarquia in
    ('materia_prima','insumo_direto','insumo_indireto','embalagem',
     'mp_processada','componente','peca','produto'));

-- Motivo de o lançamento no estoque ter falhado. Nulo = entrou tudo certo.
alter table public.compras add column if not exists estoque_erro text;

create index if not exists compras_fornecedor_idx on public.compras (fornecedor_id);
create index if not exists compras_local_idx      on public.compras (local_id);


-- ── §5 · Código do tablet pode ter prazo ─────────────────────────────────────
-- O código de ativação é de uso único mas NÃO expirava: um código escrito no
-- aparelho e nunca usado valia pra sempre. NULL = sem prazo (compatível com os
-- códigos que já existem).
begin;

alter table public.estoque_dispositivos
  add column if not exists codigo_expira_em timestamptz;

commit;


-- ── §5b · O tablet conta o que está preso, e alguém pode ver ─────────────────
-- O leitor já mandava os dois números em TODO heartbeat — quantas operações
-- ainda esperam subir, e qual versão do app está instalada — e o servidor
-- jogava fora: a rota nem chamava req.json(). Com o tablet no fundo do galpão
-- acumulando 40 operações presas há dois dias, ninguém no escritório tinha como
-- saber.
--
-- Vem de estoque_dispositivos.sql, que você já rodou: `create table if not
-- exists` não volta pra acrescentar coluna, então as duas entram por `alter`.
-- O código tolera a ausência (a rota continua carimbando `visto_em` sozinho),
-- então rodar isto só melhora o que já funciona.
begin;

alter table public.estoque_dispositivos
  add column if not exists pendencias  integer,
  add column if not exists app_versao  text;

commit;


-- ── §6 · A etiqueta vira CAIXA ───────────────────────────────────────────────
-- A unidade de manuseio do galpão é a CAIXA, não a peça. Uma chapa avulsa é uma
-- caixa de 1; uma caixa lacrada de folhas de alavanca é UMA etiqueta valendo 50.
-- Ninguém etiqueta 50 folhas uma a uma — bipa a caixa, e ela sai do estoque
-- inteira (não existe baixa parcial de caixa).
--
-- Vem de estoque_hierarquia_unidades.sql, que você já rodou: `create table if
-- not exists` não volta pra acrescentar coluna, então as colunas novas entram
-- por `alter` e as duas funções são recriadas.
begin;

alter table public.estoque_unidades
  add column if not exists quantidade int not null default 1;
alter table public.estoque_unidades drop constraint if exists estoque_unidades_quantidade_chk;
alter table public.estoque_unidades add constraint estoque_unidades_quantidade_chk
  check (quantidade > 0);

-- De qual ATIVIDADE veio esta baixa. Bipar a caixa de folhas limpas no começo
-- do trabalho tira ela do estoque AGORA e amarra o consumo à atividade — é o
-- que liga "esta caixa de folhas virou aquelas alavancas". Nulo na baixa avulsa.
alter table public.estoque_unidades
  add column if not exists baixa_atividade_id uuid;

create index if not exists estoque_unidades_baixa_atividade_idx
  on public.estoque_unidades (baixa_atividade_id)
  where baixa_atividade_id is not null;

-- A recontagem passa a SOMAR. Com `count(*)` uma caixa de 50 contaria como 1: o
-- estoque ficaria 50× menor que a prateleira, sem erro em lugar nenhum, e a
-- automação mandaria fabricar o que já está lá. `coalesce` porque `sum` de zero
-- linha é nulo, e nulo apagaria a quantidade em vez de zerá-la.
create or replace function public.estoque_recontar_unidades(p_item uuid)
returns void language plpgsql as $$
begin
  update public.estoque_itens i
     set quantidade = (select coalesce(sum(u.quantidade), 0) from public.estoque_unidades u
                        where u.item_id = p_item and u.status = 'em_estoque'),
         updated_at = now()
   where i.id = p_item and i.serializado = true;
end $$;

-- A guarda (c) do item compara com a SOMA das etiquetas, não com a contagem —
-- senão toda recontagem legítima de um item com caixa estouraria a exceção
-- ("gravei 50, mas só há 1 etiqueta"). As guardas (a) e (b) seguem com
-- `count(*)` de propósito: lá a pergunta é sobre EXISTIR etiqueta, não sobre
-- quanto ela vale.
create or replace function public.estoque_itens_guarda()
returns trigger language plpgsql as $$
declare
  n_unidades int;   -- quantas ETIQUETAS existem (a caixa conta como uma)
  n_pecas    int;   -- quantas PEÇAS elas valem (a caixa de 50 conta como 50)
begin
  if (tg_op = 'INSERT') then
    if (new.serializado) then new.quantidade := 0; end if;
    return new;
  end if;

  if (new.serializado and not old.serializado) then
    select count(*) into n_unidades from public.estoque_unidades
     where item_id = new.id and status = 'em_estoque';
    if (n_unidades = 0 and coalesce(old.quantidade, 0) > 0) then
      raise exception
        'Item "%" tem % em estoque e nenhuma etiqueta gerada. Gere as etiquetas antes de ligar a serialização — senão o estoque vira zero e não há como voltar.',
        old.nome, old.quantidade using errcode = 'check_violation';
    end if;
  end if;

  if (old.serializado and not new.serializado) then
    select count(*) into n_unidades from public.estoque_unidades
     where item_id = new.id and status = 'em_estoque';
    if (n_unidades > 0) then
      raise exception
        'Item "%" ainda tem % etiqueta(s) em estoque. Dê baixa nelas antes de desligar a serialização.',
        old.nome, n_unidades using errcode = 'check_violation';
    end if;
  end if;

  if (new.serializado and new.quantidade is distinct from old.quantidade) then
    select coalesce(sum(quantidade), 0) into n_pecas from public.estoque_unidades
     where item_id = new.id and status = 'em_estoque';
    if (new.quantidade is distinct from n_pecas) then
      raise exception
        'Item "%" é serializado: a quantidade é a soma das etiquetas (%), não um valor digitado (%).',
        old.nome, n_pecas, new.quantidade using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

-- Recontagem única pra alinhar quem já tinha etiqueta: como toda unidade nasce
-- com `quantidade = 1`, a soma dá exatamente a contagem de antes — nenhum
-- número muda hoje. É só pra não depender de "a próxima etiqueta arruma".
do $$
declare r record;
begin
  for r in select id from public.estoque_itens where serializado = true loop
    perform public.estoque_recontar_unidades(r.id);
  end loop;
end $$;

commit;


-- ── §7 · O mutirão anota o que é, e deixa rastro ─────────────────────────────
-- Vem de supabase/estoque_faxina_organizar.sql (a explicação longa está lá).
--
-- /fotos-estoque é a única tela que qualquer pessoa da equipe abre no celular,
-- sem passar por formulário de cadastro — virou a ferramenta de sair do zero no
-- galpão. Ela já grava a FOTO e, sem precisar deste arquivo, já grava a
-- LOCALIZAÇÃO (achando-ou-criando a linha em `estoque_locais`, que existe desde
-- o arquivo da hierarquia e hoje está vazia).
--
-- O que entra aqui é o que não tinha onde morar:
--   · `observacoes` — a nota em texto livre do item;
--   · `estoque_faxina_log` — quem mudou o quê, e o valor de antes. Com várias
--     pessoas mexendo ao mesmo tempo, "alguém trocou a localização e não sei
--     quem" é o problema previsível; carimbo de "último a mexer" não resolve,
--     porque o interessante é o PENÚLTIMO.
begin;

alter table public.estoque_itens add column if not exists observacoes text;

create table if not exists public.estoque_faxina_log (
  id       uuid primary key default gen_random_uuid(),
  item_id  uuid not null references public.estoque_itens(id) on delete cascade,
  campo    text not null,
  antes    text,
  depois   text,
  por_id   uuid,
  por_nome text,
  em       timestamptz not null default now()
);

alter table public.estoque_faxina_log drop constraint if exists estoque_faxina_log_campo_chk;
alter table public.estoque_faxina_log add constraint estoque_faxina_log_campo_chk
  check (campo in ('foto', 'local', 'nota'));

-- `em desc` é o que a tela lê: as últimas mudanças, reduzidas a "quem mexeu por
-- último em cada item". Do mais novo pro mais velho, o corte por `limit`
-- continua correto — o que sobra é sempre o mais recente, nunca um valor velho.
create index if not exists estoque_faxina_log_em_idx   on public.estoque_faxina_log (em desc);
create index if not exists estoque_faxina_log_item_idx on public.estoque_faxina_log (item_id, em desc);

alter table public.estoque_faxina_log enable row level security;

commit;


-- ── §8 · A impressão é do escritório, e a etiqueta tem DOIS tipos ────────────
-- Vem de supabase/estoque_impressao.sql (a explicação longa está lá).
--
-- Duas coisas:
--
--  (a) altura da etiqueta e número de cópias saem do DataStore de cada tablet e
--      passam a morar aqui, descendo pelo bootstrap. A FOLGA DA GUILHOTINA e
--      qual impressora Bluetooth usar continuam no aparelho de propósito: as
--      duas dependem da lâmina e do rádio DAQUELE tablet, e o escritório não
--      está olhando pra ele.
--
--  (b) o tipo da etiqueta vira propriedade do item. Hoje o selo da quantidade
--      aparece quando o número passa de 1 e só por isso — uma caixa de
--      chancelas com UMA dentro sai pelada, como se fosse peça avulsa. Uma
--      caixa com 1 continua sendo uma caixa; uma chapa nunca é.
--
-- O default 'unica' é o que dispensa preencher os 192 itens à mão: ele
-- reproduz exatamente o comportamento de hoje.
begin;

alter table public.estoque_config
  add column if not exists etiqueta_altura_mm       int not null default 15,
  add column if not exists etiqueta_largura_mm      int not null default 72,
  add column if not exists etiqueta_copias          int not null default 1,
  add column if not exists etiqueta_atualizado_em   timestamptz,
  add column if not exists etiqueta_atualizado_por  uuid;

-- Os limites são os MESMOS do layout (EtiquetaLayout.ALTURA_MINIMA_MM /
-- ALTURA_MAXIMA_MM). Repetidos aqui porque o banco é a última linha: a tela
-- valida, a API valida, e um `update` por qualquer outro caminho ainda não
-- pode gravar uma altura em que a barra deixa de ser legível.
alter table public.estoque_config drop constraint if exists estoque_config_etiqueta_altura_chk;
alter table public.estoque_config add constraint estoque_config_etiqueta_altura_chk
  check (etiqueta_altura_mm between 10 and 80);

-- A LARGURA é a área IMPRIMÍVEL em mm — o que a cabeça térmica alcança, não a
-- bobina. A diferença é o erro caro: rolo de 80mm imprime ~72mm (4mm de cada
-- borda a cabeça não toca) e rolo de 58mm imprime ~48mm. Guardar "80" e
-- descontar 8 daria a resposta errada pro rolo de 58, onde o desconto é 10.
--
-- 72 é o teto e não é escolha: é esta cabeça. Pedir 90 não imprime 90 — o
-- excedente simplesmente não sai, em silêncio, e quem descobre é o papel.
alter table public.estoque_config drop constraint if exists estoque_config_etiqueta_largura_chk;
alter table public.estoque_config add constraint estoque_config_etiqueta_largura_chk
  check (etiqueta_largura_mm between 25 and 72);

-- Teto de 3, e não "quantas quiser": cada cópia é uma tira por etiqueta, então
-- um 30 digitado sem querer vira 30× o rolo num recebimento de 40 peças.
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

alter table public.estoque_itens
  add column if not exists etiqueta_tipo text default 'unica';

alter table public.estoque_itens drop constraint if exists estoque_itens_etiqueta_tipo_chk;
alter table public.estoque_itens add constraint estoque_itens_etiqueta_tipo_chk
  check (etiqueta_tipo is null or etiqueta_tipo in ('unica', 'caixa'));

-- Índice PARCIAL: o tablet pergunta "quais SKUs são caixa?" e só as linhas que
-- fogem do padrão entram. Indexar 192 linhas 'unica' pra achar 5 'caixa' seria
-- pagar índice pelo que ninguém pergunta.
create index if not exists estoque_itens_etiqueta_caixa_idx
  on public.estoque_itens (sku)
  where etiqueta_tipo = 'caixa';

commit;


-- ── §9 · Chegou ≠ está no estoque ────────────────────────────────────────────
-- Vem de supabase/recebimento_v4.sql (a explicação longa está lá).
--
-- `status = 'recebido'` significava duas coisas ao mesmo tempo: a mercadoria
-- chegou E ela está no estoque. Como quem assina a chegada (recepção, tablet de
-- ponto) não é quem abre a caixa, confere, etiqueta e guarda (galpão), o
-- sistema contava 100 almofadas enquanto a caixa lacrada estava no corredor.
--
-- Parte o ato em dois SEM mexer no que `recebido` quer dizer — quem já lê
-- `recebido` esperando "está no estoque" continua certo. O que entra:
-- o status `chegou` (chegou inteiro, ninguém guardou), `quantidade_guardada`,
-- a coluna gerada `falta_guardar` (a fila do corredor numa consulta só),
-- quem/quando de cada etapa e `recebimentos.etapa`.
--
-- Depende do §4: o backfill lê `estoque_erro`.
begin;

alter table public.compras add column if not exists estoque_erro text;

-- O CHECK de `status` nasceu inline no create table (recebimento.sql), então
-- quem nomeou foi o Postgres. Em vez de adivinhar o nome, derruba-se qualquer
-- CHECK de `compras` que fale da lista de status, e recria-se com nome próprio.
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class      rel on rel.oid = con.conrelid
      join pg_namespace  ns  on ns.oid  = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'compras'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%aguardando_entrega%'
  loop
    execute format('alter table public.compras drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.compras add constraint compras_status_chk
  check (status in ('solicitado','comprado','aguardando_entrega',
                    'chegou','chegou_parcial','divergencia','recebido','cancelado'));

-- O backfill roda DENTRO do `if not exists`: uma vez só, no instante em que a
-- coluna nasce. Rodar o arquivo de novo amanhã não pode carimbar como
-- "guardado" o que chegou hoje e está esperando alguém no galpão.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'compras'
       and column_name = 'quantidade_guardada'
  ) then
    alter table public.compras
      add column quantidade_guardada numeric(12,2) not null default 0;

    -- Antes disto, chegar e entrar no estoque eram o mesmo ato: o que consta
    -- como recebido já subiu. Duas exceções: a compra cujo `estoque_erro` traz
    -- "faltam N para guardar" (frase que o código escreve enquanto esta coluna
    -- não existe — o N é a única memória de uma compra guardada pela metade) e
    -- a compra com erro sem número, em que o lançamento falhou inteiro.
    update public.compras
       set quantidade_guardada = case
             when estoque_erro ~ 'faltam [0-9]+([.,][0-9]+)? para guardar'
               then greatest(0, quantidade_recebida - replace(
                      substring(estoque_erro from 'faltam ([0-9]+(?:[.,][0-9]+)?) para guardar'),
                      ',', '.')::numeric)
             when coalesce(estoque_erro, '') = '' then quantidade_recebida
             else 0
           end
     where quantidade_recebida > 0;
  end if;
end $$;

-- A fila do corredor em UMA condição indexável: comparar duas colunas é coisa
-- que o PostgREST não faz num filtro, e sem isto contar "quantos chegaram e
-- ninguém guardou" exigiria baixar a tabela inteira.
alter table public.compras
  add column if not exists falta_guardar numeric(12,2)
  generated always as (quantidade_recebida - quantidade_guardada) stored;

create index if not exists compras_falta_guardar_idx
  on public.compras (falta_guardar)
  where falta_guardar > 0;

-- Duas etapas, duas pessoas, dois relógios. `chegou_em` é a PRIMEIRA chegada e
-- `guardado_em` a ÚLTIMA guarda; o passo a passo fica em `recebimentos`.
alter table public.compras
  add column if not exists chegou_em    timestamptz,
  add column if not exists chegou_por   text,
  add column if not exists guardado_em  timestamptz,
  add column if not exists guardado_por text;

-- Default `ambas` porque é o que as linhas ANTIGAS são: chegada e entrada no
-- estoque no mesmo toque. Evento novo diz explicitamente qual etapa registrou.
alter table public.recebimentos
  add column if not exists etapa text not null default 'ambas';
alter table public.recebimentos drop constraint if exists recebimentos_etapa_chk;
alter table public.recebimentos add constraint recebimentos_etapa_chk
  check (etapa in ('chegada','estoque','ambas'));

commit;


-- ── §10 · A fila que leva a impressão do escritório até a térmica ────────────
-- Vem de supabase/estoque_impressao_livre.sql (a explicação longa está lá).
--
-- A impressora está pareada por BLUETOOTH no tablet do galpão: o navegador do
-- escritório não alcança ela. Então o trabalho de impressão vira DADO — a
-- pessoa compõe a etiqueta na web, ela entra nesta fila, e o tablet imprime no
-- ciclo de sincronização que ele já faz (a cada ~15 min). Nenhuma rota nova é
-- chamada em ritmo nenhum: os trabalhos descem anexados ao bootstrap.
--
-- O destino é EXPLÍCITO (`dispositivo_id not null`) e isso não é rigor: com
-- dois aparelhos, "qualquer um imprime" faz os dois pegarem o mesmo trabalho no
-- mesmo minuto, e sai papel duplicado em dois cantos do galpão.
--
-- Não sair duas vezes por reenvio de rede é resolvido no APARELHO, espelhando o
-- que `estoque_operacoes` faz pro resto do módulo: lá o servidor guarda a
-- operação pra não processar duas vezes, aqui o tablet guarda o ID do trabalho
-- pra não imprimir duas vezes.
--
-- Nada aqui expira por rotina agendada — a validade é filtro de leitura (6h).
begin;

create table if not exists public.estoque_impressao_trabalhos (
  id              uuid primary key default gen_random_uuid(),
  -- CASCADE: tirar o tablet do ar leva junto a fila DELE. Não há pra onde
  -- reapontar — o trabalho existia porque alguém queria papel naquela impressora.
  dispositivo_id  uuid not null references public.estoque_dispositivos(id) on delete cascade,
  titulo          text not null default '',
  -- As linhas, o código de barras e a altura. `jsonb` porque o formato é do
  -- COMPOSITOR, não do banco: ganhar um recurso novo na etiqueta não deve
  -- exigir migração num banco que o dono roda à mão.
  conteudo        jsonb not null,
  copias          int not null default 1,
  status          text not null default 'fila',
  -- A frase do que deu errado, do jeito que o tablet contou. Sem ela, "o tablet
  -- não conseguiu" obriga alguém a atravessar o galpão pra descobrir que
  -- faltava papel.
  detalhe         text,
  criado_por      uuid,
  criado_por_nome text,
  criado_em       timestamptz not null default now(),
  resolvido_em    timestamptz
);

-- `expirado` NÃO entra aqui: é calculado na leitura pelo tempo de criação.
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

-- Índice PARCIAL: "o que está na MINHA fila?" é a consulta que roda a cada
-- ciclo de cada aparelho, para sempre. Indexar o que já foi impresso seria
-- pagar índice pelo que só a tela do escritório lê.
create index if not exists estoque_impressao_trabalhos_fila_idx
  on public.estoque_impressao_trabalhos (dispositivo_id, criado_em)
  where status = 'fila';

create index if not exists estoque_impressao_trabalhos_recentes_idx
  on public.estoque_impressao_trabalhos (criado_em desc);

alter table public.estoque_impressao_trabalhos enable row level security;

commit;


-- ── §11 · Bipar o material pra poder começar ─────────────────────────────────
-- De supabase/atividades_bipe_material.sql (a explicação longa está lá).
--
-- Com o interruptor LIGADO, a pessoa bipa a etiqueta do material ANTES de
-- aceitar a atividade no tablet da bancada. A caixa sai do estoque naquele
-- instante e fica amarrada à atividade por `estoque_unidades.baixa_atividade_id`
-- (que entrou no §6) — é o que responde "fulano fez chancela usando a folha
-- que ciclano fez".
--
-- Depende do §1 (a linha única de `estoque_config`) e do §6 (o vínculo).
begin;

-- O interruptor, na mesma linha única do interruptor da automação. Nasce
-- DESLIGADO: exigência nova que se liga sozinha no dia do deploy é uma bancada
-- parada de manhã sem ninguém entender por quê.
alter table public.estoque_config
  add column if not exists bipe_para_iniciar boolean not null default false;

-- O LIVRO. Existe porque `estoque_unidades` só sabe contar o que deu certo, e o
-- que interessa saber depois é o que NÃO deu: a etiqueta que o banco não
-- conhece, a que já tinha saído, e — a razão de tudo isto — a vez em que
-- ninguém bipou nada e a pessoa começou assim mesmo, com o motivo.
--
-- Exigir o bipe sem uma saída prende gente na bancada quando a etiqueta
-- descolou. Mas saída que não deixa rastro vira o caminho normal em duas
-- semanas. Aqui ela fica escrita, e dá pra medir.
--
-- SEM chave estrangeira pra `atividades`, pela mesma razão de
-- `estoque_conferencias`: histórico não some junto com a linha que o originou.
create table if not exists public.atividade_bipes (
  id               uuid primary key default gen_random_uuid(),
  atividade_id     uuid not null,
  colaborador_id   uuid,
  colaborador_nome text,
  codigo           text,
  situacao         text not null,
  item             text,
  pecas            int not null default 0,
  motivo           text,
  -- Quando aconteceu NO TABLET, não quando a fila offline subiu.
  ocorrido_em      timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

alter table public.atividade_bipes add column if not exists colaborador_id   uuid;
alter table public.atividade_bipes add column if not exists colaborador_nome text;
alter table public.atividade_bipes add column if not exists codigo           text;
alter table public.atividade_bipes add column if not exists item             text;
alter table public.atividade_bipes add column if not exists pecas            int not null default 0;
alter table public.atividade_bipes add column if not exists motivo           text;
alter table public.atividade_bipes add column if not exists ocorrido_em      timestamptz not null default now();

-- Vocabulário fechado, o MESMO de `SituacaoBaixa` (lib/estoque-baixa.ts) nas
-- três primeiras. Quem escreve estes valores é o servidor, nunca o tablet.
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

create index if not exists atividade_bipes_atividade_idx
  on public.atividade_bipes (atividade_id, ocorrido_em desc);

-- E a pergunta da TELA ("A produção de verdade"): quantas ordens abriram
-- bipando e quantas pela saída, num PERÍODO. Ela varre por `ocorrido_em`, não
-- por atividade, então o índice acima não serve — ele começa por
-- `atividade_id`. Sem este, a tela passa a varrer o livro inteiro, e o livro
-- ganha uma linha por bipe e nunca encolhe.
create index if not exists atividade_bipes_ocorrido_idx
  on public.atividade_bipes (ocorrido_em desc);

alter table public.atividade_bipes enable row level security;

commit;


-- ── §12 · Perguntar "de onde veio esta peça" sem varrer a tabela ─────────────
-- De supabase/atividades_genealogia.sql (a explicação longa está lá).
--
-- A tela "A produção de verdade" (/atividades/historico) caminha a corrente
-- para trás — caixa pronta → conferência que a criou → atividade → material que
-- entrou — e a primeira perna dessa caminhada é `where unidade_id in (...)`,
-- uma vez por nível.
--
-- As outras duas pontas do encadeamento já têm índice (`..._atividade_idx` aqui
-- no §2, `estoque_unidades_baixa_atividade_idx` no §6). Esta não tinha: o
-- Postgres não indexa chave estrangeira sozinho, e `unidade_id` PARECE indexada
-- por ter `references`.
--
-- Puramente de desempenho: não roda nada de código atrás disto, e sem ele a
-- tela devolve exatamente os mesmos dados — só mais devagar, e cada vez mais
-- devagar conforme o galpão produz.
begin;

create index if not exists estoque_conferencias_unidade_idx
  on public.estoque_conferencias (unidade_id)
  where unidade_id is not null;

commit;


-- ═════════════════════════════════════════════════════════════════════════════
--  DEPOIS DE RODAR — confira (deve devolver 16 linhas, todas `true`)
-- ═════════════════════════════════════════════════════════════════════════════
select 'estoque_config'          as peca, to_regclass('public.estoque_config')       is not null as ok
union all
select 'estoque_conferencias',        to_regclass('public.estoque_conferencias')     is not null
union all
select 'sku único',                   to_regclass('public.estoque_itens_sku_uniq')   is not null
union all
select 'compras.fornecedor_id',       exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'compras' and column_name = 'fornecedor_id')
union all
select 'dispositivo com prazo',       exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'estoque_dispositivos' and column_name = 'codigo_expira_em')
union all
select 'tablet conta a fila',         exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'estoque_dispositivos' and column_name = 'pendencias')
union all
select 'etiqueta vira caixa',         exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'estoque_unidades' and column_name = 'quantidade')
union all
select 'nota do item',                exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'estoque_itens' and column_name = 'observacoes')
union all
select 'rastro do mutirão',           to_regclass('public.estoque_faxina_log')        is not null
union all
select 'impressão do escritório',     exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'estoque_config' and column_name = 'etiqueta_altura_mm')
union all
select 'etiqueta de dois tipos',      exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'estoque_itens' and column_name = 'etiqueta_tipo')
union all
select 'chegou ≠ no estoque',         exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'compras' and column_name = 'quantidade_guardada')
union all
select 'fila de impressão',           to_regclass('public.estoque_impressao_trabalhos') is not null
union all
select 'interruptor do bipe',         exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'estoque_config' and column_name = 'bipe_para_iniciar')
union all
select 'livro do bipe',               to_regclass('public.atividade_bipes')             is not null
union all
select 'rastro sem varredura',        to_regclass('public.estoque_conferencias_unidade_idx') is not null;
