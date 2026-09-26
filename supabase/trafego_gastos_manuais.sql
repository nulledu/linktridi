-- Tridify · gastos manuais de tráfego e BMs cadastradas à mão.
-- Idempotente: pode rodar de novo sem estrago.
--
-- trafego_bms: BM que ainda não aparece pela API do Meta (ou que nunca vai
-- aparecer: conta de outra plataforma, agência). As BMs do Meta NÃO moram aqui —
-- vêm do Graph (lib/meta-bm). O gasto guarda a CHAVE da BM ("meta:<id>" ou
-- "manual:<uuid>") e o nome do momento, pra não depender de um join.
--
-- trafego_gastos_manuais: o valor é BRUTO (sem imposto). O imposto de
-- importação (IMPOSTO_GASTO_PCT) é aplicado pelo snapshot em cima do gasto
-- total — Meta + manual —, igual à fatura do Meta.

create table if not exists public.trafego_bms (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_por uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists trafego_bms_nome_uq on public.trafego_bms (lower(nome));

create table if not exists public.trafego_gastos_manuais (
  id uuid primary key default gen_random_uuid(),
  valor numeric(12,2) not null check (valor > 0),
  data date not null,
  bm_chave text not null,
  bm_nome text not null,
  descricao text,
  criado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists trafego_gastos_manuais_data_idx on public.trafego_gastos_manuais (data);

-- App lê com service_role; ninguém de fora passa pela sessão.
alter table public.trafego_bms enable row level security;
alter table public.trafego_gastos_manuais enable row level security;
