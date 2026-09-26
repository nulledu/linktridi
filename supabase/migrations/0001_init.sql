-- Painel de Vendas — schema inicial.

create table if not exists salespeople (
  id text primary key,
  name text not null,
  photo_url text,
  team text not null check (team in ('marketing','comercial')),
  daily_sales numeric not null default 0,
  weekly_sales numeric not null default 0,
  monthly_sales numeric not null default 0,
  daily_goal numeric not null default 0,
  weekly_goal numeric not null default 0,
  monthly_goal numeric not null default 0
);

create table if not exists teams (
  id text primary key check (id in ('marketing','comercial')),
  name text not null,
  current numeric not null default 0,
  goal numeric not null default 0
);

create table if not exists products (
  id text primary key,
  name text not null,
  image_url text,
  qty numeric not null default 0,
  revenue numeric not null default 0
);

create table if not exists revenue (
  id int primary key default 1 check (id = 1),
  daily numeric not null default 0,
  weekly numeric not null default 0,
  monthly numeric not null default 0,
  trend_pct numeric not null default 0
);

create table if not exists config (
  id int primary key default 1 check (id = 1),
  data jsonb not null
);

-- RLS: leitura pública (anon) p/ o tv-app; escrita só autenticada.
alter table salespeople enable row level security;
alter table teams enable row level security;
alter table products enable row level security;
alter table revenue enable row level security;
alter table config enable row level security;

do $$
declare t text;
begin
  foreach t in array array['salespeople','teams','products','revenue','config']
  loop
    execute format('drop policy if exists "%s_read" on %I;', t, t);
    execute format('create policy "%s_read" on %I for select using (true);', t, t);
    execute format('drop policy if exists "%s_write" on %I;', t, t);
    execute format($p$create policy "%s_write" on %I for all to authenticated using (true) with check (true);$p$, t, t);
  end loop;
end $$;

-- Storage buckets (públicos p/ leitura de mídia no painel).
insert into storage.buckets (id, name, public) values
  ('photos','photos', true),
  ('sounds','sounds', true),
  ('branding','branding', true)
on conflict (id) do nothing;
