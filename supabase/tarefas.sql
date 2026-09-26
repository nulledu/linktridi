-- ── Central de Trabalho · tarefas ────────────────────────────────────────────
-- Tarefas pessoais + atividades da empresa + itens vinculados (pedido, mensagem,
-- problema, compra…). Tudo é uma `tarefa` com um TIPO DE ORIGEM. Tolerante: sem a
-- tabela, a Central mostra vazio e a criação avisa (nada quebra em outros módulos).

create table if not exists public.tarefas (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  descricao      text,
  status         text not null default 'pendente',   -- pendente|em_andamento|aguardando|bloqueada|concluida|cancelada
  prioridade     text not null default 'media',      -- baixa|media|alta|urgente
  responsavel_id uuid,
  responsavel_nome text,
  criador_id     uuid,
  criador_nome   text,
  prazo          timestamptz,
  lembrar_em     timestamptz,
  origem_tipo    text not null default 'personal',   -- personal|activity|message|order|system_issue|purchase|inventory|customer
  origem_ref     text,                                -- ex.: "10432"
  origem_label   text,                                -- ex.: "Pedido #10432 · Shopee"
  origem_url     text,                                -- link direto pra entidade
  setor          text,
  tags           text[] not null default '{}',
  lista          text,                                -- lista custom (Produção/Comercial/…)
  subtarefas     jsonb not null default '[]',         -- [{id,titulo,feita}]
  bloqueada_por  text,                                -- descrição da dependência
  concluida_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists tarefas_responsavel on public.tarefas (responsavel_id, status);
create index if not exists tarefas_criador on public.tarefas (criador_id);
create index if not exists tarefas_prazo on public.tarefas (prazo);
create index if not exists tarefas_lista on public.tarefas (lista);
