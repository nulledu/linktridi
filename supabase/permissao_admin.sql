-- ── Migração: "admin" vira PERMISSÃO ────────────────────────────────────────
-- Liga a permissão `admin` (acesso total) pra todo mundo que hoje é role=admin,
-- ANTES de remover o seletor de Papel — assim ninguém perde acesso. Idempotente.
-- (O código também mantém o fallback role='admin', então mesmo sem rodar isto os
-- admins atuais seguem com acesso; isto torna a PERMISSÃO a fonte da verdade.)

update public.employees e
set permissoes = jsonb_set(coalesce(e.permissoes, '{}'::jsonb), '{admin}', 'true'::jsonb)
from public.profiles p
where p.id = e.id and p.role = 'admin';

-- Garante linha em employees pra admin que ainda não tenha (raro), já com a flag.
insert into public.employees (id, permissoes)
select p.id, '{"admin": true}'::jsonb
from public.profiles p
where p.role = 'admin'
  and not exists (select 1 from public.employees e where e.id = p.id)
on conflict (id) do nothing;
