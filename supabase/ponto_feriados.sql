-- Feriados do ponto: dias que são folga pra todo mundo (banco de horas não cobra
-- a jornada nesses dias). O admin marca/desmarca pela tela de Banco de horas.
create table if not exists ponto_feriados (
  dia         date primary key,
  descricao   text,
  created_at  timestamptz not null default now()
);
