-- Peças por atividade + cooldown de devolução. Rode no Supabase NOVO.
--
-- PROBLEMA
--   "Devolver pra fila" só tinha motivos genéricos ("Falta material"). O gestor
--   via a ordem voltar, mas não QUAL peça faltou — e nada acontecia: a peça que
--   travou a produção continuava sem ser feita, então a próxima pessoa que
--   pegasse a mesma ordem travaria de novo, no mesmo ponto.
--
-- O QUE ISTO RESOLVE
--   1. `atividade_pecas` diz o que cada tarefa CONSOME e, pra cada peça, qual
--      tarefa a PRODUZ. Com isso o tablet oferece "Faltou: chapa 3 mm pintada"
--      em vez de "Falta material", e o servidor sabe o que despachar.
--   2. `liberada_apos` segura a ordem devolvida por um tempo. Sem isso ela volta
--      pro pool e cai no tablet do lado no segundo seguinte — a peça não ficou
--      pronta em 3 segundos, então é a mesma parede outra vez.
--
-- Por que uma tabela e não a `ficha_tecnica` (bom_ficha_tecnica.sql):
--   aquela liga ITEM DE ESTOQUE → componente. Aqui a chave é a TAREFA (texto),
--   que não tem vínculo com estoque_itens. Ligar as duas exigiria cadastrar cada
--   atividade como item — e a ficha_tecnica hoje está vazia e sem nenhum código
--   usando. Se um dia o estoque virar a fonte, esta tabela é a camada de mapa.

-- ── 1. Cooldown ──────────────────────────────────────────────────────────────
alter table public.atividades
  add column if not exists liberada_apos timestamptz;

comment on column public.atividades.liberada_apos is
  'Enquanto for maior que now(), a ordem não é oferecida a NINGUÉM (pull/claim a ignoram). Usado ao devolver: dá tempo da peça que faltou ser feita.';

-- Índice parcial: a fila filtra por isto em todo pull, mas só uma fração das
-- ordens tem cooldown ativo.
create index if not exists atividades_liberada_apos_idx
  on public.atividades (liberada_apos)
  where liberada_apos is not null;

-- ── 2. Peças de cada atividade ───────────────────────────────────────────────
create table if not exists public.atividade_pecas (
  id          uuid primary key default gen_random_uuid(),
  setor       text not null default 'Produção',
  -- Tarefa que CONSOME a peça. Texto, igual ao `atividades.tarefa` — é assim que
  -- o catálogo e as receitas já se identificam.
  tarefa      text not null,
  -- Nome da peça que pode faltar. Vira o rótulo do botão no tablet.
  peca        text not null,
  -- Tarefa que PRODUZ essa peça. NULL = ninguém produz aqui dentro (parafuso,
  -- borracha, feltro vêm de compra) — nesse caso a falta só é registrada.
  tarefa_produz    text,
  categoria_produz text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (setor, tarefa, peca)
);

create index if not exists atividade_pecas_tarefa_idx
  on public.atividade_pecas (setor, tarefa) where ativo;

alter table public.atividade_pecas enable row level security;

comment on table public.atividade_pecas is
  'O que cada tarefa consome. Semente em lib/atividades-pecas.ts (código); o que estiver AQUI vence, por tarefa. Editável em Produção › Peças por atividade.';

-- Conferir depois de rodar:
-- select tarefa, peca, tarefa_produz from public.atividade_pecas order by tarefa, peca;
-- select id, tarefa, motivo_impedimento, liberada_apos
--   from public.atividades
--  where liberada_apos > now() order by liberada_apos;
