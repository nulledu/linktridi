-- Captura de leads X1 (via webhook /api/webhooks/leads-x1).
-- Adiciona colunas extras na tabela de leads do comercial. Rode no Supabase NOVO.

alter table public.comercial_leads
  add column if not exists tipo    text not null default 'comum',  -- 'comum' | 'x1'
  add column if not exists nome    text,
  add column if not exists fonte   text,                            -- ex: 'facebook'
  add column if not exists payload jsonb;                           -- corpo bruto do webhook

-- Consultas por tipo (ex: só os leads X1) ficam rápidas.
create index if not exists comercial_leads_tipo_idx on public.comercial_leads (tipo);

-- (Opcional) Garante que não duplique o mesmo telefone no mesmo dia.
create unique index if not exists comercial_leads_tel_dia_uniq
  on public.comercial_leads (telefone, data);
