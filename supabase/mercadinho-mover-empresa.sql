-- ── Mercadinho · mudar tudo de uma empresa pra outra e apagar a origem ──────
-- Rodar no Supabase da plataforma (schema `mercadinho`, supabase/mercadinho-novo.sql).
--
-- Caso de uso: a "Galeria Tridi/Zeelux" vai deixar de existir e tudo dela passa
-- pra Zeelux.
--
-- CUIDADO COM O NOME. A empresa a remover se chama "Galeria Tridi/Zeelux" —
-- ela tem "zeelux" DENTRO do próprio nome. Um filtro `ilike '%zeelux%'` casa
-- com ela e com a Zeelux de verdade, devolve duas linhas e o script morre em
-- 21000 (ou pior: escolheria a errada). Por isso a origem é por nome EXATO e o
-- destino exclui a origem explicitamente.
--
-- Por que não dá pra fazer no `update` de uma linha só:
--
--   • `precos` e `estoque` têm chave primária (unidade_id, produto_id). Mudar
--     a unidade em bloco viola a chave em TODO produto que o destino já tem —
--     e são justamente os produtos em comum, ou seja, quase todos.
--   • `funcionarios`, `vendas`, `lancamentos`, `pagamentos` e `operacoes_compra`
--     apontam pra unidade com `on delete restrict`: enquanto essas linhas
--     existirem, o banco RECUSA apagar a empresa (não apaga junto — recusa).
--   • `precos`, `estoque`, `movimentacoes`, `dispositivos`, `dispositivo_codigos`
--     e `pessoa_unidade` são `cascade`: essas SIM sumiriam junto.
--   • `suspeitas` é `set null` — perderia a unidade e viraria órfã.
--
-- As duas decisões que este arquivo toma, e que valem conferir:
--   1. ESTOQUE SOMA. Produto que existe nas duas fica com a soma das duas
--      quantidades no destino. É o que "mudar a mercadoria de loja" significa.
--   2. PREÇO DO DESTINO MANDA. Produto que existe nas duas mantém o preço da
--      Zeelux; o da Galeria é descartado. Mover o preço mudaria em silêncio o
--      que a Zeelux cobra hoje.
--
-- Tudo dentro de um bloco só: ou faz inteiro, ou não faz nada.

-- ── PARTE 0 · Os nomes, byte a byte. Rode e confira antes de qualquer coisa. ─
-- `quote_literal` e `length` de propósito: espaço sobrando no fim, espaço fino
-- (U+00A0) e barra diferente não aparecem na tela e fazem um `nome = '...'`
-- exato achar 0 linhas — foi o que derrubou uma rodada deste script. O resto do
-- arquivo casa por `ilike '%galeria%'` / `ilike '%zeelux%'`, que não sofre disso;
-- a segurança vem da contagem ter que dar exatamente 1, não do texto certinho.
select id, quote_literal(nome) as nome_exato, length(nome) as caracteres, ativo
  from mercadinho.unidades
 order by nome;

-- Tem que haver UMA empresa casando com "galeria" e UMA com "zeelux" que não
-- seja ela. Se não for o caso, pare aqui e me mande o resultado.
select count(*) filter (where nome ilike '%galeria%')                            as origens,
       count(*) filter (where nome ilike '%zeelux%' and nome not ilike '%galeria%') as destinos
  from mercadinho.unidades;

-- ── PARTE 1 · Só olhar. ─────────────────────────────────────────────────────
with o as (
  select id from mercadinho.unidades where nome ilike '%galeria%'
), d as (
  -- Zeelux "de verdade": tem zeelux no nome e NÃO é a origem.
  select id from mercadinho.unidades
   where nome ilike '%zeelux%' and nome not ilike '%galeria%'
)
select
  (select count(*) from mercadinho.funcionarios     where unidade_id = (select id from o)) as funcionarios_que_mudam,
  (select count(*) from mercadinho.lancamentos      where unidade_id = (select id from o)) as lancamentos,
  (select count(*) from mercadinho.operacoes_compra where unidade_id = (select id from o)) as compras,
  (select count(*) from mercadinho.suspeitas        where unidade_id = (select id from o)) as suspeitas,
  (select count(*) from mercadinho.dispositivos     where unidade_id = (select id from o)) as tablets,
  (select count(*) from mercadinho.estoque e where e.unidade_id = (select id from o)
     and exists (select 1 from mercadinho.estoque x where x.unidade_id = (select id from d) and x.produto_id = e.produto_id)) as estoque_que_soma,
  (select coalesce(sum(quantidade), 0) from mercadinho.estoque where unidade_id = (select id from o)) as unidades_de_estoque_movidas,
  (select count(*) from mercadinho.precos p where p.unidade_id = (select id from o)
     and not exists (select 1 from mercadinho.precos x where x.unidade_id = (select id from d) and x.produto_id = p.produto_id)) as precos_novos_no_destino;

-- Os lançamentos que vão mudar de empresa. LEIA antes de rodar a parte 2: são
-- linhas do razão (dívida de fiado), e a regra do banco diz que lançamento não
-- se altera. Ver o bloco de aviso da parte 2.
select l.id, f.nome as pessoa, l.tipo, l.valor, l.descricao, l.ocorrido_em
  from mercadinho.lancamentos l
  join mercadinho.funcionarios f on f.id = l.funcionario_id
 where l.unidade_id = (select id from mercadinho.unidades where nome ilike '%galeria%')
 order by l.ocorrido_em;

-- Quem pode virar cadastro repetido: mesma pessoa já existente na Zeelux.
-- Não junto sozinho — dá pra unificar depois em TridiMarket > Pessoas.
select f.nome as pessoa_da_galeria,
       count(z.id) as ja_existe_na_zeelux
  from mercadinho.funcionarios f
  left join mercadinho.funcionarios z
    on lower(trim(z.nome)) = lower(trim(f.nome))
   and z.unidade_id = (select id from mercadinho.unidades
                        where nome ilike '%zeelux%' and nome not ilike '%galeria%')
 where f.unidade_id = (select id from mercadinho.unidades where nome ilike '%galeria%')
 group by f.nome
 order by 2 desc, 1;

-- ── PARTE 2 · Mover tudo e apagar a origem. ─────────────────────────────────
do $$
-- Todo nome de variável leva `v_`. Sem isso, `where unidade_id = origem` é
-- ambíguo em `mercadinho.vendas`, que TEM uma coluna chamada `origem`
-- ('tablet' | 'manual' | 'ajuste') — e o Postgres para com
--     42702: column reference "origem" is ambiguous
-- O prefixo resolve de uma vez, inclusive pras colunas que ainda não existem.
declare
  v_origem  uuid;  v_nome_origem  text;
  v_destino uuid;  v_nome_destino text;
  v_n int;
  v_func int; v_lanc int; v_compra int; v_susp int; v_disp int;
  v_soma int; v_preco_novo int; v_qtd int;
begin
  -- Origem por PADRÃO, não por nome exato. Um literal 'Galeria Tridi/Zeelux'
  -- quebra com espaço sobrando, espaço fino, barra diferente — coisas que não
  -- aparecem na tela e derrubaram o script com "achei 0". `%galeria%` é o que
  -- sempre casou; o que garante segurança é a contagem ter que dar 1, logo
  -- abaixo, não a exatidão do texto.
  select count(*) into v_n from mercadinho.unidades where nome ilike '%galeria%';
  if v_n <> 1 then
    raise exception 'Esperava 1 empresa com "galeria" no nome, achei %. Rode a PARTE 0 e confira.', v_n;
  end if;
  -- O destino exclui a origem: o nome dela TEM "zeelux" dentro.
  select count(*) into v_n from mercadinho.unidades
   where nome ilike '%zeelux%' and nome not ilike '%galeria%';
  if v_n <> 1 then
    raise exception 'Esperava 1 empresa Zeelux (fora a origem), achei %. Rode a PARTE 0 e confira.', v_n;
  end if;

  select id, nome into v_origem, v_nome_origem from mercadinho.unidades where nome ilike '%galeria%';
  select id, nome into v_destino, v_nome_destino from mercadinho.unidades
   where nome ilike '%zeelux%' and nome not ilike '%galeria%';
  if v_origem = v_destino then raise exception 'Origem e destino são a mesma empresa.'; end if;

  -- 1. ESTOQUE — soma no produto que as duas têm, move o que só a origem tem.
  select count(*), coalesce(sum(quantidade), 0) into v_soma, v_qtd
    from mercadinho.estoque where unidade_id = v_origem;

  update mercadinho.estoque d
     set quantidade = d.quantidade + o.quantidade,
         atualizado_em = now()
    from mercadinho.estoque o
   where d.unidade_id = v_destino
     and o.unidade_id = v_origem
     and o.produto_id = d.produto_id;

  delete from mercadinho.estoque o
   where o.unidade_id = v_origem
     and exists (select 1 from mercadinho.estoque d where d.unidade_id = v_destino and d.produto_id = o.produto_id);

  update mercadinho.estoque set unidade_id = v_destino, atualizado_em = now() where unidade_id = v_origem;

  -- 2. PREÇOS — o preço do destino manda; só entra o que ele ainda não tem.
  select count(*) into v_preco_novo
    from mercadinho.precos p
   where p.unidade_id = v_origem
     and not exists (select 1 from mercadinho.precos d where d.unidade_id = v_destino and d.produto_id = p.produto_id);

  delete from mercadinho.precos o
   where o.unidade_id = v_origem
     and exists (select 1 from mercadinho.precos d where d.unidade_id = v_destino and d.produto_id = o.produto_id);

  update mercadinho.precos set unidade_id = v_destino, atualizado_em = now() where unidade_id = v_origem;

  -- 3. Gente, dinheiro e histórico — mudança direta, sem chave composta no caminho.
  update mercadinho.funcionarios     set unidade_id = v_destino, atualizado_em = now() where unidade_id = v_origem;
  get diagnostics v_func = row_count;
  -- ── O razão. Leia antes de rodar. ────────────────────────────────────────
  -- `mercadinho.lancamentos` tem o gatilho `lancamentos_sem_update`, que
  -- recusa update e delete e lista `unidade_id` entre as colunas imutáveis.
  -- Não é obstáculo acidental: o razão registra ONDE a dívida nasceu, e a
  -- regra existe pra ninguém reescrever isso depois.
  --
  -- Mover a empresa de um lançamento é reescrever histórico contábil. Aqui
  -- isso é aceito porque a empresa inteira está sendo absorvida — a pessoa é
  -- a mesma, o valor é o mesmo, e deixar o lançamento apontando pra uma
  -- empresa que não existe mais não é mais honesto, é só mais quebrado.
  --
  -- O gatilho volta a valer no fim do bloco. Se qualquer coisa falhar, o
  -- Postgres desfaz o DDL junto com o resto (DDL aqui é transacional), então
  -- não existe cenário em que ele fique desligado.
  --
  -- Se preferir NÃO tocar no razão: apague este bloco e a empresa não poderá
  -- ser removida (o `on delete restrict` de `lancamentos` barra) — o caminho
  -- então é inativar pela tela, em Empresas > Editar > Inativar.
  alter table mercadinho.lancamentos disable trigger lancamentos_sem_update;
  update mercadinho.lancamentos      set unidade_id = v_destino where unidade_id = v_origem;
  get diagnostics v_lanc = row_count;
  alter table mercadinho.lancamentos enable trigger lancamentos_sem_update;
  update mercadinho.operacoes_compra set unidade_id = v_destino where unidade_id = v_origem;
  get diagnostics v_compra = row_count;
  update mercadinho.suspeitas        set unidade_id = v_destino where unidade_id = v_origem;
  get diagnostics v_susp = row_count;
  update mercadinho.dispositivos     set unidade_id = v_destino where unidade_id = v_origem;
  get diagnostics v_disp = row_count;

  -- `vendas` tem coluna `origem` — é por causa dela que toda variável aqui
  -- leva `v_`.
  update mercadinho.vendas           set unidade_id = v_destino where unidade_id = v_origem;
  update mercadinho.pagamentos       set unidade_id = v_destino where unidade_id = v_origem;
  update mercadinho.movimentacoes    set unidade_id = v_destino where unidade_id = v_origem;
  -- `pessoa_unidade` tem PK só em funcionario_id, então não há colisão possível.
  update mercadinho.pessoa_unidade   set unidade_id = v_destino, atualizado_em = now() where unidade_id = v_origem;
  -- Código de pareamento é descartável: some com a empresa, e o tablet gera outro.
  delete from mercadinho.dispositivo_codigos where unidade_id = v_origem;

  -- 4. Agora não sobra nada apontando pra origem: o `restrict` deixa apagar.
  delete from mercadinho.unidades where id = v_origem;

  raise notice 'De "%" para "%": % funcionário(s), % lançamento(s), % compra(s), % suspeita(s), % tablet(s). Estoque: % linha(s), % unidade(s) no total. Preços novos no destino: %. Empresa de origem apagada.',
    v_nome_origem, v_nome_destino, v_func, v_lanc, v_compra, v_susp, v_disp, v_soma, v_qtd, v_preco_novo;
end $$;

-- Conferir — a Galeria não pode voltar:
-- select nome, ativo from mercadinho.unidades order by nome;
--
-- E as 6 pessoas têm que estar na Zeelux:
-- select f.nome, u.nome as empresa
--   from mercadinho.funcionarios f
--   join mercadinho.unidades u on u.id = f.unidade_id
--  order by u.nome, f.nome;
