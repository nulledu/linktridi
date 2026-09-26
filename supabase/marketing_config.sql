-- Config de Marketing: teto de gasto + classificação carimbo/chancela das contas.
-- Rodar no Supabase NOVO (tzariztovuuwyeoogbxg).
create table if not exists public.marketing_config (
  id  int primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.marketing_config (id, data)
values (1, '{"teto":0,"contas":{}}'::jsonb)
on conflict (id) do nothing;
