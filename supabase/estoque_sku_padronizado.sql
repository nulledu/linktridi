-- ── Padroniza os SKUs: PRD-0001, PRD-0002, … pra todo o catálogo ────────────
--
-- O catálogo tinha CINCO convenções vivas ao mesmo tempo (MP-0001, MPP-0002,
-- CMP-0001, PEC-0001, PRD-0003) mais os de tecla amassada que ninguém gerou
-- ("iJIFYU7", "PM246MM"). O código já passou a gerar PRD-#### pra tudo; este
-- arquivo acerta o que já está gravado.
--
-- ── AS TRÊS COISAS QUE ELE PROTEGE ──────────────────────────────────────────
--
-- 1. QUEM JÁ É PRD-#### NÃO SE MEXE. "Almofada 11" é PRD-0001 e tem NOVE
--    unidades gravadas como PRD-0001-00000N. Renumerar do zero faria essas
--    unidades apontarem pro item errado, e o histórico de expedição passaria a
--    mentir sobre o que saiu.
--
-- 2. O CÓDIGO DA UNIDADE ACOMPANHA O ITEM. `estoque_unidades.codigo` é
--    `<SKU>-<sequencial>`, e quem lê um código procura o item pelo SKU dele
--    (ver lib/estoque-item-por-codigo.ts). Renomear o item sem renomear as
--    unidades deixa etiqueta órfã: bipar não acha nada e ninguém entende por quê.
--
-- 3. NADA FOI IMPRESSO. Conferido antes de escrever isto: `etiqueta_impressoes`
--    está VAZIA — nenhuma etiqueta de unidade foi registrada como impressa. Se
--    houvesse papel colado na prateleira, renumerar seria trocar o código de uma
--    peça física sem poder reimprimir o adesivo dela, e o certo seria manter os
--    antigos. NÃO RODE ESTE ARQUIVO se etiquetas de unidade já saíram na
--    impressora — a consulta no fim avisa antes de qualquer escrita.
--
-- Idempotente: rodar duas vezes não renumera de novo (na segunda passada todo
-- mundo já está no padrão e o filtro não pega ninguém).

do $$
declare
  impressas bigint;
  fora      bigint;
  proximo   int;
  r         record;
  novo      text;
begin
  -- ── Trava de segurança ───────────────────────────────────────────────────
  -- Etiqueta impressa é papel na prateleira. Se existir, este arquivo para: o
  -- código gravado tem de continuar batendo com o adesivo colado.
  select count(*) into impressas from public.etiqueta_impressoes;
  if impressas > 0 then
    raise exception
      'Existem % etiqueta(s) de unidade já IMPRESSAS. Renumerar o SKU trocaria o código de peças que têm adesivo colado, e não há como reimprimir o que já foi para a prateleira. Nada foi alterado.',
      impressas using errcode = 'check_violation';
  end if;

  select count(*) into fora
    from public.estoque_itens
   where sku is not null and sku !~ '^PRD-[0-9]{4}$';

  if fora = 0 then
    raise notice 'Todo SKU já está no padrão PRD-####. Nada a fazer.';
    return;
  end if;

  -- O próximo número livre: o maior PRD-#### que existe, mais um. Continuar de
  -- onde parou (e não recomeçar do 1) é o que preserva quem já está no padrão.
  select coalesce(max((regexp_replace(sku, '^PRD-', ''))::int), 0) + 1
    into proximo
    from public.estoque_itens
   where sku ~ '^PRD-[0-9]{4}$';

  -- Ordem estável: por data de cadastro. Assim a numeração conta a história do
  -- catálogo, e rodar de novo (num banco que ganhou itens) não embaralha o que
  -- já foi numerado.
  for r in
    select id, sku
      from public.estoque_itens
     where sku is not null and sku !~ '^PRD-[0-9]{4}$'
     order by created_at, id
  loop
    novo := 'PRD-' || lpad(proximo::text, 4, '0');

    -- As unidades ANTES do item: enquanto o item ainda tem o SKU velho, o
    -- `replace` casa o prefixo com certeza. Depois de trocar o item, saber qual
    -- era o prefixo antigo exigiria guardar estado.
    update public.estoque_unidades
       set codigo = novo || substring(codigo from '-[0-9]+$')
     where item_id = r.id
       and codigo like r.sku || '-%';

    update public.estoque_itens set sku = novo, updated_at = now() where id = r.id;

    raise notice '  % → %', r.sku, novo;
    proximo := proximo + 1;
  end loop;

  raise notice 'SKU padronizado: % item(ns) renumerado(s). Próximo livre: PRD-%.',
    fora, lpad(proximo::text, 4, '0');
end $$;

-- ── O que ficou ──────────────────────────────────────────────────────────────
-- Lê em voz alta o resultado. Item SEM SKU continua sem: ele ganha um na
-- primeira vez que alguém abrir a ficha (o gerador sugere) ou gerar etiqueta —
-- inventar 180 códigos agora encheria a numeração de itens que talvez nunca
-- precisem de um.
select
  count(*) filter (where sku ~ '^PRD-[0-9]{4}$') as no_padrao,
  count(*) filter (where sku is not null and sku !~ '^PRD-[0-9]{4}$') as fora_do_padrao,
  count(*) filter (where sku is null) as sem_sku
from public.estoque_itens;
