-- Central — Mensagens, Solicitações e Suporte. Rode no Supabase NOVO.
-- Atividades foi cortado do escopo.

-- ── Solicitações ────────────────────────────────────────────────────────────
create table if not exists public.central_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null,
  autor_nome text,
  tipo text not null,                 -- Produto/peça | Estoque | Compra | Manutenção | Desenvolvimento | Financeiro | Outro
  setor_destino text not null,
  titulo text not null,
  descricao text,
  prioridade text not null default 'normal',  -- baixa | normal | alta | urgente
  status text not null default 'pendente',     -- pendente | aprovada | recusada | concluida
  motivo_recusa text,
  resolvido_por uuid,
  resolvido_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists central_solic_status_idx on public.central_solicitacoes (status);
create index if not exists central_solic_setor_idx on public.central_solicitacoes (setor_destino);

-- ── Suporte / Chamados ──────────────────────────────────────────────────────
create table if not exists public.central_chamados (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null,
  autor_nome text,
  tipo text not null,                 -- Bug | Dúvida | Melhoria | Erro de sistema | Problema com pedido | Problema com estoque
  titulo text not null,
  descricao text,
  pergunta_origem text,               -- o que a pessoa perguntou à "IA" antes de abrir
  status text not null default 'aberto',  -- aberto | fechado
  resolvido_por uuid,
  resolvido_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists central_chamado_status_idx on public.central_chamados (status);

-- ── Mensagens ───────────────────────────────────────────────────────────────
create table if not exists public.central_conversas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'grupo',  -- direta | grupo | setor
  nome text,                           -- p/ grupo/setor; direta deriva dos membros
  setor text,                          -- quando tipo = setor
  criada_por uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.central_conversa_membros (
  conversa_id uuid not null references public.central_conversas(id) on delete cascade,
  user_id uuid not null,
  favorita boolean not null default false,
  primary key (conversa_id, user_id)
);
-- Se a tabela já existir sem a coluna:
alter table public.central_conversa_membros add column if not exists favorita boolean not null default false;

create table if not exists public.central_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.central_conversas(id) on delete cascade,
  autor_id uuid not null,
  autor_nome text,
  texto text,
  imagem_url text,
  responde_a uuid references public.central_mensagens(id) on delete set null,
  fixada boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists central_msg_conversa_idx on public.central_mensagens (conversa_id, created_at);

create table if not exists public.central_reacoes (
  mensagem_id uuid not null references public.central_mensagens(id) on delete cascade,
  user_id uuid not null,
  emoji text not null,
  primary key (mensagem_id, user_id, emoji)
);

create table if not exists public.central_leituras (
  conversa_id uuid not null references public.central_conversas(id) on delete cascade,
  user_id uuid not null,
  lido_em timestamptz not null default now(),
  primary key (conversa_id, user_id)
);
