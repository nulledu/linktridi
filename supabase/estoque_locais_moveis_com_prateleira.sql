-- ═════════════════════════════════════════════════════════════════════════════
--  ESTOQUE · LOCAIS — só o que é MÓVEL (prateleira/estante/bancada/balcão)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Recorte do mapeamento completo do galpão: fica de fora chão, parede nua e
-- palete/ponto de recebimento — essas posições não têm onde colar etiqueta.
-- O que entra é só o que o dono confirmou pelas mensagens (mapeamento
-- "Rua A/B/C/D/E" já simplificado, não a lista original de 46 locais).
--
-- Idempotente e aditivo, mesmo padrão do resto de supabase/: cada insert só
-- cria a linha que ainda não existe (lower(codigo) comparado).
--
-- O que NÃO entra aqui, e por quê:
--   A-02  Pilha de Chapas no Chão              — chão, não é móvel
--   A-03  Embaixo da Bancada                   — vão vazio, não é móvel
--   B-01-1 Embaixo da mesa preta                — vão vazio (B-01-2, a
--          prateleira suspensa da parede, ENTRA)
--   C-06  Chão dos Retalhos (ao lado da máquina) — chão
--   D-02, D-03                                  — ENTRAM: são posição única,
--          mas são prateleira suspensa e bancada/carrinhos, não chão nem parede
--   REC   Ponto de Recebimento (paletes no chão) — palete
--   E-01  Canto do Piso / Pilha de Caixas        — chão
--
-- B-01 entra só como PAI de B-01-2 (não tem etiqueta própria: a mesa preta em
-- si é "embaixo", que ficou fora — quem imprime é o filho B-01-2).

begin;

-- ── 1. As ruas (pai de tudo) ──────────────────────────────────────────────────
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

-- ── 2. Os móveis (só os que têm onde colar etiqueta) ─────────────────────────
insert into public.estoque_locais (codigo, nome, pai_id, ordem)
select v.codigo, v.nome, p.id, v.ordem
  from (values
  ('A-01', 'Estante de Produtos', 'A', 10),
  ('B-01', 'Mesa Preta e Prateleira da Parede', 'B', 10),
  ('B-02', 'Bancada Branca · Módulo Esquerdo', 'B', 20),
  ('B-03', 'Bancada Branca · Módulo Centro', 'B', 30),
  ('B-04', 'Bancada Branca · Módulo Direito', 'B', 40),
  ('C-01', 'Mesa da Grade', 'C', 10),
  ('C-02', 'Mesa do Meio', 'C', 20),
  ('C-03', 'Estante Cinza', 'C', 30),
  ('C-04', 'Prateleiras de Canto e Nicho', 'C', 40),
  ('C-05', 'Bancada Grande de Montagem', 'C', 50),
  ('D-01', 'Estante Alta de Monitores e Caixas', 'D', 10),
  ('D-02', 'Prateleiras Suspensas da Parede', 'D', 20),
  ('D-03', 'Célula das Impressoras 3D e Carrinhos de Filamento', 'D', 30),
  ('E-02', 'Estante Metálica de Frascos e Cestos', 'E', 30),
  ('E-03', 'Estante Metálica de Caixas e Bobinas', 'E', 40),
  ('E-04', 'Balcão de Madeira · Embalagem e Expedição', 'E', 50)
  ) as v(codigo, nome, pai, ordem)
  join public.estoque_locais p on lower(p.codigo) = lower(v.pai)
 where not exists (
   select 1 from public.estoque_locais l where lower(l.codigo) = lower(v.codigo)
 );

-- ── 3. Os níveis (a etiqueta de verdade) ─────────────────────────────────────
insert into public.estoque_locais (codigo, nome, pai_id, ordem)
select v.codigo, v.nome, p.id, v.ordem
  from (values
  ('A-01-1', 'Nível 1 (o mais baixo)', 'A-01', 10),
  ('A-01-2', 'Nível 2', 'A-01', 20),
  ('A-01-3', 'Nível 3', 'A-01', 30),
  ('A-01-4', 'Nível 4', 'A-01', 40),
  ('A-01-5', 'Nível 5', 'A-01', 50),
  ('A-01-6', 'Nível 6 (o mais alto)', 'A-01', 60),
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

commit;

-- Confira: devolve as etiquetas físicas (D-02/D-03 imprimem o código do
-- móvel direto — não têm nível; os demais imprimem o nível).
select codigo, nome
  from public.estoque_locais
 where codigo ~ '^(A-01-|B-01-2|B-0[234]-|C-0[12345]-|C-0[12]-|D-01-|D-02$|D-03$|E-0[234]-)'
    or codigo in ('D-02', 'D-03')
 order by codigo;
