-- Fase 2 — Permissões por PERFIL (Departamento ↓ Perfil ↓ Permissões de módulo).
-- Configura-se o perfil UMA vez; todos que recebem o perfil herdam. Rode no Supabase NOVO.

-- Template de acesso por (departamento, perfil) → lista de módulos liberados.
create table if not exists public.perfil_templates (
  departamento text not null,
  perfil text not null,
  modulos jsonb not null default '[]'::jsonb,   -- ex.: ["analytics","comercial","minhas-atividades"]
  updated_at timestamptz not null default now(),
  primary key (departamento, perfil)
);

-- Override individual (exceções): { "analytics": true, "estoque": false }.
alter table public.employees add column if not exists permissoes jsonb;
