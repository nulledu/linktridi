-- To-do pessoal: data, prioridade e vínculos (pedido / solicitação). Rode no Supabase NOVO.
-- A tabela `todos` já existe (id, user_id, texto, feito, ordem, created_at, updated_at).

alter table public.todos add column if not exists data date;                 -- prazo da tarefa
alter table public.todos add column if not exists prioridade text;           -- baixa | normal | alta
alter table public.todos add column if not exists pedido_ref text;           -- nº/ref do pedido vinculado
alter table public.todos add column if not exists solicitacao_id uuid;       -- solicitação vinculada (central_solicitacoes)

create index if not exists todos_user_idx on public.todos (user_id, feito, data);
