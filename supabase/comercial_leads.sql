-- Leads do comercial (individuais, com telefone). Rodar no Supabase NOVO.
create table if not exists public.comercial_leads (
  id         uuid primary key default gen_random_uuid(),
  telefone   text not null,
  data       date not null default (now() at time zone 'America/Sao_Paulo')::date,
  fonte      text,
  vendido    boolean not null default false,   -- "certo": virou venda
  vendido_at timestamptz,
  por_nome   text,
  created_at timestamptz not null default now()
);

-- telefone normalizado (só dígitos) p/ casar com a venda
create index if not exists comercial_leads_tel_idx on public.comercial_leads (telefone);
create index if not exists comercial_leads_data_idx on public.comercial_leads (data desc);
