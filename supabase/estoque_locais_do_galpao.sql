-- ── Os locais do galpão, do mapeamento que o dono fez a pé ───────────────────
--
-- Cinco ruas, 21 móveis e 54 níveis: 80 linhas em `estoque_locais`, na árvore
-- que a tabela já suporta (rua → móvel → nível, por `pai_id`).
--
-- O PADRÃO É O DELE, e está escrito na fonte: "Rua - Móvel - Nível (1, 2 ou 3)",
-- "sem subdivisões com letras ou códigos longos. Cada móvel é um número (01 a
-- 06) e a altura é 1, 2 ou 3". Por isso `A-01-1` e nunca `A.01.EST.N1` — o
-- `codigo` é o que cabe na etiqueta de 80mm ao lado das barras, e cada
-- caractere ali disputa espaço com o nome da peça.
--
-- ── AS DUAS EXCEÇÕES, que são do galpão e não do desenho ─────────────────────
--
--  · POSIÇÃO ÚNICA não ganha nível. A-02 (pilha de chapas no chão), A-03, C-06
--    (chão dos retalhos), D-02, D-03, E-01 e REC entram como folha direta da
--    rua. Criar um "A-02-1" para um lugar que não tem andar é inventar uma
--    escolha na hora de etiquetar — e quem está de luva escolheria diferente a
--    cada peça.
--  · REC não é "E-05". O dono deu um código próprio ao ponto de recebimento, e
--    ele é o único lugar que significa um ESTADO da mercadoria (chegou, ainda
--    não foi guardada) em vez de um móvel. Fica sob a Rua E porque é lá que
--    ele está fisicamente.
--
-- E-04 tem 6 níveis num balcão "dividido em 2 lados": 1 a 3 são o lado
-- esquerdo, 4 a 6 o direito, exatamente como ele escreveu. O nome de cada um
-- diz o lado, porque "E-04-4" sozinho não conta isso pra ninguém.
--
-- ── Idempotente ──────────────────────────────────────────────────────────────
--
-- Cada bloco só insere o que ainda não existe, comparando por `lower(codigo)` —
-- o mesmo critério do índice único da tabela. Rodar duas vezes não duplica; e
-- se alguém já tiver criado "C-03" pela tela, o bloco respeita o que está lá e
-- pendura os níveis no local existente em vez de estourar.
--
-- Os blocos são NESTA ORDEM de propósito: móvel procura a rua pelo código, e
-- nível procura o móvel. Rodar o arquivo inteiro de uma vez resolve tudo; rodar
-- só o terceiro bloco num banco vazio não cria nada e não quebra nada.
--
-- `ordem` em dezenas (10, 20, 30…) pra caber um móvel novo no meio sem
-- renumerar os vizinhos.

-- ── 1. As ruas ───────────────────────────────────────────────────────────────
insert into public.estoque_locais (codigo, nome, pai_id, ordem)
select v.codigo, v.nome, null, v.ordem
  from (values
  ('A', 'Rua A', 10),
  ('B', 'Rua B', 20),
  ('C', 'Rua C', 30),
  ('D', 'Rua D', 40),
  ('E', 'Rua E · Expedição e Logística', 50)
  ) as v(codigo, nome, ordem)
 where not exists (
   select 1 from public.estoque_locais l where lower(l.codigo) = lower(v.codigo)
 );

-- ── 2. Os móveis ─────────────────────────────────────────────────────────────
insert into public.estoque_locais (codigo, nome, pai_id, ordem)
select v.codigo, v.nome, p.id, v.ordem
  from (values
  ('A-01', 'Estante de Produtos', 'A', 10),
  ('A-02', 'Pilha de Chapas no Chão', 'A', 20),
  ('A-03', 'Embaixo da Bancada', 'A', 30),
  ('B-01', 'Mesa Preta e Prateleira da Parede', 'B', 10),
  ('B-02', 'Bancada Branca · Módulo Esquerdo', 'B', 20),
  ('B-03', 'Bancada Branca · Módulo Centro', 'B', 30),
  ('B-04', 'Bancada Branca · Módulo Direito', 'B', 40),
  ('C-01', 'Mesa da Grade', 'C', 10),
  ('C-02', 'Mesa do Meio', 'C', 20),
  ('C-03', 'Estante Cinza', 'C', 30),
  ('C-04', 'Prateleiras de Canto e Nicho', 'C', 40),
  ('C-05', 'Bancada Grande de Montagem', 'C', 50),
  ('C-06', 'Chão dos Retalhos (ao lado da máquina)', 'C', 60),
  ('D-01', 'Estante Alta de Monitores e Caixas', 'D', 10),
  ('D-02', 'Prateleiras Suspensas da Parede', 'D', 20),
  ('D-03', 'Célula das Impressoras 3D e Carrinhos de Filamento', 'D', 30),
  ('REC', 'Ponto de Recebimento (paletes no chão)', 'E', 10),
  ('E-01', 'Canto do Piso · Pilha de Caixas', 'E', 20),
  ('E-02', 'Estante Metálica de Frascos e Cestos', 'E', 30),
  ('E-03', 'Estante Metálica de Caixas e Bobinas', 'E', 40),
  ('E-04', 'Balcão de Madeira · Embalagem e Expedição', 'E', 50)
  ) as v(codigo, nome, pai, ordem)
  join public.estoque_locais p on lower(p.codigo) = lower(v.pai)
 where not exists (
   select 1 from public.estoque_locais l where lower(l.codigo) = lower(v.codigo)
 );

-- ── 3. Os níveis ─────────────────────────────────────────────────────────────
insert into public.estoque_locais (codigo, nome, pai_id, ordem)
select v.codigo, v.nome, p.id, v.ordem
  from (values
  ('A-01-1', 'Nível 1 (o mais baixo)', 'A-01', 10),
  ('A-01-2', 'Nível 2', 'A-01', 20),
  ('A-01-3', 'Nível 3', 'A-01', 30),
  ('A-01-4', 'Nível 4', 'A-01', 40),
  ('A-01-5', 'Nível 5', 'A-01', 50),
  ('A-01-6', 'Nível 6 (o mais alto)', 'A-01', 60),
  ('B-01-1', 'Embaixo da mesa preta', 'B-01', 10),
  ('B-01-2', 'Prateleira suspensa da parede', 'B-01', 20),
  ('B-02-1', 'Nível 1 (o mais baixo)', 'B-02', 10),
  ('B-02-2', 'Nível 2 (do meio)', 'B-02', 20),
  ('B-02-3', 'Nível 3 (o mais alto)', 'B-02', 30),
  ('B-03-1', 'Nível 1 (o mais baixo)', 'B-03', 10),
  ('B-03-2', 'Nível 2 (do meio)', 'B-03', 20),
  ('B-03-3', 'Nível 3 (o mais alto)', 'B-03', 30),
  ('B-04-1', 'Nível 1 (o mais baixo)', 'B-04', 10),
  ('B-04-2', 'Nível 2 (do meio)', 'B-04', 20),
  ('B-04-3', 'Nível 3 (o mais alto)', 'B-04', 30),
  ('C-01-1', 'Embaixo (chão/base)', 'C-01', 10),
  ('C-01-2', 'Em cima (tampo)', 'C-01', 20),
  ('C-02-1', 'Embaixo (chão/base)', 'C-02', 10),
  ('C-02-2', 'Em cima (tampo)', 'C-02', 20),
  ('C-03-1', 'Nível 1 (o mais baixo)', 'C-03', 10),
  ('C-03-2', 'Nível 2 (do meio)', 'C-03', 20),
  ('C-03-3', 'Nível 3 (o mais alto)', 'C-03', 30),
  ('C-04-1', 'Nível 1 (o mais baixo)', 'C-04', 10),
  ('C-04-2', 'Nível 2 (do meio)', 'C-04', 20),
  ('C-04-3', 'Nível 3 (o mais alto)', 'C-04', 30),
  ('C-05-1', 'Nível 1 (o mais baixo)', 'C-05', 10),
  ('C-05-2', 'Nível 2 (do meio)', 'C-05', 20),
  ('C-05-3', 'Nível 3 (o mais alto)', 'C-05', 30),
  ('D-01-1', 'Nível 1 (o mais baixo)', 'D-01', 10),
  ('D-01-2', 'Nível 2', 'D-01', 20),
  ('D-01-3', 'Nível 3', 'D-01', 30),
  ('D-01-4', 'Nível 4', 'D-01', 40),
  ('D-01-5', 'Nível 5 (o mais alto)', 'D-01', 50),
  ('E-02-1', 'Nível 1 (o mais baixo)', 'E-02', 10),
  ('E-02-2', 'Nível 2', 'E-02', 20),
  ('E-02-3', 'Nível 3', 'E-02', 30),
  ('E-02-4', 'Nível 4', 'E-02', 40),
  ('E-02-5', 'Nível 5', 'E-02', 50),
  ('E-02-6', 'Nível 6', 'E-02', 60),
  ('E-02-7', 'Nível 7', 'E-02', 70),
  ('E-02-8', 'Nível 8 (o mais alto)', 'E-02', 80),
  ('E-03-1', 'Nível 1 (o mais baixo)', 'E-03', 10),
  ('E-03-2', 'Nível 2', 'E-03', 20),
  ('E-03-3', 'Nível 3', 'E-03', 30),
  ('E-03-4', 'Nível 4', 'E-03', 40),
  ('E-03-5', 'Nível 5 (o mais alto)', 'E-03', 50),
  ('E-04-1', 'Lado esquerdo · 1', 'E-04', 10),
  ('E-04-2', 'Lado esquerdo · 2', 'E-04', 20),
  ('E-04-3', 'Lado esquerdo · 3', 'E-04', 30),
  ('E-04-4', 'Lado direito · 1', 'E-04', 40),
  ('E-04-5', 'Lado direito · 2', 'E-04', 50),
  ('E-04-6', 'Lado direito · 3', 'E-04', 60)
  ) as v(codigo, nome, pai, ordem)
  join public.estoque_locais p on lower(p.codigo) = lower(v.pai)
 where not exists (
   select 1 from public.estoque_locais l where lower(l.codigo) = lower(v.codigo)
 );

-- ── 4. O que entrou ──────────────────────────────────────────────────────────
-- Lê em voz alta o resultado, por rua, em vez de deixar quem rodou adivinhar se
-- funcionou. 5 ruas · 21 móveis · 54 níveis = 80 linhas num banco que estava
-- vazio.
do $$
declare
  ruas int; moveis int; niveis int;
begin
  select count(*) into ruas   from public.estoque_locais where pai_id is null;
  select count(*) into moveis from public.estoque_locais l
    join public.estoque_locais p on p.id = l.pai_id where p.pai_id is null;
  select count(*) into niveis from public.estoque_locais l
    join public.estoque_locais p on p.id = l.pai_id
    join public.estoque_locais a on a.id = p.pai_id;
  raise notice 'Locais do galpão: % rua(s), % móvel(is), % nível(is) — % no total.',
    ruas, moveis, niveis, ruas + moveis + niveis;
end $$;
