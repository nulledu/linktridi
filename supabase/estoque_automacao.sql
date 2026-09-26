-- ── Estoque: configuração da automação de reposição ──────────────────────────
-- Rode no Supabase NOVO (o mesmo do estoque_itens / atividades).
-- Idempotente: rodar duas vezes não faz mal.
--
-- RODE O ARQUIVO INTEIRO, de uma vez (begin/commit protege contra ficar
-- parado no meio, com a tabela criada e a linha única ainda não inserida).

begin;

-- ── 1. Configuração (linha única) ────────────────────────────────────────────
-- `id boolean primary key check (id)` é o truque que garante UMA linha só:
-- só existe um valor possível pra chave primária (`true`), então um segundo
-- `insert` esbarra na PK e falha — não existe "qual configuração usar",
-- porque não existe uma segunda.
create table if not exists public.estoque_config (
  id                 boolean primary key default true check (id),
  automacao_ativa    boolean not null default false,
  ultima_varredura   date,
  atualizado_em      timestamptz not null default now(),
  atualizado_por     uuid
);

-- Nasce desligada de propósito: automação que cria atividade pra OUTRA pessoa
-- não se liga sozinha na primeira vez que este SQL roda. Quem liga é humano,
-- pela tela "Produção do dia".
insert into public.estoque_config (id) values (true) on conflict (id) do nothing;

-- ── 2. RLS ───────────────────────────────────────────────────────────────────
-- Acesso só via service role nas rotas /api/* — RLS bloqueia o resto.
alter table public.estoque_config enable row level security;

commit;
