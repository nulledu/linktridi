-- ─────────────────────────────────────────────────────────────────────────────
-- Ponto · TURNOS (predefinições de horário) + horário de almoço
-- ─────────────────────────────────────────────────────────────────────────────
-- Rode no banco do ERP (o mesmo das outras migrações de ponto).
--
-- ADITIVO e IDEMPOTENTE. Duas coisas:
--
--  1. `ponto_turnos` — os horários da empresa cadastrados uma vez e reusados.
--     Antes cada pessoa tinha entrada/saída solta no cadastro, então mudar o
--     turno de um grupo era editar pessoa por pessoa, e não existia almoço.
--
--  2. Almoço no cadastro da pessoa. Sem ele o banco de horas não conseguia
--     saber se alguém esticou o almoço: a tolerância da CLT é de 5 min POR
--     MARCAÇÃO, e sem horário previsto de almoço/retorno essas duas marcações
--     passavam sem conferência (só o total do dia era checado).
--
-- O turno é uma PREDEFINIÇÃO: ao aplicar numa pessoa, os campos dela
-- (entrada/saída/almoço/jornada) são preenchidos a partir dele. As colunas da
-- pessoa continuam sendo a verdade usada no cálculo — assim nada do código
-- atual precisou mudar de fonte, e dá pra ajustar uma pessoa fora do padrão.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.ponto_turnos (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  entrada        text not null,          -- "HH:MM"
  saida          text not null,
  almoco_inicio  text,                   -- null = turno sem almoço
  almoco_fim     text,
  -- Sábado: quem trabalha tem horário próprio. Regra da casa: NINGUÉM almoça
  -- no sábado, por isso não existe almoço aqui.
  trabalha_sabado boolean not null default false,
  sabado_entrada  text,
  sabado_saida    text,
  ordem          int  not null default 0,
  ativo          boolean not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists ponto_turnos_ordem on public.ponto_turnos (ativo, ordem, nome);

-- Almoço + turno no cadastro da pessoa.
alter table public.ponto_pessoas add column if not exists almoco_inicio text;   -- "HH:MM"
alter table public.ponto_pessoas add column if not exists almoco_fim    text;
alter table public.ponto_pessoas add column if not exists turno_id      uuid references public.ponto_turnos(id) on delete set null;

-- ── Turnos da empresa ────────────────────────────────────────────────────────
-- `on conflict do nothing` pelo nome: reexecutar não duplica nem sobrescreve o
-- que a equipe tiver editado depois.
create unique index if not exists ponto_turnos_nome_uk on public.ponto_turnos (nome);

insert into public.ponto_turnos (nome, entrada, saida, almoco_inicio, almoco_fim, trabalha_sabado, sabado_entrada, sabado_saida, ordem) values
  ('07:00–16:00 · almoço 12:00–13:00', '07:00', '16:00', '12:00', '13:00', true,  '07:00', '11:00', 10),
  ('07:00–16:48 · almoço 11:30–12:30', '07:00', '16:48', '11:30', '12:30', false, null,    null,    20),
  ('07:00–14:00 · almoço 12:00–13:00', '07:00', '14:00', '12:00', '13:00', false, null,    null,    30),
  ('07:00–13:00 · sem almoço',         '07:00', '13:00', null,    null,    false, null,    null,    40),
  ('07:30–13:00 · sem almoço',         '07:30', '13:00', null,    null,    true,  '07:30', '10:00', 50),
  ('08:00–17:00 · almoço 12:00–13:00', '08:00', '17:00', '12:00', '13:00', true,  '08:00', '12:00', 60),
  ('08:00–15:00 · almoço 12:00–13:00', '08:00', '15:00', '12:00', '13:00', false, null,    null,    70),
  ('13:00–17:00 · sem almoço',         '13:00', '17:00', null,    null,    false, null,    null,    80)
on conflict (nome) do nothing;

-- ── Encaixe automático de quem já está cadastrado ────────────────────────────
-- Casa SÓ quando entrada E saída batem exatamente com um turno. Quem não bater
-- (horário em branco, horário fora do padrão) fica SEM turno de propósito, pra
-- alguém decidir — melhor um vazio visível que um palpite errado na folha.
update public.ponto_pessoas p
   set turno_id      = t.id,
       almoco_inicio = t.almoco_inicio,
       almoco_fim    = t.almoco_fim
  from public.ponto_turnos t
 where p.turno_id is null
   and p.ativo
   and p.entrada_prevista = t.entrada
   and p.saida_prevista   = t.saida;

-- Confere quem ficou de fora (rode depois de aplicar):
--
-- select nome, entrada_prevista, saida_prevista, jornada_min, trabalha_sabado
--   from public.ponto_pessoas
--  where ativo and turno_id is null
--  order by nome;
