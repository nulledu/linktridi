-- Multi-tablet por pessoa: em quais tablets (mesas) o colaborador aparece.
-- Antes era uma mesa só (employees.mesa); agora uma lista. mesa continua existindo
-- por retrocompatibilidade (o código lê `mesas` e cai pra `mesa` se vazio).
-- Vazio/null = todas as mesas do setor (comportamento padrão). Rodar no Supabase NOVO.
alter table public.employees add column if not exists mesas text[];
