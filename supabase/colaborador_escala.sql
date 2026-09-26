-- Escala de expediente (jornada) do colaborador. Rode no Supabase NOVO.
alter table public.employees add column if not exists escala text;
-- valores: 'estagiario' | 'efetivado_7_16' | 'efetivado_8_17' | 'comp_7_1648' (null = não definida)
