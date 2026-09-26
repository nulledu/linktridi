-- ── Tridify · Anotações na timeline (§5) ─────────────────────────────────────
-- Registra alterações que explicam mudanças nos números: aumento de orçamento,
-- troca de criativo, promoção, instabilidade no site, lançamento de campanha…
-- Tolerante: sem a tabela, o widget só não mostra/grava (nada quebra).

create table if not exists public.trafego_anotacoes (
  id          uuid primary key default gen_random_uuid(),
  dia         date not null default (now() at time zone 'America/Sao_Paulo')::date,
  tipo        text not null default 'outro',   -- orcamento | criativo | promocao | instabilidade | lancamento | outro
  texto       text not null,
  autor_id    uuid,
  autor_nome  text,
  created_at  timestamptz not null default now()
);

create index if not exists trafego_anotacoes_dia on public.trafego_anotacoes (dia desc, created_at desc);
