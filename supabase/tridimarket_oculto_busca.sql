-- TridiMarket — esconder produto da lista de busca do tablet.
--
-- Diferente de INATIVAR: o produto continua à venda e continua sendo achado
-- ao BIPAR o código de barras. O que ele deixa de fazer é aparecer na lista
-- que a pessoa rola/pesquisa no totem. Serve pro que polui a busca sem
-- precisar sair do catálogo — item de uso interno, embalagem antiga que ainda
-- está saindo, produto que só a copa usa.
--
-- Idempotente: pode rodar de novo sem quebrar. O código tolera a coluna não
-- existir (trata como false), então rodar isto é o que liga a funcionalidade.
--
-- Existe uma SEGUNDA regra, essa automática e sem banco: produto com estoque
-- ZERO também some da lista de busca — a menos que seja `sem_codigo`, que
-- aparece sempre. Motivo: o item sem código (pão, fruta, granel) é vendido por
-- toque e o estoque dele é impreciso por natureza; escondê-lo por estoque
-- zerado o tornaria invendável. Essa regra mora no tablet (BuscaScreen.kt),
-- porque é decisão de exibição e o estoque já está sincronizado lá.

alter table mercadinho.produtos
  add column if not exists oculto_busca boolean not null default false;

comment on column mercadinho.produtos.oculto_busca is
  'Não aparece na lista de busca do totem. Continua vendável ao bipar o código.';

-- A busca do totem lê o catálogo inteiro e filtra em memória; o índice serve
-- pras telas do painel que listam só os ocultos.
create index if not exists produtos_oculto_busca_idx
  on mercadinho.produtos (oculto_busca)
  where oculto_busca;
