-- Sistema de notificações. Rode no Supabase NOVO.
-- Cada notificação é de UM usuário. Push do admin cria N linhas (uma por destinatário).

create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                  -- destinatário
  tipo text not null default 'sistema',   -- mensagem | tarefa | lembrete | solicitacao | sistema | admin
  titulo text not null,
  corpo text,
  link text,                              -- pra onde leva ao clicar (ex: /central/mensagens)
  lida boolean not null default false,
  de_nome text,                           -- quem disparou (opcional)
  created_at timestamptz not null default now()
);
create index if not exists notificacoes_user_idx on public.notificacoes (user_id, lida, created_at desc);
