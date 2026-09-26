-- ── Produção em cadeia ───────────────────────────────────────────────────────
--
-- Roda NA MÃO no SQL Editor do Supabase, como os demais. Re-rodável.
-- Pré-requisitos já rodados: bom_ficha_tecnica.sql (ficha_tecnica),
-- estoque_producao_receita.sql (receita no item), maquinas.sql
-- (maquina_programacoes), atividades.sql.
--
-- O motor de reposição passa a entender a CADEIA: só repõe item ativado,
-- verifica os materiais da ficha técnica (recursivo), trava a ordem quando
-- falta material ("aguardando_material"), cria a ordem do componente, e libera
-- o pai quando o estoque entra. `atividades.status` e
-- `maquina_programacoes.status` são text SEM check — "aguardando_material" e
-- "cancelada" são valores novos, nenhum alter de constraint.

-- O liga/desliga POR ITEM. Nasce desligado: só o que o dono ativar gera
-- atividade. Coluna ausente = comportamento antigo (todo item com mínimo).
alter table public.estoque_itens
  add column if not exists producao_automatica boolean not null default false;

-- A memória da dispensa: "não precisa fazer" segura a recriação ENQUANTO o
-- saldo não cair abaixo do que estava quando alguém dispensou. Caiu mais, a
-- falta é nova — o motor limpa a memória e cria de novo.
alter table public.estoque_itens add column if not exists reposicao_dispensada_saldo  int;
alter table public.estoque_itens add column if not exists reposicao_dispensada_em     timestamptz;
alter table public.estoque_itens add column if not exists reposicao_dispensada_por    text;
alter table public.estoque_itens add column if not exists reposicao_dispensada_motivo text;

-- O que habilita o Dispensar (atividade de gente se devolve, não se dispensa)
-- e a frase de origem que o card do tablet e o painel mostram
-- ("Estoque caiu a 8 (mínimo 20) — repõe até 50.").
alter table public.atividades add column if not exists criada_por_automacao boolean not null default false;
alter table public.atividades add column if not exists origem_frase text;

-- A automação não tem autor com perfil — a autoria dela mora em `por_nome`
-- ("Sistema (requisição)"). Com o NOT NULL, TODA atividade de reposição
-- automática falhava calada (23502) — medido no ensaio ao vivo de 2026-09-04.
alter table public.atividades alter column por_id drop not null;

-- ── A espera: o que falta pra esta ordem poder andar ─────────────────────────
-- Uma linha por (ordem × material em falta). É o índice da liberação (estoque
-- de X entrou → quem espera X?) e a transparência do painel. Dona é UMA das
-- duas filas: atividade (tablet) ou programação (máquina).
create table if not exists public.producao_esperas (
  id             uuid primary key default gen_random_uuid(),
  atividade_id   uuid references public.atividades(id) on delete cascade,
  programacao_id uuid references public.maquina_programacoes(id) on delete cascade,
  item_id        uuid not null references public.estoque_itens(id) on delete cascade,
  item_nome      text not null,
  falta          int  not null,
  criado_em      timestamptz not null default now(),
  check (falta > 0),
  check ((atividade_id is null) <> (programacao_id is null))
);
create index if not exists producao_esperas_item_idx  on public.producao_esperas (item_id);
create index if not exists producao_esperas_ativ_idx  on public.producao_esperas (atividade_id);
create index if not exists producao_esperas_prog_idx  on public.producao_esperas (programacao_id);

-- Como o resto do módulo: RLS ligado sem policy = só o service_role lê/escreve.
alter table public.producao_esperas enable row level security;
