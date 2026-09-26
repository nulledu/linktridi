-- ── Módulo 3D: biblioteca de arquivos de impressão ──────────────────────────
-- MVP (set/2026): acervo central dos arquivos que rodam nas impressoras 3D.
-- O arquivo em si mora no Backblaze B2 (área privada `modelos/`); o banco
-- guarda o caminho relativo `/api/arquivos/modelos/...` como em toda área
-- privada. A evolução prevista (máquinas, programações, kanban de produção)
-- vai referenciar `impressao3d_arquivos.id` — por isso a tabela já nasce com
-- uuid e sem nada específico de "biblioteca" no nome das colunas.
--
-- Idempotente: rodar de novo não muda nada.

create table if not exists public.impressao3d_arquivos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text not null default '',
  url text not null,                       -- /api/arquivos/modelos/aaaa/mm/<uuid>.<ext>
  formato text not null,                   -- stl | obj | 3mf | gcode | step | ply | glb | outro
  mime text,
  tamanho bigint,                          -- bytes, como o navegador informou no envio
  tags text[] not null default '{}',
  criado_por uuid references public.profiles (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists impressao3d_arquivos_criado_em
  on public.impressao3d_arquivos (criado_em desc);
create index if not exists impressao3d_arquivos_formato
  on public.impressao3d_arquivos (formato);

-- App lê com service_role; ninguém de fora passa pela sessão.
alter table public.impressao3d_arquivos enable row level security;

-- Permissão: a área nova `3d` (grade Pessoas › ficha › Acesso).
-- Matheus Dias segue com o acesso que já tinha ao assunto — o grant nasce
-- marcado pra ele; admins entram pelo papel, sem precisar de linha aqui.
update public.employees e
set permissoes = coalesce(e.permissoes, '{}'::jsonb) || '{"3d": true}'::jsonb
from public.profiles p
where p.id = e.id
  and p.name ilike '%matheus%dias%'
  and coalesce(e.permissoes -> '3d', 'false'::jsonb) <> 'true'::jsonb;

-- Confere:
-- select p.name, e.permissoes -> '3d' from public.employees e
-- join public.profiles p on p.id = e.id
-- where coalesce(e.permissoes -> '3d', 'false'::jsonb) = 'true'::jsonb;
