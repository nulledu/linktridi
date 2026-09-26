-- ─────────────────────────────────────────────────────────────────────────────
-- TridiFlow — DIÁRIO DE ENTREGA do webhook de leads
-- ─────────────────────────────────────────────────────────────────────────────
-- Rode no MESMO banco do TridiFlow (o do supabase/tridiflow.sql).
-- ADITIVO e IDEMPOTENTE: pode rodar mais de uma vez, nada existente muda.
--
-- Por que existe: o envio do lead é best-effort (o visitante nunca pode ver
-- erro de integração), então uma recusa do destino sumia — `console.error` só
-- aparece pra quem tem acesso ao log da Vercel, e no navegador não aparece
-- nada. Sem registro, "o lead não chegou" e "o lead nem foi enviado" são
-- indistinguíveis. Uma linha por TENTATIVA responde as duas de uma vez.
--
-- Também registra o caso "não enviei": escopo='nenhum' quando o funil concluiu
-- e não havia destino nenhum configurado.
--
-- Escrita: só no fim do funil (uma vez por lead), nunca em poll — ver a seção
-- "Dados" do CLAUDE.md.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tridiflow_entregas (
  id         bigserial   primary key,
  bot_id     uuid        references public.tridiflow_bots(id) on delete cascade,
  sessao_id  uuid,                                   -- lead (tridiflow_sessoes.id)
  escopo     text        not null default 'bot',     -- global | bot | nenhum
  destino    text        not null,                   -- URL que recebeu (ou '-')
  ok         boolean     not null default false,     -- destino respondeu 2xx
  status     int,                                    -- HTTP do destino (null = nem respondeu)
  erro       text,                                   -- falha de rede/timeout
  resposta   text,                                   -- corpo devolvido (300 chars)
  ms         int,                                    -- latência da última tentativa
  tentativas int         not null default 1,
  criado_em  timestamptz not null default now()
);

create index if not exists tridiflow_entregas_data_idx on public.tridiflow_entregas (criado_em desc);
create index if not exists tridiflow_entregas_bot_idx  on public.tridiflow_entregas (bot_id, criado_em desc);
-- "só o que falhou" é a consulta do dia ruim: índice parcial, não varre o resto.
create index if not exists tridiflow_entregas_falha_idx on public.tridiflow_entregas (criado_em desc) where not ok;

-- O app lê e escreve pelo service role (createSupabaseAdminClient), que passa
-- por cima da RLS. Ligar RLS SEM política nenhuma é o mais restrito possível:
-- a chave anônima (que roda no navegador do visitante do funil) não enxerga
-- nada aqui — e a resposta do destino pode carregar dado do lead.
alter table public.tridiflow_entregas enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- Lead sai ANTES de a pessoa terminar o funil
-- ─────────────────────────────────────────────────────────────────────────────
-- A maioria abandona no meio, e o telefone de quem abandonou vale igual — o
-- vendedor liga do mesmo jeito. Por isso o envio dispara assim que o número
-- aparece nas respostas, não só no `concluida`.
--
-- Esta coluna é a trava: uma sessão manda UM lead. Sem ela, cada resposta
-- seguinte do funil dispararia o mesmo lead de novo na fila do vendedor —
-- então enquanto a coluna não existir o envio parcial fica DESLIGADO e vale o
-- comportamento antigo (só na conclusão).
alter table public.tridiflow_sessoes
  add column if not exists lead_enviado_em timestamptz;

-- Quantos leads saíram sem a pessoa concluir (é o ganho desta mudança):
--
-- select count(*) filter (where concluida_em is null) as parciais,
--        count(*)                                     as total
--   from public.tridiflow_sessoes where lead_enviado_em is not null;

-- Higiene: o diário é operacional, não histórico. Apague o que passou de 30
-- dias quando quiser (ou agende no cron do Supabase).
--
-- delete from public.tridiflow_entregas where criado_em < now() - interval '30 days';
