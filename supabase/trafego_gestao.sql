-- ══════════════════════════════════════════════════════════════════════════════
-- TRIDIFY · Registro de ações que mexem nas campanhas da Meta (SQL idempotente)
-- Pausar, reativar e alterar orçamento mexem em DINHEIRO REAL. Toda ação fica
-- registrada com quem fez, o que era antes e o que virou — sem isso não há como
-- responder "quem pausou a campanha que vendia?".
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.meta_acoes_campanha (
  id            uuid primary key default gen_random_uuid(),
  ad_account_id text not null,
  campaign_id   text not null,
  campaign_name text,
  acao          text not null,          -- pausar | ativar | orcamento
  valor_antes   text,                   -- status anterior, ou orçamento em centavos
  valor_depois  text,
  ok            boolean not null default true,
  erro          text,                   -- mensagem da Meta + fbtrace_id (sem token)
  -- Quem fez. Sem FK de propósito: se o colaborador for removido, o registro
  -- da ação PRECISA sobreviver.
  autor_id      uuid,
  autor_nome    text,
  created_at    timestamptz not null default now()
);

create index if not exists meta_acoes_campanha_camp on public.meta_acoes_campanha (campaign_id, created_at desc);
create index if not exists meta_acoes_campanha_data on public.meta_acoes_campanha (created_at desc);
create index if not exists meta_acoes_campanha_autor on public.meta_acoes_campanha (autor_id, created_at desc);

-- Ações passaram a valer p/ CONJUNTO (ad set) e ANÚNCIO, não só campanha
-- (aditivo — rode de novo sem medo). node_tipo = campaign|adset|ad; node_id/name
-- guardam o objeto real. campaign_id/name continuam preenchidos (compat/NOT NULL).
alter table public.meta_acoes_campanha add column if not exists node_tipo text;   -- campaign | adset | ad
alter table public.meta_acoes_campanha add column if not exists node_id   text;
alter table public.meta_acoes_campanha add column if not exists node_name text;
create index if not exists meta_acoes_campanha_node on public.meta_acoes_campanha (node_id, created_at desc);
