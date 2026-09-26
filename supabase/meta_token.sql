-- Token Meta Ads (renovado automaticamente pelo cron /api/meta/refresh).
-- Linha única (id=1). Só o service_role acessa (RLS fecha o resto).
create table if not exists public.meta_token (
  id smallint primary key default 1,
  token text not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint meta_token_single check (id = 1)
);

alter table public.meta_token enable row level security;
-- Sem policies = ninguém via anon. O service_role ignora RLS.

-- Semente: cola aqui o token de 60 dias atual (o mesmo do .env.local).
insert into public.meta_token (id, token, expires_at)
values (1, 'COLE_AQUI_O_TOKEN_DE_60_DIAS', null)
on conflict (id) do nothing;
