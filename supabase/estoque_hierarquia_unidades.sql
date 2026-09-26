-- ── Estoque: hierarquia de materiais, unidades etiquetadas e localização ─────
-- Rode no Supabase NOVO (o mesmo do estoque_itens / ponto / recebimento).
-- Idempotente: rodar duas vezes não faz mal.
--
-- Pré-requisito: supabase/recebimento.sql já rodado (a tabela `compras` é
-- referenciada por estoque_unidades.compra_id).
--
-- RODE O ARQUIVO INTEIRO, de uma vez. O `begin`/`commit` não é decoração: as
-- restrições são recriadas com `drop` + `add`, então uma falha no meio de uma
-- execução statement-a-statement deixaria a tabela SEM a restrição, mais
-- desprotegida do que antes de começar, e em silêncio.

begin;

-- ── 1. Lugares ───────────────────────────────────────────────────────────────
create table if not exists public.estoque_locais (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  codigo     text not null,              -- curto: é o que cabe na etiqueta
  pai_id     uuid references public.estoque_locais(id) on delete set null,
  ativo      boolean not null default true,
  ordem      int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists estoque_locais_codigo_idx on public.estoque_locais (lower(codigo));
create index if not exists estoque_locais_pai_idx on public.estoque_locais (pai_id, ordem, nome);

-- ── 2. Fornecedores ──────────────────────────────────────────────────────────
create table if not exists public.estoque_fornecedores (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  cnpj       text,
  contato    text,
  telefone   text,
  email      text,
  obs        text,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists estoque_fornecedores_nome_idx on public.estoque_fornecedores (lower(nome));

-- ── 3. Colunas novas do item ─────────────────────────────────────────────────
alter table public.estoque_itens add column if not exists hierarquia    text;
-- `produzido` nasce NULO de propósito, não `false`. Com default `false` não há
-- como distinguir "ninguém decidiu ainda" de "alguém desmarcou na tela" — e a
-- migração da seção 4, que só preenche o que nunca foi decidido, remarcaria na
-- segunda rodada tudo que uma pessoa tinha desmarcado. O arquivo promete ser
-- idempotente; com default essa promessa era falsa justamente aqui.
alter table public.estoque_itens add column if not exists produzido     boolean;
alter table public.estoque_itens add column if not exists serializado   boolean not null default false;
alter table public.estoque_itens add column if not exists fornecedor_id uuid references public.estoque_fornecedores(id) on delete set null;
alter table public.estoque_itens add column if not exists local_id      uuid references public.estoque_locais(id) on delete set null;
-- Dimensões guardam sempre MILÍMETRO. `dim_unidade` é só como exibir/digitar —
-- guardar no que a pessoa digitou faria "2,75 m" ordenar antes de "1840 mm".
alter table public.estoque_itens add column if not exists largura_mm    numeric(12,2);
alter table public.estoque_itens add column if not exists altura_mm     numeric(12,2);
alter table public.estoque_itens add column if not exists espessura_mm  numeric(12,2);
alter table public.estoque_itens add column if not exists dim_unidade   text not null default 'mm';
alter table public.estoque_itens add column if not exists cor           text;
alter table public.estoque_itens add column if not exists custo_em      timestamptz;

alter table public.estoque_itens drop constraint if exists estoque_itens_hierarquia_chk;
alter table public.estoque_itens add constraint estoque_itens_hierarquia_chk
  check (hierarquia is null or hierarquia in
    ('materia_prima','insumo_direto','insumo_indireto','embalagem',
     'mp_processada','componente','peca','produto'));

-- 'm' é o metro linear ("ML") do pedido.
alter table public.estoque_itens drop constraint if exists estoque_itens_dim_unidade_chk;
alter table public.estoque_itens add constraint estoque_itens_dim_unidade_chk
  check (dim_unidade in ('mm','cm','m'));

create index if not exists estoque_itens_hierarquia_idx on public.estoque_itens (hierarquia, nome);
create index if not exists estoque_itens_local_idx      on public.estoque_itens (local_id);
create index if not exists estoque_itens_fornecedor_idx on public.estoque_itens (fornecedor_id);

-- ── 4. Migração dos três eixos antigos para um ───────────────────────────────
-- `classe` primeiro (é a mais fina), `tipo` como rede. Só preenche o que está
-- nulo: rodar de novo não desfaz ajuste feito na tela.
update public.estoque_itens set hierarquia = case
  when classe = 'materia_prima'                    then 'materia_prima'
  when classe = 'semiacabado'                      then 'mp_processada'
  when classe = 'peca_montada'                     then 'peca'
  when classe = 'componente'                       then 'componente'
  when classe = 'acabado'                          then 'produto'
  when classe in ('insumo','manutencao','consumo') then 'insumo_indireto'
  when classe in ('emb_producao','emb_expedicao','emb_montada','emb_sem_montar','plastico_bolha')
                                                   then 'embalagem'
  when tipo = 'embalagem'                          then 'embalagem'
  when tipo = 'peca'                               then 'peca'
  when tipo = 'produto'                            then 'produto'
  when tipo = 'componente'                         then 'componente'
  else 'componente'
end
where hierarquia is null;

-- Quem já tem ficha técnica é, por definição, produzido internamente.
-- `is null` e não `= false`: nulo é "nunca decidido". Quem desmarcou na tela
-- fica `false` e esta linha não o toca mais, por mais vezes que o arquivo rode.
update public.estoque_itens i set produzido = true
 where i.produzido is null
   and exists (select 1 from public.ficha_tecnica f where f.item_id = i.id);

-- O resto do que nunca foi decidido é comprado pronto.
update public.estoque_itens set produzido = false where produzido is null;

-- ── 5. Unidades etiquetadas (planos 2 e 3) ───────────────────────────────────
--
-- A etiqueta é a CAIXA, não a peça: `quantidade` diz quantas peças ela vale.
-- Uma chapa avulsa é uma caixa de 1; uma caixa lacrada de folhas de alavanca é
-- UMA etiqueta valendo 50. Ninguém etiqueta 50 folhas uma a uma.
create table if not exists public.estoque_unidades (
  id             uuid primary key default gen_random_uuid(),
  -- RESTRICT, nunca CASCADE. `DELETE /api/estoque-itens` é apagão de verdade,
  -- liberado por uma permissão só e sem confirmação no banco. Com cascade, um
  -- clique errado levava junto o custo por compra de cada unidade e todo o
  -- rastro de baixa (quem, quando, por quê) — o que este projeto inteiro existe
  -- pra registrar, e que não volta de lugar nenhum. Com restrict o apagar falha
  -- e a pessoa desativa o item, que é o certo pra estoque físico.
  item_id        uuid not null references public.estoque_itens(id) on delete restrict,
  codigo         text not null unique,     -- 'MDF6MM-BR-18-000042'
  seq            int not null,             -- 42
  -- Peças NESTA etiqueta. O `check (> 0)` entra logo abaixo, com nome próprio,
  -- pra ser o MESMO em quem cria a tabela hoje e em quem já a tinha (um check
  -- inline aqui viraria uma segunda restrição, anônima e duplicada).
  quantidade     int not null default 1,
  status         text not null default 'em_estoque'
                   check (status in ('em_estoque','consumido','expedido','perdido','devolvido')),
  origem         text not null default 'manual'
                   check (origem in ('recebimento','producao','manual')),
  compra_id      uuid references public.compras(id) on delete set null,
  custo          numeric(12,2),            -- o custo DAQUELA compra, não a média
  criado_por_id  uuid,
  criado_por     text,
  criado_em      timestamptz not null default now(),
  baixa_motivo   text,
  baixa_obs      text,
  baixado_por_id uuid,
  baixado_por    text,
  baixado_em     timestamptz,
  unique (item_id, seq)
);
-- As duas colunas da caixa também via `alter`: quem já rodou este arquivo tem a
-- tabela criada sem elas, e `create table if not exists` não volta pra
-- acrescentar coluna nenhuma.
--
-- `quantidade` = peças nesta etiqueta. Default 1 e `check (> 0)`: etiqueta que
-- não vale peça nenhuma não existe, e a caixa nasce com o que a pessoa produziu.
alter table public.estoque_unidades
  add column if not exists quantidade int not null default 1;
alter table public.estoque_unidades drop constraint if exists estoque_unidades_quantidade_chk;
alter table public.estoque_unidades add constraint estoque_unidades_quantidade_chk
  check (quantidade > 0);

-- De qual ATIVIDADE veio esta baixa. Bipar a caixa de folhas limpas no começo
-- do trabalho tira ela do estoque AGORA e amarra o consumo à atividade — é o
-- que liga "esta caixa de folhas virou aquelas alavancas". Nulo quando a baixa
-- é avulsa (o galpão também dá baixa sem atividade nenhuma no meio).
alter table public.estoque_unidades
  add column if not exists baixa_atividade_id uuid;

create index if not exists estoque_unidades_item_idx  on public.estoque_unidades (item_id, status);
create index if not exists estoque_unidades_baixa_idx on public.estoque_unidades (status, baixado_em desc);
-- Parcial: quase toda unidade tem `baixa_atividade_id` nulo, e o índice só
-- serve pra pergunta "o que esta atividade consumiu?".
create index if not exists estoque_unidades_baixa_atividade_idx
  on public.estoque_unidades (baixa_atividade_id)
  where baixa_atividade_id is not null;

-- ── 6. `quantidade` mantida por trigger ──────────────────────────────────────
-- É o que impede este projeto de virar refatoração em cascata: lib/requisicoes,
-- /api/atividades, /api/device/pull, /api/central/busca e o tablet continuam
-- lendo `quantidade` como sempre leram.
--
-- Guardado por `serializado = true`: item a granel (cola, tinta) segue com a
-- quantidade digitada e NUNCA é zerado por não ter unidade nenhuma.
--
-- SOMA `u.quantidade`, não conta linhas. A etiqueta é a CAIXA: com `count(*)`
-- uma caixa lacrada de 50 folhas contaria como 1 e o estoque ficaria 50× menor
-- que a prateleira — sem erro em lugar nenhum, com a automação mandando
-- fabricar o que já está lá. `coalesce` porque `sum` de zero linha é nulo, e
-- nulo aqui apagaria a quantidade em vez de zerá-la.
create or replace function public.estoque_recontar_unidades(p_item uuid)
returns void language plpgsql as $$
begin
  update public.estoque_itens i
     set quantidade = (select coalesce(sum(u.quantidade), 0) from public.estoque_unidades u
                        where u.item_id = p_item and u.status = 'em_estoque'),
         updated_at = now()
   where i.id = p_item and i.serializado = true;
end $$;

create or replace function public.estoque_unidades_sync()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'DELETE') then
    perform public.estoque_recontar_unidades(old.item_id);
    return old;
  end if;
  perform public.estoque_recontar_unidades(new.item_id);
  if (tg_op = 'UPDATE' and old.item_id is distinct from new.item_id) then
    perform public.estoque_recontar_unidades(old.item_id);
  end if;
  return new;
end $$;

drop trigger if exists estoque_unidades_sync_trg on public.estoque_unidades;
create trigger estoque_unidades_sync_trg
after insert or update or delete on public.estoque_unidades
for each row execute function public.estoque_unidades_sync();

-- Ligar a serialização recalcula na hora, MAS só quando já existe etiqueta.
-- O caso sem etiqueta é barrado pela guarda logo abaixo, antes de chegar aqui.
create or replace function public.estoque_itens_serializado_sync()
returns trigger language plpgsql as $$
begin
  if (new.serializado = true and old.serializado = false) then
    perform public.estoque_recontar_unidades(new.id);
  end if;
  return new;
end $$;

drop trigger if exists estoque_itens_serializado_trg on public.estoque_itens;
create trigger estoque_itens_serializado_trg
after update of serializado on public.estoque_itens
for each row execute function public.estoque_itens_serializado_sync();

-- ── 6b. Guarda: o número serializado tem UM dono, as etiquetas ───────────────
-- Três buracos que o recálculo sozinho não fecha. Todos viram erro alto, porque
-- o modo de falha alternativo é número errado circulando calado por semanas.
create or replace function public.estoque_itens_guarda()
returns trigger language plpgsql as $$
declare
  n_unidades int;   -- quantas ETIQUETAS existem (a caixa conta como uma)
  n_pecas    int;   -- quantas PEÇAS elas valem (a caixa de 50 conta como 50)
begin
  -- Item serializado NASCE com zero: a quantidade vem das etiquetas, e a tela
  -- de cadastro não tem como saber quantas existem antes de gerá-las.
  if (tg_op = 'INSERT') then
    if (new.serializado) then new.quantidade := 0; end if;
    return new;
  end if;

  -- (a) Ligar a serialização com estoque digitado e NENHUMA etiqueta zeraria o
  -- item na hora. O número antigo não fica guardado em lugar nenhum, desligar o
  -- interruptor não o traz de volta, e `verificarReabastecimento` passaria a ler
  -- 0 e a mandar FABRICAR o que já está na prateleira. Etiqueta primeiro.
  --
  -- `count(*)` de propósito: a pergunta aqui é "EXISTE etiqueta?", e pra
  -- existência tanto faz o que cada uma vale. (Só a (c) virou soma.)
  if (new.serializado and not old.serializado) then
    select count(*) into n_unidades from public.estoque_unidades
     where item_id = new.id and status = 'em_estoque';
    if (n_unidades = 0 and coalesce(old.quantidade, 0) > 0) then
      raise exception
        'Item "%" tem % em estoque e nenhuma etiqueta gerada. Gere as etiquetas antes de ligar a serialização — senão o estoque vira zero e não há como voltar.',
        old.nome, old.quantidade using errcode = 'check_violation';
    end if;
  end if;

  -- (b) Desligar com etiqueta viva congela a contagem: as unidades continuariam
  -- sendo bipadas e `quantidade` pararia de acompanhar, sem avisar ninguém.
  -- `count(*)` de propósito: a frase manda dar baixa nas ETIQUETAS, e é o
  -- número de etiquetas que a pessoa vai procurar na prateleira.
  if (old.serializado and not new.serializado) then
    select count(*) into n_unidades from public.estoque_unidades
     where item_id = new.id and status = 'em_estoque';
    if (n_unidades > 0) then
      raise exception
        'Item "%" ainda tem % etiqueta(s) em estoque. Dê baixa nelas antes de desligar a serialização.',
        old.nome, n_unidades using errcode = 'check_violation';
    end if;
  end if;

  -- (c) `lib/estoque.ts` e `lib/recebimento.ts` escrevem `quantidade` direto e
  -- não passam por gatilho nenhum. Num item serializado a conta deles valeria
  -- até alguém bipar, e aí o número saltaria pra contagem real sem nada
  -- explicando. Estourar aqui transforma corrupção silenciosa em erro visível.
  --
  -- Compara com a SOMA das etiquetas, não com a contagem: desde a caixa,
  -- `quantidade` é quantas PEÇAS existem. Comparar com `count(*)` faria toda
  -- recontagem legítima de um item com caixa estourar esta exceção — a trigger
  -- gravaria 50 e a guarda diria "mas só há 1 etiqueta".
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

drop trigger if exists estoque_itens_guarda_trg on public.estoque_itens;
create trigger estoque_itens_guarda_trg
before insert or update on public.estoque_itens
for each row execute function public.estoque_itens_guarda();

-- ── 7. Registro de impressão de etiqueta (plano 3) ───────────────────────────
create table if not exists public.etiqueta_impressoes (
  id             uuid primary key default gen_random_uuid(),
  unidade_id     uuid references public.estoque_unidades(id) on delete set null,
  item_id        uuid references public.estoque_itens(id) on delete set null,
  codigo         text not null,
  local_texto    text,
  responsavel_id uuid,
  responsavel    text,
  impresso_em    timestamptz not null default now()
);
create index if not exists etiqueta_impressoes_codigo_idx
  on public.etiqueta_impressoes (codigo, impresso_em desc);

-- ── 8. RLS ───────────────────────────────────────────────────────────────────
-- Acesso só via service role nas rotas /api/* — RLS bloqueia o resto.
alter table public.estoque_locais       enable row level security;
alter table public.estoque_fornecedores enable row level security;
alter table public.estoque_unidades     enable row level security;
alter table public.etiqueta_impressoes  enable row level security;

commit;

-- ── 9. Limpeza (NÃO rode agora) ──────────────────────────────────────────────
-- Depois de algumas semanas com a hierarquia no ar e ninguém sentindo falta,
-- rode isto pra apagar os três eixos antigos. Coluna apagada não volta.
--   alter table public.estoque_itens drop column if exists classe;
--   alter table public.estoque_itens drop column if exists tipo_item;
--   alter table public.estoque_itens drop column if exists tipo;
--   alter table public.estoque_itens drop column if exists setor_responsavel;
