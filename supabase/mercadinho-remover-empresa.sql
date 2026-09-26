-- ── Mercadinho · remover uma empresa (unidade) de vez ───────────────────────
-- Rodar no Supabase da plataforma (schema `mercadinho`, supabase/mercadinho-novo.sql).
--
-- Apagar uma unidade NÃO é como inativá-la. `mercadinho.unidades` é referenciada
-- por 12 tabelas, todas com `on delete cascade` — um `delete` leva junto, calado
-- e sem volta:
--
--   funcionarios  · pessoa_unidade · lancamentos · pagamentos   ← gente e dinheiro
--   vendas        · movimentacoes  · suspeitas   · operacoes_compra
--   precos        · estoque        · dispositivos · dispositivo_codigos
--
-- `funcionarios` é o que assusta: apagar a unidade apaga as PESSOAS cadastradas
-- nela, e daí cascateia pros limites, scores e histórico de cada uma.
--
-- Por isso este arquivo tem duas partes. A 1 só olha. A 2 apaga, mas ABORTA
-- sozinha se encontrar venda, lançamento, pagamento, funcionário, compra ou
-- suspeita — ou seja, se a premissa "essa empresa não tem nada ainda" estiver
-- errada, nada é apagado e a mensagem diz o que existe.
--
-- Se a parte 2 abortar, o caminho certo é INATIVAR pela tela
-- (TridiMarket › Empresas › Editar › Inativar): some de tudo, guarda o histórico.

-- ── PARTE 1 · Só olhar. Rode isto primeiro, sozinho, e leia o resultado. ─────
with alvo as (
  select id, nome from mercadinho.unidades where nome ilike '%galeria%'
)
select a.nome,
       (select count(*) from mercadinho.vendas           v where v.unidade_id = a.id) as vendas,
       (select count(*) from mercadinho.funcionarios     f where f.unidade_id = a.id) as funcionarios,
       (select count(*) from mercadinho.lancamentos      l where l.unidade_id = a.id) as lancamentos,
       (select count(*) from mercadinho.pagamentos       p where p.unidade_id = a.id) as pagamentos,
       (select count(*) from mercadinho.operacoes_compra o where o.unidade_id = a.id) as compras,
       (select count(*) from mercadinho.suspeitas        s where s.unidade_id = a.id) as suspeitas,
       (select count(*) from mercadinho.movimentacoes    m where m.unidade_id = a.id) as movimentacoes,
       (select count(*) from mercadinho.dispositivos     d where d.unidade_id = a.id) as tablets,
       (select count(*) from mercadinho.precos           x where x.unidade_id = a.id) as precos,
       (select count(*) from mercadinho.estoque          e where e.unidade_id = a.id) as estoque
  from alvo a;

-- Tudo zero nas seis primeiras colunas? Pode rodar a parte 2.
-- `precos`, `estoque` e `movimentacoes` podem ter linha e tudo bem: são a
-- prateleira montada, não histórico de ninguém.

-- ── PARTE 2 · Apagar, com trava. ────────────────────────────────────────────
do $$
declare
  alvo        uuid;
  nome_alvo   text;
  quantas     int;
  n_vendas    int;  n_func   int;  n_lanc int;
  n_pag       int;  n_compra int;  n_susp int;
  n_precos    int;  n_estoq  int;  n_mov  int;  n_disp int;
begin
  -- Um nome, uma empresa. Dois "Galeria" no banco e o script não escolhe por
  -- conta própria qual apagar.
  select count(*) into quantas from mercadinho.unidades where nome ilike '%galeria%';
  if quantas = 0 then
    raise exception 'Nenhuma empresa com "galeria" no nome. Confira em TridiMarket > Empresas e ajuste o filtro deste script.';
  elsif quantas > 1 then
    raise exception '% empresas casam com "galeria". Troque o filtro por nome exato antes de rodar.', quantas;
  end if;

  select id, nome into alvo, nome_alvo from mercadinho.unidades where nome ilike '%galeria%';

  select count(*) into n_vendas from mercadinho.vendas           where unidade_id = alvo;
  select count(*) into n_func   from mercadinho.funcionarios     where unidade_id = alvo;
  select count(*) into n_lanc   from mercadinho.lancamentos      where unidade_id = alvo;
  select count(*) into n_pag    from mercadinho.pagamentos       where unidade_id = alvo;
  select count(*) into n_compra from mercadinho.operacoes_compra where unidade_id = alvo;
  select count(*) into n_susp   from mercadinho.suspeitas        where unidade_id = alvo;

  -- A trava. Gente, dinheiro e histórico não somem por engano.
  if n_vendas + n_func + n_lanc + n_pag + n_compra + n_susp > 0 then
    raise exception
      'NADA foi apagado. "%" tem % venda(s), % funcionário(s), % lançamento(s), % pagamento(s), % compra(s), % suspeita(s). Apagar levaria tudo isso junto, sem volta — inative pela tela (Empresas > Editar > Inativar).',
      nome_alvo, n_vendas, n_func, n_lanc, n_pag, n_compra, n_susp;
  end if;

  -- Sobra só a prateleira montada: some junto, e é isso mesmo que se quer.
  select count(*) into n_precos from mercadinho.precos        where unidade_id = alvo;
  select count(*) into n_estoq  from mercadinho.estoque       where unidade_id = alvo;
  select count(*) into n_mov    from mercadinho.movimentacoes where unidade_id = alvo;
  select count(*) into n_disp   from mercadinho.dispositivos  where unidade_id = alvo;

  delete from mercadinho.unidades where id = alvo;

  raise notice 'Empresa "%" apagada. Junto foram % preço(s), % linha(s) de estoque, % movimentação(ões) e % tablet(s) pareado(s).',
    nome_alvo, n_precos, n_estoq, n_mov, n_disp;
end $$;

-- Conferir (não pode voltar nenhuma linha):
-- select id, nome, ativo from mercadinho.unidades where nome ilike '%galeria%';
--
-- E as que ficaram:
-- select nome, ativo from mercadinho.unidades order by nome;
