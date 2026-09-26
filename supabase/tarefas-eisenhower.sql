-- ── Central de Trabalho · Matriz de Eisenhower ───────────────────────────────
-- A matriz NÃO é um sistema separado: é uma visão das mesmas tarefas. Só dois
-- campos novos, ambos opcionais — tarefa sem eles continua funcionando igual
-- (a interface mostra o quadrante SUGERIDO a partir de prioridade + prazo).
-- Idempotente: pode rodar quantas vezes quiser.

alter table public.tarefas add column if not exists importancia text;   -- 'alta' | 'baixa' | null (não definido)
alter table public.tarefas add column if not exists urgencia    text;   -- 'alta' | 'baixa' | null (não definido)

-- Filtro por quadrante (a visão lê os dois juntos).
create index if not exists tarefas_eisenhower on public.tarefas (importancia, urgencia);
