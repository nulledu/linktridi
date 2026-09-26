-- ═════════════════════════════════════════════════════════════════════════════
--  CONFIGURAÇÃO DO FINANCEIRO — o que antes era número fixo no código
-- ═════════════════════════════════════════════════════════════════════════════
--
--  Uma linha por empresa. Quatro coisas que cada tela decidia sozinha, com um
--  número escrito no código, e que o dono não tinha como mudar sem pedir:
--
--  · o PREFIXO do código do patrimônio ("PAT-001");
--  · quantos DIAS antes um vencimento vira "vence em breve" na Visão Geral;
--  · as FORMAS DE PAGAMENTO sugeridas (PIX, Boleto, …) — eram texto livre, e
--    "Pix", "PIX" e "pix" viravam três coisas no filtro;
--  · o DIA PADRÃO de pagamento de quem entra na folha.
--
--  Rode DEPOIS de `supabase/financeiro.sql`. Idempotente.

create table if not exists public.fin_config (
  empresa_id          uuid primary key references public.fin_empresas(id) on delete cascade,
  patrimonio_prefixo  text not null default 'PAT',
  alerta_dias         int  not null default 7  check (alerta_dias between 1 and 90),
  formas_pagamento    text[] not null default array['PIX', 'Boleto', 'Cartão', 'Transferência', 'Dinheiro'],
  folha_dia_padrao    int  not null default 5  check (folha_dia_padrao between 1 and 31),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Toda empresa nasce com a linha: a tela lê com `maybeSingle` e cai nos
-- padrões se não houver, mas ter a linha desde já faz o primeiro "salvar" ser
-- um UPDATE comum — sem o caso especial de "ainda não existe".
insert into public.fin_config (empresa_id)
select id from public.fin_empresas
on conflict (empresa_id) do nothing;

drop trigger if exists fin_config_touch on public.fin_config;
create trigger fin_config_touch before update on public.fin_config
  for each row execute function public.fin_touch();

alter table public.fin_config enable row level security;

-- ── Conferência ──────────────────────────────────────────────────────────────
select e.nome, c.patrimonio_prefixo, c.alerta_dias, c.folha_dia_padrao, c.formas_pagamento
  from public.fin_empresas e
  left join public.fin_config c on c.empresa_id = e.id
 order by e.ordem;
