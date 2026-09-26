-- Métricas da Central de Tutoriais: quantas visitas cada guia teve e quantas
-- pessoas disseram que ele resolveu.
--
-- POR DIA, não por evento: uma linha por (central, tutorial, dia) mantém a
-- tabela pequena para sempre e ainda deixa ver a série. Um INSERT por
-- visualização encheria de linhas uma tabela que ninguém lê por evento.
--
-- Rode uma vez no SQL Editor do Supabase.

create table if not exists tutorial_metricas (
  bot_id   uuid not null references tridiflow_bots(id) on delete cascade,
  handle   text not null,
  dia      date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  vistas   integer not null default 0,
  uteis    integer not null default 0,
  inuteis  integer not null default 0,
  primary key (bot_id, handle, dia)
);

create index if not exists tutorial_metricas_bot_dia on tutorial_metricas (bot_id, dia desc);

-- Soma atômica. Sem isto o "ler, somar 1, gravar" do app perde contagem
-- sempre que duas pessoas abrem o mesmo tutorial no mesmo instante.
create or replace function incrementar_metrica_tutorial(
  p_bot uuid, p_handle text, p_campo text, p_quanto integer default 1
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_campo not in ('vistas', 'uteis', 'inuteis') then
    raise exception 'campo invalido: %', p_campo;
  end if;
  insert into tutorial_metricas (bot_id, handle, dia, vistas, uteis, inuteis)
  values (
    p_bot, left(p_handle, 200), ((now() at time zone 'America/Sao_Paulo')::date),
    case when p_campo = 'vistas'  then p_quanto else 0 end,
    case when p_campo = 'uteis'   then p_quanto else 0 end,
    case when p_campo = 'inuteis' then p_quanto else 0 end
  )
  on conflict (bot_id, handle, dia) do update set
    vistas  = tutorial_metricas.vistas  + case when p_campo = 'vistas'  then p_quanto else 0 end,
    uteis   = tutorial_metricas.uteis   + case when p_campo = 'uteis'   then p_quanto else 0 end,
    inuteis = tutorial_metricas.inuteis + case when p_campo = 'inuteis' then p_quanto else 0 end;
end;
$$;

-- A tabela é escrita SÓ pelo servidor (service_role, que ignora RLS). Nenhuma
-- política liberando anon: o voto entra pela rota do app, nunca pelo cliente.
alter table tutorial_metricas enable row level security;
