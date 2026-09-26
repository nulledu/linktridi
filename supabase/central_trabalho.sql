-- ══════════════════════════════════════════════════════════════════════════════
-- CENTRAL DE TRABALHO — SQL ÚNICO (rodar 1x; idempotente, pode rodar de novo)
-- Cria: tarefas + comentários + histórico, e MIGRA as tarefas antigas (`todos`)
-- sem perder nada (as antigas continuam na tabela todos; a migração copia).
-- ══════════════════════════════════════════════════════════════════════════════

-- 1) Tarefas (núcleo). Tarefa pessoal / atividade / item vinculado — tudo é uma
--    tarefa com um TIPO DE ORIGEM (personal|activity|message|order|system_issue|
--    purchase|inventory|customer|production|commercial|logistics).
create table if not exists public.tarefas (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  descricao      text,
  status         text not null default 'pendente',   -- pendente|em_andamento|aguardando|bloqueada|concluida|cancelada
  prioridade     text not null default 'media',      -- nenhuma|baixa|media|alta|urgente
  responsavel_id uuid,
  responsavel_nome text,
  criador_id     uuid,
  criador_nome   text,
  prazo          timestamptz,
  lembrar_em     timestamptz,
  origem_tipo    text not null default 'personal',
  origem_ref     text,
  origem_label   text,
  origem_url     text,
  setor          text,
  tags           text[] not null default '{}',
  lista          text,
  subtarefas     jsonb not null default '[]',         -- [{id,titulo,feita}]
  anexos         jsonb not null default '[]',         -- [{nome,url}]
  bloqueada_por  text,
  gravidade      text,                                -- problemas: baixa|media|alta|critica
  contexto       jsonb,                               -- auto-captura (url, navegador, tema…)
  avisar_conclusao boolean not null default false,    -- delegada: avisar o criador ao concluir
  legacy_todo_id text unique,                         -- id da tarefa antiga (todos) migrada
  concluida_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- (se a tabela já existia da fase 1, garante as colunas novas)
alter table public.tarefas add column if not exists anexos jsonb not null default '[]';
alter table public.tarefas add column if not exists gravidade text;
alter table public.tarefas add column if not exists contexto jsonb;
alter table public.tarefas add column if not exists avisar_conclusao boolean not null default false;
alter table public.tarefas add column if not exists legacy_todo_id text unique;

create index if not exists tarefas_responsavel on public.tarefas (responsavel_id, status);
create index if not exists tarefas_criador on public.tarefas (criador_id);
create index if not exists tarefas_prazo on public.tarefas (prazo);
create index if not exists tarefas_lista on public.tarefas (lista);
create index if not exists tarefas_origem on public.tarefas (origem_tipo, origem_ref);

-- 2) Comentários (por tarefa).
create table if not exists public.tarefa_comentarios (
  id          uuid primary key default gen_random_uuid(),
  tarefa_id   uuid not null,
  autor_id    uuid,
  autor_nome  text,
  texto       text not null,
  created_at  timestamptz not null default now()
);
create index if not exists tarefa_comentarios_t on public.tarefa_comentarios (tarefa_id, created_at);

-- 3) Histórico (linha do tempo de alterações).
create table if not exists public.tarefa_historico (
  id          uuid primary key default gen_random_uuid(),
  tarefa_id   uuid not null,
  autor_id    uuid,
  autor_nome  text,
  acao        text not null,        -- criou|status|prioridade|prazo|responsavel|comentou|concluiu|reabriu
  detalhe     text,                 -- ex.: "Pendente → Em andamento"
  created_at  timestamptz not null default now()
);
create index if not exists tarefa_historico_t on public.tarefa_historico (tarefa_id, created_at);

-- 4) MIGRAÇÃO das tarefas antigas (tabela `todos` → `tarefas`). Idempotente:
--    só copia o que ainda não foi migrado (legacy_todo_id). Preserva texto, data,
--    prioridade, feito, dono e vínculo com pedido. A tabela todos fica intacta.
-- Tolerante ao schema: lê via to_jsonb, então funciona mesmo se `todos` não tiver
-- prioridade/data/pedido_ref/created_at (versões antigas da tabela).
do $$
begin
  if to_regclass('public.todos') is not null then
    insert into public.tarefas
      (titulo, status, prioridade, responsavel_id, criador_id, prazo,
       origem_tipo, origem_ref, origem_label, legacy_todo_id, concluida_at, created_at)
    select
      coalesce(s.j->>'texto', ''),
      case when coalesce((s.j->>'feito')::boolean, false) then 'concluida' else 'pendente' end,
      case when lower(coalesce(s.j->>'prioridade','')) in ('baixa','media','alta','urgente','nenhuma') then lower(s.j->>'prioridade') else 'media' end,
      (s.j->>'user_id')::uuid, (s.j->>'user_id')::uuid,
      case when s.j->>'data' is not null then ((s.j->>'data')::timestamptz + interval '12 hours') else null end,
      case when coalesce(s.j->>'pedido_ref','') <> '' then 'order' else 'personal' end,
      nullif(s.j->>'pedido_ref', ''),
      case when coalesce(s.j->>'pedido_ref','') <> '' then 'Pedido #' || (s.j->>'pedido_ref') else null end,
      s.j->>'id',
      case when coalesce((s.j->>'feito')::boolean, false) then now() else null end,
      coalesce((s.j->>'created_at')::timestamptz, now())
    from (select to_jsonb(t.*) as j from public.todos t) s
    where coalesce(s.j->>'texto','') <> ''
      and not exists (select 1 from public.tarefas x where x.legacy_todo_id = s.j->>'id');
  end if;
end $$;
