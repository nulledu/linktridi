-- ── Prioridade das atividades (Alta · Média · Baixa) — 11/09/2026 ──────────
-- A Visão geral de Atividades mostra a prioridade de cada atividade (coluna na
-- tabela de recentes e o cartão "Por prioridade"). Antes só existia o
-- `urgente` do tablet: o que já era urgente vira Alta.
--
-- Nulo = não escolhida: a tela mostra Média (ou Alta, se `urgente`).
-- Idempotente — rodar de novo não muda nada. O app funciona sem isto (lê sem a
-- coluna e trata tudo como Média); com isto, a prioridade passa a ser gravada.

alter table public.atividades add column if not exists prioridade text;

alter table public.atividades drop constraint if exists atividades_prioridade_check;
alter table public.atividades add constraint atividades_prioridade_check
  check (prioridade is null or prioridade in ('alta', 'media', 'baixa'));

update public.atividades set prioridade = 'alta'
where urgente is true and prioridade is null;

-- A API passa a enxergar a coluna na hora (sem esperar o cache do PostgREST).
notify pgrst, 'reload schema';
