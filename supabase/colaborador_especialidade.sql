-- Especialidade fixa do colaborador (quem faz chancela só faz chancela, etc.).
-- Usada pela auto-atribuição de requisições do app. Rode no Supabase NOVO.
alter table public.employees add column if not exists especialidade text;
-- valores esperados: 'Chancela' | 'Carimbo' | 'Ambos' (null = sem especialidade)
