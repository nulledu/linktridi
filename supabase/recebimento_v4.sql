-- ── Recebimento v4 — chegou ≠ está no estoque ───────────────────────────────
--
-- Até aqui `compras.status = 'recebido'` significava DUAS coisas ao mesmo
-- tempo: a mercadoria chegou E ela está no estoque. Como quem assina a chegada
-- (recepção, tablet de ponto) não é quem abre a caixa, confere, etiqueta e
-- guarda (galpão), o sistema dizia que havia 100 almofadas em estoque enquanto
-- a caixa lacrada ainda estava no corredor.
--
-- Esta migração parte o ato em dois SEM mudar o que `recebido` quer dizer —
-- quem já lê `recebido` esperando "está no estoque" continua certo:
--
--   · status novo `chegou`   = chegou inteiro, ninguém guardou ainda (PENDENTE);
--   · `quantidade_guardada`  = quanto de fato entrou no estoque;
--   · `falta_guardar`        = coluna GERADA, a fila do corredor em uma consulta;
--   · chegou_em/chegou_por e guardado_em/guardado_por = quem e quando de CADA
--     etapa, separadamente, porque são pessoas diferentes;
--   · `recebimentos.etapa`   = de qual das duas etapas é cada evento.
--
-- Idempotente e aditivo — nada aqui apaga dado. O código roda sem isto: a
-- escrita retira sozinha a coluna que o banco não tem (`escreverTolerante`) e o
-- status novo cai em `divergencia` + `estoque_erro` ("chegou, mas não entrou no
-- estoque"), que é o mesmo lugar onde a tela já mostra esse caso. O que NÃO dá
-- sem rodar: guardar em duas vezes (parcial) e a coluna gerada da fila.

begin;

-- `estoque_erro` é de recebimento_v3.sql. Repetido aqui só para este arquivo
-- poder rodar sozinho num banco onde o v3 ainda não passou — o backfill abaixo
-- depende dela.
alter table public.compras add column if not exists estoque_erro text;

-- ── 1 · O status novo ────────────────────────────────────────────────────────
-- O CHECK de `status` nasceu inline no create table (recebimento.sql), então o
-- nome dele é escolha do Postgres. Em vez de adivinhar, derruba-se qualquer
-- CHECK de `compras` que fale da lista de status e recria-se com nome próprio.
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

-- ── 2 · Quanto já entrou no estoque ──────────────────────────────────────────
-- O backfill roda DENTRO do `if not exists`, ou seja: uma vez só, no instante
-- em que a coluna nasce. Rodar o arquivo de novo amanhã não pode carimbar como
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

    -- Antes desta migração, chegar e entrar no estoque eram o mesmo ato: tudo
    -- que consta como recebido já subiu. Duas exceções, nesta ordem:
    --
    --  1. a compra cujo `estoque_erro` traz "faltam N para guardar". Essa frase
    --     é escrita pelo CÓDIGO enquanto esta coluna não existe (ver
    --     `avisoDeFaltaGuardar` em lib/recebimento-etapas.ts) e o N é a única
    --     memória de uma compra que chegou em duas vezes e foi guardada só em
    --     parte. Ignorar o número aqui carimbaria zero guardado numa compra com
    --     metade no estoque — e o galpão somaria essa metade de novo;
    --  2. a compra com `estoque_erro` sem número: o lançamento falhou inteiro e
    --     a mercadoria de fato não está no estoque.
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

-- A fila do corredor em UMA condição indexável. Sem ela, "quantos chegaram e
-- ninguém guardou?" exige comparar duas colunas — coisa que o PostgREST não
-- faz num filtro, e que obrigaria a baixar a tabela inteira pra contar.
alter table public.compras
  add column if not exists falta_guardar numeric(12,2)
  generated always as (quantidade_recebida - quantidade_guardada) stored;

create index if not exists compras_falta_guardar_idx
  on public.compras (falta_guardar)
  where falta_guardar > 0;

-- ── 3 · Quem e quando de cada etapa ──────────────────────────────────────────
-- Duas etapas, duas pessoas, dois relógios. `chegou_em` é a PRIMEIRA chegada
-- (quando a porta abriu) e `guardado_em` é a ÚLTIMA guarda (quando o galpão
-- terminou) — o passo a passo completo continua em `recebimentos`, uma linha
-- por evento.
alter table public.compras
  add column if not exists chegou_em    timestamptz,
  add column if not exists chegou_por   text,
  add column if not exists guardado_em  timestamptz,
  add column if not exists guardado_por text;

-- ── 4 · O evento sabe de qual etapa é ────────────────────────────────────────
-- Default `ambas` porque é o que as linhas ANTIGAS são: chegada e entrada no
-- estoque no mesmo toque. Evento novo diz explicitamente qual etapa registrou.
alter table public.recebimentos
  add column if not exists etapa text not null default 'ambas';
alter table public.recebimentos drop constraint if exists recebimentos_etapa_chk;
alter table public.recebimentos add constraint recebimentos_etapa_chk
  check (etapa in ('chegada','estoque','ambas'));

commit;
