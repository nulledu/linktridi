-- ═════════════════════════════════════════════════════════════════════════════
--  CATÁLOGO — os itens do galpão que ainda não estavam cadastrados
-- ═════════════════════════════════════════════════════════════════════════════
--
--  Cole no SQL Editor do Supabase e rode. Pode rodar duas vezes: item que já
--  existe é IGNORADO, não duplicado.
--
--  São 97 itens novos, separados da conversa. O que ficou de fora, e por quê:
--
--   · 7 linhas de MENSAGEM ("Caio [20h16]", "Anotei tudo isso…", "Dai acho que
--     seria bom ter outras coisas tipo:") — não são coisa que se guarda.
--
--   · os 5 títulos ("Estoque logistica", "Estoque Maquinas"…) viraram
--     CATEGORIA dos itens abaixo deles, não linha do catálogo. "Estoque
--     Máquinas" não é uma peça na prateleira: é onde as peças moram.
--
--   · 17 genéricos do primeiro bloco ("Caixas", "MDF", "Borracha", "Acrilico")
--     — quase todos reaparecem específicos na lista grande ("CAIXA P", "MDF
--     3MM"). Cadastrar os dois deixaria "Borracha" e "Rolo de borracha" no
--     mesmo catálogo, e ninguém saberia em qual dar baixa.
--
--   · 12 que JÁ EXISTEM, escritos em caixa alta na sua lista e em Título no
--     sistema: COLA PVA/Cola PVA, MDF 3MM/MDF 3mm, CAIXA P/Caixa P, BORRACHA,
--     FELTRO, DUPLA FACE, COLA BONDER, COLA SILICONE, COLA BRANCA, COLA
--     TRANSFERIVEL, MDF 6MM, CAIXA M.
--
--  DUAS CORREÇÕES que eu fiz e você deve conferir:
--   · "TINTA DE PLÁSICO VERDE" → "TINTA DE PLÁSTICO VERDE" (faltava o T);
--   · "PS Preto, Branco" virou DOIS itens (PS Preto e PS Branco).
--
--  TODOS NASCEM SEM HIERARQUIA, de propósito. Adivinhar pelo nome erra em
--  silêncio, e ninguém revisa o que parece pronto — eles aparecem na aba
--  "Não classificados" do Catálogo, com triagem em lote pra resolver de uma vez.
--  Também nascem com quantidade 0: quantidade é contagem, não chute.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── Comparar nome sem acento e sem caixa, SEM depender de extensão ───────────
--
-- A primeira versão disto usava `unaccent`, e o teste contra um Postgres de
-- verdade recusou: a extensão não estava disponível. Num arquivo que o dono
-- cola no Editor, uma extensão ausente é o mesmo que o arquivo não rodar.
--
-- `translate` faz o mesmo trabalho para o que interessa aqui — nome de material
-- em português — e existe em qualquer Postgres. É o que impede "COLA
-- TRANSFERIVEL" nascer ao lado de "Cola transferível": o catálogo NÃO tem
-- UNIQUE em `nome`, então sem esta comparação o banco aceitaria os dois, o
-- estoque racharia em dois itens do mesmo material e nenhum dos dois números
-- fecharia.
create or replace function public.estoque_nome_chave(t text)
returns text language sql immutable as $$
  select translate(
    lower(coalesce(t, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn'
  );
$$;

-- Um comando só, com a lista inteira: 97 inserts separados fariam 97 varreduras
-- da tabela e uma parede de SQL onde ninguém acha o item que quer conferir.
with novos(nome, categoria, obs) as (values
  ('ROLO KRAFT', 'Logística', null),
  ('PAPEL A4', 'Logística', null),
  ('SULFITE', 'Logística', null),
  ('SERINGA', 'Montagem', null),
  ('NUGGET', 'Limpeza e manutenção', 'Graxa de sapato'),
  ('DUREX', 'Logística', null),
  ('ISOPROPILICO', 'Limpeza e manutenção', null),
  ('SACO ECOMMERCE P (23x13,5) - PCT 500UN', 'Logística', null),
  ('SACO ECOMMERCE M (26x36) - PCT 500UN', 'Logística', null),
  ('LITTLE THREE', 'Brindes', 'Cheirinho'),
  ('TONNER', 'Logística', 'Da impressora'),
  ('ARGOLA', 'Brindes', 'Pro chaveiro'),
  ('ETIQUETA DE ENVIO', 'Logística', null),
  ('SACO KIT BRINDE', 'Logística', null),
  ('SACO TRIDI CLEAN', 'Logística', null),
  ('DESENGRIPANTE', 'Limpeza e manutenção', null),
  ('BISCUIT', 'Montagem', null),
  ('FLANELA', 'Limpeza e manutenção', null),
  ('LUVA LATEX', 'Limpeza e manutenção', null),
  ('LUVA PROTEÇÃO M', 'Limpeza e manutenção', null),
  ('LUVA PROTEÇÃO G', 'Limpeza e manutenção', null),
  ('MÁSCARA DE PROTEÇÃO', 'Limpeza e manutenção', null),
  ('PANO XADREZ', 'Limpeza e manutenção', null),
  ('PERFLEX', 'Insumos/MP processada', null),
  ('LÂMINA DE ESTILETE', 'Montagem', null),
  ('ALCOOL', 'Limpeza e manutenção', null),
  ('SACO DE PIPOCA', 'Logística', null),
  ('SACO DE LIXO P', 'Limpeza e manutenção', null),
  ('SACO DE LIXO G', 'Limpeza e manutenção', null),
  ('TINTA DE MADEIRA', 'Tintas', null),
  ('COTONETE', 'Limpeza e manutenção', null),
  ('DESENGORDURANTE', 'Limpeza e manutenção', null),
  ('BICO BONDER', 'Montagem', null),
  ('SACO BOLHA', 'Logística', null),
  ('CHANCELA DE METAL', 'Chancelas', null),
  ('LIXA', 'Máquinas', null),
  ('ACRÍLICO', 'Máquinas', null),
  ('PAPEL KRAFT', 'Logística', null),
  ('FRASCO PAPEL (10 ml)', 'Embalagem', null),
  ('FRASCO PAPEL (30 ml)', 'Embalagem', null),
  ('FRASCO PAPEL (60 ml)', 'Embalagem', null),
  ('FRASCO PLÁSTICO (50 ml)', 'Embalagem', null),
  ('FRASCO ISOPOR (30 ml)', 'Embalagem', null),
  ('FRASCO TRIDI CLEAN', 'Embalagem', null),
  ('FITA LED', 'Logo Iluminada', null),
  ('FONTE FITA LED', 'Logo Iluminada', null),
  ('TINTA DE PAPEL PRETA (5 l)', 'Tintas', null),
  ('TINTA DE PLÁSTICO PRETA', 'Tintas', null),
  ('TINTA DE PLÁSTICO BRANCA', 'Tintas', null),
  ('TINTA DE PLÁSTICO VERDE', 'Tintas', 'No papel veio ''PLÁSICO'' — typo corrigido'),
  ('TINTA DE PLÁSTICO AZUL', 'Tintas', null),
  ('TINTA DE PLÁSTICO ROXO', 'Tintas', null),
  ('TINTA DE PLÁSTICO VERMELHA', 'Tintas', null),
  ('TINTA DE PLÁSTICO ROSA', 'Tintas', null),
  ('TINTA DE ISOPOR PRETA', 'Tintas', null),
  ('ETIQUETA PAPEL PRETO (30 ML)', 'Etiquetas', null),
  ('ETIQUETA PAPEL PRETO (60 ML)', 'Etiquetas', null),
  ('ETIQUETA PAPEL PRETO (10 ML)', 'Etiquetas', null),
  ('ETIQUETA ISOPOR PRETO (30 ml)', 'Etiquetas', null),
  ('ETIQUETA PLÁSTICO PRETO (50 ml)', 'Etiquetas', null),
  ('ETIQUETA PLÁSTICO BRANCO (50 ml)', 'Etiquetas', null),
  ('ETIQUETA PLÁSTICO VERDE (50 ml)', 'Etiquetas', null),
  ('ETIQUETA PLÁSTICO AZUL (50 ml)', 'Etiquetas', null),
  ('ETIQUETA PLÁSTICO ROXO (50 ml)', 'Etiquetas', null),
  ('ETIQUETA PLÁSTICO VERMELHO (50 ml)', 'Etiquetas', null),
  ('ETIQUETA PLÁSTICO ROSA (50 ml)', 'Etiquetas', null),
  ('ETIQUETA FIXADOR (10ML)', 'Etiquetas', null),
  ('NYKON 343D', 'Carimbos', null),
  ('NYKON 321DP (0,5X2,5cm)', 'Carimbos', null),
  ('NYKON 343 (4,3X4,3 cm)', 'Carimbos', null),
  ('NYKON 304 (2,3X5,9 cm)', 'Carimbos', null),
  ('NYKON 302 (1,4X3,8 cm)', 'Carimbos', null),
  ('NYKON C40 (4 cm)', 'Carimbos', null),
  ('NYKON C50 (5 cm)', 'Carimbos', null),
  ('NYKON 303 (1,8X4,7 cm)', 'Carimbos', null),
  ('TRODAT 3927 (6X4 cm)', 'Carimbos', null),
  ('TRODAT 3911 (3,8X1,4 cm)', 'Carimbos', null),
  ('TRODAT 5211 (8,5X5,5 cm)', 'Carimbos', null),
  ('TRODAT 5221 (11,6X7CM)', 'Carimbos', null),
  ('Rolo de borracha', 'Máquinas', null),
  ('Folha de borracha A4', 'Máquinas', null),
  ('Rolo de EVA preto', 'Insumos/MP processada', null),
  ('PS Preto', 'Insumos/MP processada', 'No papel: ''PS Preto, Branco'' — separei em dois'),
  ('PS Branco', 'Insumos/MP processada', 'No papel: ''PS Preto, Branco'' — separei em dois'),
  ('Chapa de Acrílico Bruta 50x50', 'Máquinas', null),
  ('Chapa de acrílico cortada 30x30', 'Máquinas', null),
  ('Chapa de acrílico cortada 30x20', 'Máquinas', null),
  ('Chapa de acrílico cortada 20x20', 'Máquinas', null),
  ('Chapa de MDF Cru 3mm', 'Máquinas', null),
  ('Chapa de MDF Cru 6mm', 'Máquinas', null),
  ('Etiqueta dourada 5cm', 'Etiquetas', null),
  ('Etiqueta dourada 6cm', 'Etiquetas', null),
  ('Etiqueta prata 5cm', 'Etiquetas', null),
  ('Etiqueta prata 6cm', 'Etiquetas', null),
  ('Etiqueta serrilhada dourada 5cm', 'Etiquetas', null),
  ('Etiqueta serrilhada dourada 6cm', 'Etiquetas', null),
  ('Etiqueta retangular dourada 5cm', 'Etiquetas', null)
)
insert into public.estoque_itens (nome, categoria, observacoes, quantidade, ativo)
select n.nome, n.categoria, n.obs, 0, true
  from novos n
 where not exists (
   select 1 from public.estoque_itens e
    where public.estoque_nome_chave(e.nome) = public.estoque_nome_chave(n.nome)
 );

commit;


-- ═════════════════════════════════════════════════════════════════════════════
--  DEPOIS DE RODAR — confira
-- ═════════════════════════════════════════════════════════════════════════════
select
  count(*)                                   as itens_no_catalogo,
  count(*) filter (where hierarquia is null) as esperando_classificacao
from public.estoque_itens;

-- Os que esperam classificação, por categoria — é a lista que a triagem em
-- lote do Catálogo vai atacar:
select coalesce(categoria, '(sem categoria)') as categoria, count(*)
  from public.estoque_itens
 where hierarquia is null
 group by 1 order by 2 desc;

-- Nome repetido (deve voltar VAZIO). Se voltar alguma linha, houve duplicata e
-- é melhor descobrir aqui do que num inventário daqui a três meses:
select public.estoque_nome_chave(nome) as chave, count(*), array_agg(nome)
  from public.estoque_itens
 group by 1 having count(*) > 1;
