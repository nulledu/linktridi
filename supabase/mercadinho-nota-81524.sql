-- ── Mercadinho · entrada da nota 81524 (Lojão Real da Felix, 14/08/2026) ─────
-- Rodar no Supabase da plataforma.
--
-- Lançada à mão porque o worker de leitura de foto não é confiável (fica lendo
-- pra sempre, ou o PC está desligado). Números do cupom:
--
--   NUTRY CEREAL COCO ................  2 un ·  R$ 1,40
--   NUTRI CEREAL BANANA E MEL ........ 18 un ·  R$ 1,40
--   CORPO E SABOR CASTANHA DO PARA 25G  3 un ·  R$ 1,00
--   MENTOS FRUTAS VERMELHAS .......... 10 un ·  R$ 1,50
--   CORPO E SABOR CASTANHA DO PARA 25G  2 un ·  R$ 1,25
--   BANANINHA TRADICIONAL ............  5 un ·  R$ 1,50
--                                       TOTAL ... R$ 55,95  (confere)
--
-- Castanha do Pará vem em DUAS linhas com preços diferentes: 5 unidades no
-- total, custo médio ponderado R$ 1,10.
--
-- ── POR QUE ESTA VERSÃO NÃO CASA SÓ POR CÓDIGO DE BARRAS ────────────────────
-- A primeira versão abortava com
--     Produto Bananinha tradicional (código 7898961989020) não existe
-- porque ancorava no EAN exato. O catálogo do banco pode ter o produto com
-- código diferente, vazio, ou com espaço — e aí o `=` não acha. Agora cada item
-- é resolvido por código E por nome, e o bloco faz DUAS passadas: a primeira só
-- procura e junta TODOS os problemas de uma vez; a segunda aplica. Assim você vê
-- a lista inteira do que falta em vez de descobrir um por execução.
--
-- ── AS TRAVAS ───────────────────────────────────────────────────────────────
-- 1. EMPRESA: confira `v_empresa` abaixo. O estoque é por empresa e o cupom não
--    diz qual. Aborta se o nome não casar com exatamente uma.
-- 2. NÃO RODA DUAS VEZES: as movimentações levam `referencia = 'nota:81524'`; se
--    já houver alguma, aborta sem tocar em nada. Entrada de estoque não é
--    idempotente — rodar de novo dobraria tudo.

do $$
declare
  v_empresa text := 'Tridi Escritório';   -- ← confira/troque
  v_unidade uuid;
  v_n       int;
  v_id      bigint;
  v_antes   int;
  v_faltam  text := '';
  v_achados text := '';
  r         record;
  -- codigo | padrão de nome | qtd | custo
  v_itens   text[][] := array[
    ['7891331014513', '%nutry%cereal%coco%',        '2',  '1.40'],
    ['7891331010508', '%nutry%cereal%banana%mel%',  '18', '1.40'],
    ['7895144208787', '%mentos%frutas%verm%',       '10', '1.50'],
    ['7898961989020', '%bananinha%tradicional%',    '5',  '1.50'],
    ['',              '%castanha do par%',          '5',  '1.10']
  ];
begin
  select count(*) into v_n from mercadinho.unidades where nome ilike '%' || v_empresa || '%';
  if v_n <> 1 then
    raise exception 'Esperava 1 empresa casando com "%", achei %. Ajuste v_empresa.', v_empresa, v_n;
  end if;
  select id into v_unidade from mercadinho.unidades where nome ilike '%' || v_empresa || '%';

  if exists (select 1 from mercadinho.movimentacoes where referencia = 'nota:81524') then
    raise exception 'Esta nota já foi lançada (referencia = ''nota:81524''). NADA foi alterado.';
  end if;

  -- O único item que o catálogo não tem: "Corpo e Sabor Castanha do Pará".
  -- Nasce em Doces com o preço de venda dos irmãos (R$ 2,35) e o custo do cupom.
  -- Se ele já existir com outro nome, o `ilike` acha e nada é criado.
  if not exists (select 1 from mercadinho.produtos where nome ilike '%castanha do par%') then
    insert into mercadinho.produtos (nome, categoria_id, preco_padrao, custo_padrao, sem_codigo, ativo)
    values ('Corpo e Sabor Castanha do Pará 25g',
            (select id from mercadinho.categorias where nome = 'Doces'),
            2.35, 1.10, false, true);
    raise notice 'criado: Corpo e Sabor Castanha do Pará 25g';
  end if;

  -- ── Passada 1: só procurar ────────────────────────────────────────────────
  for i in 1 .. array_length(v_itens, 1) loop
    v_id := null;
    if v_itens[i][1] <> '' then
      select id into v_id from mercadinho.produtos
       where replace(coalesce(codigo_barras, ''), ' ', '') = v_itens[i][1] limit 1;
    end if;
    if v_id is null then
      select count(*) into v_n from mercadinho.produtos where nome ilike v_itens[i][2];
      if v_n = 1 then
        select id into v_id from mercadinho.produtos where nome ilike v_itens[i][2];
      elsif v_n > 1 then
        v_faltam := v_faltam || format(E'\n  • %s → %s produtos casam com esse nome, ambíguo', v_itens[i][2], v_n);
        continue;
      end if;
    end if;
    if v_id is null then
      v_faltam := v_faltam || format(E'\n  • %s (código %s) → não achei', v_itens[i][2], coalesce(nullif(v_itens[i][1], ''), 'sem código'));
    else
      select nome into strict v_achados from (select nome from mercadinho.produtos where id = v_id) q;
      raise notice 'achei: % (id %) para %', v_achados, v_id, v_itens[i][2];
    end if;
  end loop;

  if v_faltam <> '' then
    raise exception E'NADA foi alterado. Não consegui resolver estes itens:%s\n\nMe mande esta lista: eu ajusto os padrões de nome ou cadastro o que falta.', v_faltam;
  end if;

  -- ── Passada 2: aplicar ────────────────────────────────────────────────────
  for i in 1 .. array_length(v_itens, 1) loop
    v_id := null;
    if v_itens[i][1] <> '' then
      select id into v_id from mercadinho.produtos
       where replace(coalesce(codigo_barras, ''), ' ', '') = v_itens[i][1] limit 1;
    end if;
    if v_id is null then
      select id into v_id from mercadinho.produtos where nome ilike v_itens[i][2] limit 1;
    end if;

    insert into mercadinho.estoque (unidade_id, produto_id, quantidade)
    values (v_unidade, v_id, 0)
        on conflict (unidade_id, produto_id) do nothing;
    select quantidade into v_antes from mercadinho.estoque
     where unidade_id = v_unidade and produto_id = v_id;

    update mercadinho.estoque
       set quantidade = quantidade + v_itens[i][3]::int, atualizado_em = now()
     where unidade_id = v_unidade and produto_id = v_id;
    update mercadinho.produtos
       set custo_padrao = v_itens[i][4]::numeric, atualizado_em = now()
     where id = v_id;
    insert into mercadinho.movimentacoes (unidade_id, produto_id, tipo, quantidade, motivo, referencia)
    values (v_unidade, v_id, 'ENTRADA', v_itens[i][3]::int,
            'nota 81524 · Lojão Real da Felix 14/08/2026', 'nota:81524');

    -- Preço na unidade: sem ele o produto não aparece no tablet de lá.
    insert into mercadinho.precos (unidade_id, produto_id, preco)
    select v_unidade, p.id, p.preco_padrao from mercadinho.produtos p
     where p.id = v_id
       and not exists (select 1 from mercadinho.precos x
                        where x.unidade_id = v_unidade and x.produto_id = v_id);

    select nome into v_achados from mercadinho.produtos where id = v_id;
    raise notice '%: % → % un.', v_achados, v_antes, v_antes + v_itens[i][3]::int;
  end loop;

  raise notice 'Nota 81524 lançada em "%".', v_empresa;
end $$;

-- Se algum item não for achado, esta consulta mostra o que existe de parecido:
-- select id, nome, codigo_barras from mercadinho.produtos
--  where nome ilike '%nutry%' or nome ilike '%bananinha%'
--     or nome ilike '%mentos%' or nome ilike '%corpo%sabor%'
--  order by nome;
