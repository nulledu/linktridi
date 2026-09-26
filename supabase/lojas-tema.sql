-- ═════════════════════════════════════════════════════════════════════════════
-- VITRINE COM TEMA — o editor de seções de /lojas/<id>/aparencia
--
-- Rode este arquivo inteiro no SQL Editor do Supabase. É IDEMPOTENTE: pode
-- rodar de novo sem apagar nada.
--
-- Depende de `supabase/lojas.sql` já ter rodado (é ele que cria `public.lojas`).
--
-- Antes disso, o editor abre, mostra tudo e AVISA que não grava; a vitrine
-- pública cai no tema do modelo. Nada fica inutilizável esperando esta ida ao
-- SQL Editor — é a mesma tolerância do resto do módulo.
--
-- Duas decisões que valem explicação:
--
-- 1. São DUAS colunas, `tema` e `tema_rascunho`, e não uma tabela de versões.
--    O que o visitante vê e o que o lojista está mexendo são coisas diferentes:
--    mexer no tema de uma loja no ar não pode ir ao ar meio pronto. Histórico
--    de versões não entra porque a volta atrás é o desfazer do editor, não um
--    cadastro que alguém precise limpar depois.
--
-- 2. `jsonb` e não colunas por ajuste. A forma do tema é uma árvore — seções
--    com blocos ordenados —, e ela MUDA toda vez que uma seção nova nasce.
--    Colunas exigiriam migração a cada seção; o jsonb é normalizado na leitura
--    (`normalizarTema`), que é onde tema velho ganha ajuste novo e tema mexido
--    à mão perde o que não existe.
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.lojas add column if not exists tema          jsonb;
alter table public.lojas add column if not exists tema_rascunho jsonb;

comment on column public.lojas.tema is
  'Tema publicado: o que o visitante vê em /l/<slug>. Formato em lib/vitrine/tipos.ts.';
comment on column public.lojas.tema_rascunho is
  'Tema em edição. null quando não há alteração pendente de publicação.';

-- A vitrine pública lê `tema` da loja por slug ou por host; o índice que já
-- existe em `slug` continua servindo. Nenhum índice novo é necessário — jsonb
-- aqui é sempre lido inteiro, nunca filtrado por dentro.
