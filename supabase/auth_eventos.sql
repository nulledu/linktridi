-- ── Auth: registro de acessos ────────────────────────────────────────────────
-- Rode no Supabase NOVO (o mesmo do ERP / profiles).
-- Idempotente: rodar duas vezes não faz mal.
--
-- POR QUE: hoje não existe NENHUM registro de quem entrou, quando, de onde. Sem
-- isso não dá pra responder "alguém usou a conta da fulana?" nem pra ligar o
-- bloqueio por país com segurança — porque não se sabe de onde as pessoas de
-- fato acessam. É esta tabela que transforma "acho que só acessam do Brasil" em
-- dado.
--
-- O código é TOLERANTE à ausência dela: sem a tabela, o login funciona igual e
-- simplesmente não registra. Gravar aqui NUNCA pode impedir alguém de entrar.
--
-- RODE O ARQUIVO INTEIRO de uma vez.

begin;

create table if not exists public.auth_eventos (
  id          bigserial primary key,
  criado_em   timestamptz not null default now(),
  -- Quem. `perfil_id` fica nulo quando a tentativa nem chegou a um perfil
  -- (username inexistente) — o `identificador` guarda o que foi digitado.
  perfil_id   uuid,
  identificador text,
  -- O que aconteceu.
  evento      text not null check (evento in ('login_ok','login_falha','primeiro_acesso','senha_trocada','bloqueado_geo','bloqueado_freio')),
  -- De onde.
  ip          text,
  pais        text,
  user_agent  text,
  -- Marcado quando o país está fora da lista permitida (mesmo sem bloquear).
  de_fora     boolean not null default false
);

-- Consulta típica: "os acessos desta pessoa" e "o que veio de fora".
create index if not exists auth_eventos_perfil_idx on public.auth_eventos (perfil_id, criado_em desc);
create index if not exists auth_eventos_criado_idx on public.auth_eventos (criado_em desc);
create index if not exists auth_eventos_fora_idx   on public.auth_eventos (de_fora, criado_em desc) where de_fora;

-- Isenção de geo por pessoa: quem viaja continua entrando mesmo com o bloqueio
-- ligado. Sem uma saída por pessoa, a primeira viagem vira um chamado que
-- ninguém consegue atender — porque quem atenderia está fora do país.
alter table public.profiles
  add column if not exists geo_livre boolean not null default false;

commit;

-- ── Como usar ────────────────────────────────────────────────────────────────
-- De onde as pessoas acessaram nos últimos 14 dias (é isto que decide se dá pra
-- ligar o bloqueio):
--
--   select pais, count(*), count(distinct perfil_id) as pessoas
--     from public.auth_eventos
--    where evento = 'login_ok' and criado_em > now() - interval '14 days'
--    group by pais order by 2 desc;
--
-- Acessos de fora, com nome:
--
--   select e.criado_em, p.username, e.pais, e.ip
--     from public.auth_eventos e left join public.profiles p on p.id = e.perfil_id
--    where e.de_fora and e.criado_em > now() - interval '14 days'
--    order by e.criado_em desc;
--
-- Liberar alguém que viaja:
--   update public.profiles set geo_livre = true where username = 'fulano';
--
-- Higiene: a tabela cresce. Limpar o que passou de 180 dias:
--   delete from public.auth_eventos where criado_em < now() - interval '180 days';
