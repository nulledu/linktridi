-- ── A faxina de fotos vira o mutirão de organizar o galpão ───────────────────
-- Rode no Supabase NOVO (o mesmo do estoque_itens / ponto / recebimento).
-- Idempotente e ADITIVO: rodar duas vezes não faz mal, nada aqui apaga dado.
--
-- Contexto: /fotos-estoque nasceu pra trocar a FOTO do item e mais nada. Ela é
-- aberta a qualquer pessoa logada, e virou o único lugar do sistema onde várias
-- pessoas ao mesmo tempo, com o celular na mão, conseguem alimentar o catálogo
-- sem passar por formulário de cadastro. O dono pediu que ela também receba
-- ONDE a coisa está e O QUE ela é.
--
-- A LOCALIZAÇÃO não precisa de nada aqui: `estoque_locais` e
-- `estoque_itens.local_id` já existem (supabase/estoque_hierarquia_unidades.sql,
-- já rodado). A tela acha-ou-cria a linha do lugar e aponta o item pra ela —
-- é assim que a tabela que hoje está vazia, e que a aba Localização e a
-- etiqueta consomem, se enche de graça durante o mutirão.
--
-- O que falta é o que este arquivo cria:
--
--   1. `estoque_itens.observacoes` — a nota em texto livre ("o que é / pra que
--      serve / o que vai ali"). Não existia coluna de texto livre no item.
--
--   2. `estoque_faxina_log` — o RASTRO. Com várias pessoas mexendo no mesmo
--      catálogo ao mesmo tempo, "alguém mudou a localização e eu não sei quem"
--      é o problema previsível do mutirão. Uma linha por mudança, com o valor
--      de antes: dá pra ver quem pôs, quando, e voltar atrás.
--
--      É tabela separada, e não duas colunas de carimbo no item, porque o
--      carimbo só guarda o ÚLTIMO — e no mutirão o interessante é justamente o
--      penúltimo ("estava Prateleira A3, virou A4; quem trocou?").
--
-- Enquanto isto não rodar, /fotos-estoque continua funcionando: a foto e a
-- localização gravam normalmente, o campo da nota não aparece (a tela explica
-- que falta rodar o SQL) e a mudança simplesmente não deixa rastro.

begin;

-- ── 1. A nota do item ────────────────────────────────────────────────────────
alter table public.estoque_itens add column if not exists observacoes text;

-- ── 2. O rastro do mutirão ───────────────────────────────────────────────────
-- `por_nome` além de `por_id` de propósito: o id soma pra quem quiser cruzar
-- com `profiles`, o nome é o que sobrevive se a pessoa sair da empresa e a
-- linha do histórico continuar precisando dizer quem foi. Mesmo padrão da
-- conferência (supabase/estoque_conferencias.sql).
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

-- O índice por `em desc` é o que a tela usa: ela lê as últimas mudanças e
-- reduz pra "quem mexeu por último em cada item". Ordenar do mais novo pro mais
-- velho faz o corte por `limit` continuar CORRETO — o que sobra é sempre o mais
-- recente de cada item, nunca um valor velho.
create index if not exists estoque_faxina_log_em_idx   on public.estoque_faxina_log (em desc);
create index if not exists estoque_faxina_log_item_idx on public.estoque_faxina_log (item_id, em desc);

alter table public.estoque_faxina_log enable row level security;
-- Acesso só via service role nas rotas /api/* — RLS bloqueia o resto.

commit;
