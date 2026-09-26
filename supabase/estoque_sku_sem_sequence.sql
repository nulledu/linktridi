-- ── O número do SKU volta a sair da TABELA, não de um contador à parte ───────
--
-- O gatilho anterior (supabase/estoque_sku_automatico.sql) usava uma SEQUENCE.
-- A escolha era defensável no papel — sequence é atômica, dois cadastros no
-- mesmo instante não disputam o mesmo número — e errada na prática deste
-- sistema, por um motivo medido:
--
--   itens no catálogo ......... 243
--   maior SKU ................. PRD-0248
--   próximo que a sequence dava PRD-6698     ← 6450 números de buraco
--
-- `nextval` NÃO volta atrás quando o INSERT falha, e aqui INSERT falho é
-- rotina: `app/api/estoque/importar/route.ts` tenta a planilha inteira num
-- lote e, quando o lote bate em qualquer erro, REINSERE LINHA A LINHA. Cada
-- tentativa perdida queima um número. Algumas importações grandes bastaram
-- para abrir o abismo.
--
-- O efeito colateral não é cosmético: o dono pediu "PRD-0001, PRD-0002 e vai
-- avançando", e um item novo nascendo PRD-6698 quebra exatamente isso. Pior,
-- passaram a existir DUAS fontes da verdade — a tela sugere `max+1` (0249) e o
-- banco daria 6698. Duas contas discordando sobre o mesmo número é o tipo de
-- coisa que aparece como erro aleatório de SKU duplicado.
--
-- ── A TROCA, E O QUE ELA CUSTA ──────────────────────────────────────────────
--
-- Agora o número sai de `max(sku)+1` lido da própria tabela — a MESMA conta que
-- a tela faz (`maiorSequencial` em lib/estoque-sku.ts). Uma fonte só.
--
-- O que se perde, e é real: dois INSERT no MESMO instante calculam o mesmo
-- número e um dos dois falha no índice único (23505). Antes isso era
-- impossível. É um custo aceitável aqui porque:
--   · dois cadastros no mesmo milissegundo praticamente não acontecem num
--     galpão com uma pessoa cadastrando;
--   · a falha é VISÍVEL e o pedido se repete, contra um buraco de 6450 números
--     que ninguém vê até estranhar o código impresso na etiqueta;
--   · dentro de UMA transação (o lote da importação) o `max` já enxerga as
--     linhas inseridas antes dela, então a planilha continua numerando em
--     sequência.
--
-- Idempotente: rodar de novo não renumera nada e não duplica nada.

-- 1. O gatilho novo: o número vem da tabela.
create or replace function public.estoque_sku_automatico()
returns trigger language plpgsql as $$
declare
  proximo bigint;
begin
  if new.sku is null or btrim(new.sku) = '' then
    -- `max` sobre o padrão, em qualquer largura de zeros: "PRD-248" e
    -- "PRD-0248" são o MESMO 248. O `coalesce` faz o primeiro item da casa
    -- nascer PRD-0001 num catálogo vazio.
    select coalesce(max((regexp_replace(sku, '^PRD-', ''))::bigint), 0) + 1
      into proximo
      from public.estoque_itens
     where sku ~ '^PRD-[0-9]+$';
    new.sku := 'PRD-' || lpad(proximo::text, 4, '0');
  end if;
  -- O ramo que empurrava a sequence saiu junto com ela: não há mais contador
  -- para manter em dia. Quem chega com um PRD-#### escolhido à mão apenas
  -- ocupa aquele número, e o próximo automático já o enxerga no `max`.
  return new;
end $$;

drop trigger if exists estoque_sku_automatico on public.estoque_itens;
create trigger estoque_sku_automatico
  before insert on public.estoque_itens
  for each row execute function public.estoque_sku_automatico();

-- 2. A sequence e o apoio dela saem de cena. Deixá-los seria manter viva a
--    segunda fonte da verdade que este arquivo existe pra apagar.
drop function if exists public.currval_ou_zero();
drop sequence if exists public.estoque_sku_seq;

-- 3. O índice único CONTINUA sendo a rede de baixo — é ele que transforma a
--    corrida de dois cadastros simultâneos num erro visível em vez de dois
--    itens dividindo o mesmo prefixo de etiqueta.
create unique index if not exists estoque_itens_sku_unico
  on public.estoque_itens (upper(sku))
  where sku is not null;

-- Confere: quantos itens, o maior SKU e o próximo que um cadastro vai ganhar.
-- Os dois últimos têm de ser vizinhos — era essa a divergência.
select
  count(*)                                                              as itens,
  max(sku) filter (where sku ~ '^PRD-[0-9]+$')                          as maior_sku,
  'PRD-' || lpad((coalesce(max((regexp_replace(sku, '^PRD-', ''))::bigint)
                    filter (where sku ~ '^PRD-[0-9]+$'), 0) + 1)::text, 4, '0') as proximo
from public.estoque_itens;
