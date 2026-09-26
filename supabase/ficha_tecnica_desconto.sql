-- Ficha técnica · toggle "desconta do estoque" por linha
--
-- Duas perguntas diferentes que a ficha responde, e só a segunda é nova:
--
--   1. QUANTO a peça precisa de cada componente — CONSOME (3 parafusos por
--      pinça) ou RENDE (1 chapa rende 72 acolchoados, uma fração). Já existia,
--      grava `quantidade`, e é o que a cadeia usa pra saber se falta material.
--      Vale SEMPRE: 15 carcaças precisam de 15 bases, descontando ou não.
--
--   2. Se PRODUZIR dá BAIXA daquele componente no estoque. É esta coluna, e
--      ela nasce DESLIGADA: por decisão do dono, nenhum item desconta do
--      estoque — nem do outro — até alguém ligar o toggle da linha no
--      cadastro do item. A baixa acontece quando a conferência aprova a
--      produção (é o único momento em que a peça entra no estoque).
--
-- Sem este script o sistema continua de pé: nada desconta, que é o padrão.
-- A tela avisa se alguém ligar um toggle antes de o script rodar.
--
-- Seguro de rodar mais de uma vez.
alter table ficha_tecnica
  add column if not exists desconta boolean not null default false;

comment on column ficha_tecnica.desconta is
  'true = quando a conferência aprova a produção do item, dá baixa deste componente no estoque (quantidade × aprovadas). Padrão: false.';
